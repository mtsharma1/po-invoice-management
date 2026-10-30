const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname,'..');
const history = 'webSchemaMigrations';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Split SQL outside quoted literals and comments. Stored routines can be added
// in a .cjs migration with query(oneCompleteStatement), without DELIMITER commands.
function splitSql(text) {
  const statements=[]; let current='', quote='', comment='';
  for(let i=0;i<text.length;i++) {
    const c=text[i], next=text[i+1];
    if(comment==='line') { if(c==='\n'){comment='';current+='\n';} continue; }
    if(comment==='block') {if(c==='*'&&next==='/'){comment='';i++;current+=' ';} continue;}
    if(quote) {
      current+=c;
      if(c==='\\'&&next){current+=next;i++;}
      else if(c===quote){if(next===quote){current+=next;i++;}else quote='';}
      continue;
    }
    if(c==='-'&&next==='-'&&/\s/.test(text[i+2]||' ')){comment='line';i++;continue;}
    if(c==='#'){comment='line';continue;}
    if(c==='/'&&next==='*'){comment='block';i++;continue;}
    if("'\"`".includes(c)){quote=c;current+=c;continue;}
    if(c===';'){if(current.trim())statements.push(current.trim());current='';}else current+=c;
  }
  if(quote||comment==='block')throw new Error('Unterminated SQL quote/comment.');
  if(current.trim())statements.push(current.trim());
  return statements;
}

async function readMigrations(directory=path.join(root,'database/migrations')) {
  const names=(await fs.readdir(directory)).filter(name=>name.endsWith('.cjs')).sort();
  const migrations=[];
  for(const name of names){
    const file=path.join(directory,name), migration=require(file);
    if(typeof migration.up!=='function')throw new Error(`Migration ${name} must export up().`);
    const buffers=[(await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n')];
    for(const dependency of migration.files||[]) {
      if(path.basename(dependency)!==dependency)throw new Error('Migration dependencies must be sibling files.');
      buffers.push((await fs.readFile(path.join(directory,dependency),'utf8')).replace(/\r\n/g,'\n'));
    }
    migrations.push({id:name.slice(0,-4),checksum:hash(JSON.stringify(buffers)),up:migration.up});
  }
  return migrations;
}

async function runMigrations(connection,{generate=false,dryRun=false,status=false,log=console.log,migrations,baseline}={}) {
  const query=async(sql,args=[]) => (await connection.query(sql,args))[0];
  const tables=await query('SELECT TABLE_NAME AS tableName FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  const names=new Set(tables.map(row=>String(row.tableName).toLowerCase()));
  const applied=names.has(history.toLowerCase())?await query(`SELECT MigrationID, Checksum, State FROM ${history}`):[];
  const records=new Map(applied.map(row=>[row.MigrationID,row]));
  migrations ||= await readMigrations();
  baseline ??= await fs.readFile(path.join(root,'database/schema.sql'),'utf8');
  const baseID='000_initial_schema';
  const initialized=records.get(baseID)?.State==='applied';
  const hasBusinessTables=[...names].some(name=>name!==history.toLowerCase());
  if(generate && hasBusinessTables && !records.has(baseID))throw new Error('Database already contains tables/views. Use npm run db:migrate; db:generate is for an empty database.');
  if(!generate&&!['tblPOHeaders','tblPODetails','tblInvoiceHeader'].every(name=>names.has(name.toLowerCase()))) {
    throw new Error('Core tables are missing. Use npm run db:generate for an empty database, or restore the original schema first.');
  }
  const runSql=async(sql)=>{for(const statement of splitSql(sql))await query(statement);};
  const ensureColumn=async(table,column,type)=>{
    if(!/^\w+$/.test(table)||!/^\w+$/.test(column))throw new Error('Invalid migration identifier.');
    const rows=await query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',[table,column]);
    if(!rows.length)await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`);
  };
  const plan=[...(generate&&!initialized?[{id:baseID,checksum:hash(baseline.replace(/\r\n/g,'\n')),up:()=>runSql(baseline)}]:[]),...migrations];
  for(const migration of plan){
    const record=records.get(migration.id);
    if(record&&record.Checksum!==migration.checksum)throw new Error(`Migration ${migration.id} changed after it was recorded. Restore it and add a new migration.`);
  }
  if(dryRun||status){for(const migration of plan)log(`${records.get(migration.id)?.State||'pending'}  ${migration.id}`);return;}
  const lock='teakwood:migrate:'+hash(String(connection.config?.database||'default')).slice(0,32);
  const lockRows=await query('SELECT GET_LOCK(?, 0) AS acquired',[lock]);
  if(Number(lockRows[0]?.acquired)!==1)throw new Error('Another database migration is running. Try again later.');
  try {
    await query(`CREATE TABLE IF NOT EXISTS ${history} (
      MigrationID VARCHAR(190) NOT NULL PRIMARY KEY, Checksum CHAR(64) NOT NULL,
      State VARCHAR(20) NOT NULL, AppliedAt DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    // Re-read after acquiring the lock, in case another invocation finished meanwhile.
    const current=new Map((await query(`SELECT MigrationID, Checksum, State FROM ${history}`)).map(row=>[row.MigrationID,row]));
    for(const migration of plan){
      const record=current.get(migration.id);
      if(record&&record.Checksum!==migration.checksum)throw new Error(`Migration ${migration.id} checksum mismatch.`);
      if(record?.State==='applied'){log(`Skipped ${migration.id} (already applied)`);continue;}
      await query(`INSERT INTO ${history} (MigrationID, Checksum, State) VALUES (?, ?, 'running')
        ON DUPLICATE KEY UPDATE State = 'running'`,[migration.id,migration.checksum]);
      log(`Applying ${migration.id}...`);
      await migration.up({query,ensureColumn,runSql});
      await query(`UPDATE ${history} SET State = 'applied', AppliedAt = CURRENT_TIMESTAMP WHERE MigrationID = ?`,[migration.id]);
      log(`Applied ${migration.id}`);
    }
  } finally {await query('SELECT RELEASE_LOCK(?)',[lock]);}
}

async function main(argv=process.argv.slice(2)) {
  const allowed=new Set(['--generate','--dry-run','--status','--help']);
  if(argv.some(arg=>!allowed.has(arg)))throw new Error('Unknown argument. Use --help.');
  if(argv.includes('--help')){console.log('npm run db:migrate [-- --status|--dry-run]\nnpm run db:generate [-- --dry-run]\nUses MYSQL_* from the project environment (production by default).');return;}
  require('@next/env').loadEnvConfig(root,process.env.NODE_ENV==='development');
  const missing=['MYSQL_HOST','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD'].filter(name=>!process.env[name]);
  if(missing.length)throw new Error(`Missing environment values: ${missing.join(', ')}`);
  const connection=await require('mysql2/promise').createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT||3306),database:process.env.MYSQL_DATABASE,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,connectTimeout:10000});
  try {
    console.log(`Database: ${process.env.MYSQL_DATABASE} on ${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT||3306}`);
    await runMigrations(connection,{generate:argv.includes('--generate'),dryRun:argv.includes('--dry-run'),status:argv.includes('--status')});
    console.log(argv.includes('--dry-run')||argv.includes('--status')?'Inspection complete; no changes made.':'Database schema is up to date.');
  } finally {await connection.end();}
}
module.exports={splitSql,readMigrations,runMigrations,main};
if(require.main===module)main().catch(error=>{console.error(`Database migration failed: ${error.message}\nMySQL DDL may be partially applied. Fix the error and rerun the same command.`);process.exitCode=1;});
