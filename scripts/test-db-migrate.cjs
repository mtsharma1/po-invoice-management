const assert=require('node:assert/strict');
const {splitSql,readMigrations,runMigrations}=require('./db-migrate');
const fs=require('node:fs/promises');
function database(existing=true){
 const tables=new Set(existing?['tblPOHeaders','tblPODetails','tblInvoiceHeader']:[]), columns=new Set(), records=new Map(), writes=[];
 let locked=true, failOnce=false, failTable='';
 const connection={config:{database:'test_only'},query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT TABLE_NAME'))return [[...tables].map(tableName=>({tableName}))];
  if(sql.startsWith('SELECT MigrationID'))return [[...records.values()]];
  if(sql.startsWith('SELECT COLUMN_NAME'))return [columns.has(args.join('.'))?[{COLUMN_NAME:args[1]}]:[]];
  if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:locked?1:0}]];
  if(sql.startsWith('SELECT RELEASE_LOCK'))return [[{released:1}]];
  writes.push(sql);
  if(failTable&&sql.startsWith(`CREATE TABLE IF NOT EXISTS ${failTable} `)){failTable='';throw new Error('Simulated baseline failure');}
  if(sql.startsWith('CREATE TABLE'))tables.add(sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]);
  else if(sql.startsWith('CREATE OR REPLACE VIEW'))tables.add(sql.match(/VIEW (\w+)/)[1]);
  else if(sql.startsWith('ALTER TABLE')){
   if(failOnce){failOnce=false;throw new Error('Simulated DDL failure');}
   const [,table,col]=sql.match(/ALTER TABLE `(\w+)` ADD COLUMN `(\w+)`/);columns.add(table+'.'+col);
  } else if(sql.startsWith('INSERT INTO webSchemaMigrations'))records.set(args[0],{MigrationID:args[0],Checksum:args[1],State:'running'});
  else if(sql.startsWith('UPDATE webSchemaMigrations'))records.get(args[0]).State='applied';
  else throw new Error('Unexpected SQL: '+sql);
  return [{affectedRows:1}];
 }};
 return {connection,tables,columns,records,writes,setLocked:value=>{locked=value;},failNextAlter:()=>{failOnce=true;},failCreating:name=>{failTable=name;}};
}
(async()=>{
 const migrations=await readMigrations(), baseline=await fs.readFile('database/schema.sql','utf8');
 const options={migrations,baseline,log:()=>{}};
 assert.deepEqual(splitSql("-- comment;\nSELECT 'a;b'; SELECT `c;d`; /* ignored; */ SELECT 'it''s';"),["SELECT 'a;b'",'SELECT `c;d`',"SELECT 'it''s'"]);
 assert.throws(()=>splitSql("SELECT 'unterminated"));
 const existing=database();
 await runMigrations(existing.connection,{...options,dryRun:true});assert.equal(existing.writes.length,0);
 await runMigrations(existing.connection,{...options,status:true});assert.equal(existing.writes.length,0);
 await runMigrations(existing.connection,options);
 for(const name of ['webInvoiceTaxSnapshots','webWhitebooksProductionIrn','webTmpPODetails','webInvoiceEwayBillTransport'])assert.ok(existing.tables.has(name));
 assert.ok(existing.columns.has('tblPODetails.BuyingTaxCGSTAmount'));
 assert.ok(existing.columns.has('tblInvoiceHeader.TaxDetailsVersion'));
 assert.ok(existing.writes.every(sql=>!/^DROP|^TRUNCATE|^DELETE|^UPDATE tbl|^INSERT INTO tbl/i.test(sql)),'business data must remain unchanged');
 const alterCount=existing.writes.filter(sql=>sql.startsWith('ALTER')).length;
 await runMigrations(existing.connection,options);
 assert.equal(existing.writes.filter(sql=>sql.startsWith('ALTER')).length,alterCount,'second run skips applied migration');
 await assert.rejects(runMigrations(existing.connection,{...options,migrations:[{...migrations[0],checksum:'changed'}]}),/changed after/);
 const failed=database();failed.failNextAlter();
 await assert.rejects(runMigrations(failed.connection,options),/Simulated DDL failure/);
 assert.equal(failed.records.get(migrations[0].id).State,'running');
 await runMigrations(failed.connection,options);assert.equal(failed.records.get(migrations[0].id).State,'applied');
 const busy=database();busy.setLocked(false);await assert.rejects(runMigrations(busy.connection,options),/Another database migration/);assert.equal(busy.writes.length,0);
 const empty=database(false);
 await assert.rejects(runMigrations(empty.connection,options),/Core tables are missing/);
 await runMigrations(empty.connection,{...options,generate:true,dryRun:true});assert.equal(empty.writes.length,0);
 await runMigrations(empty.connection,{...options,generate:true});
 const partial=database(false);partial.failCreating('tblPODetails');
 await assert.rejects(runMigrations(partial.connection,{...options,generate:true}),/Simulated baseline failure/);
 assert.equal(partial.records.get('000_initial_schema').State,'running');
 await runMigrations(partial.connection,{...options,generate:true});
 assert.equal(partial.records.get('000_initial_schema').State,'applied');
 for(const name of ['tblPOHeaders','tblPODetails','tblDispatch','tblInvoiceHeader','tblShellOrders','tblUsers','vwDispatchDetails','webInvoiceTaxSnapshots'])assert.ok(empty.tables.has(name),name);
 assert.equal(empty.records.get('000_initial_schema').State,'applied');
 await runMigrations(empty.connection,{...options,generate:true});
 const occupied=database();await assert.rejects(runMigrations(occupied.connection,{...options,generate:true}),/already contains/);assert.equal(occupied.writes.length,0);
 console.log('Passed fresh schema generation, existing-database upgrades, repeat runs, read-only plans/status, checksum protection, migration locking, failure recovery and existing-data protection. Mock MySQL only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
