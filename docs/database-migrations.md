# Database setup and updates

Run these commands from the project folder after installing dependencies with
`npm ci`. They use the configured `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`,
`MYSQL_USER` and `MYSQL_PASSWORD`. Next.js environment files are loaded using
production mode by default. Set `NODE_ENV=development` explicitly to use development
environment files. The selected database must already exist.

## Update an existing database

Preview pending updates without making changes:

```bash
npm run db:migrate -- --dry-run
```

Apply the pending updates:

```bash
npm run db:migrate
```

Inspect migration status without changing anything:

```bash
npm run db:migrate -- --status
```

The command creates missing application support tables and adds missing tax,
invoice and image columns. It does not delete business records, modify existing
column types, rewrite existing views, register IRNs, or connect to WhiteBooks.
Already-applied migrations are skipped. Current migrations do not populate tax
snapshots for historical invoices; the application's verified recovery flow does
that when registered invoices are opened.

## Initialize an empty database

```bash
npm run db:generate -- --dry-run
npm run db:generate
```

`database/schema.sql` defines the base tables and views, including the current
PO tax, IRN snapshot, import, dispatch, integration and e-way bill support tables.
Generation installs that schema and then applies pending migrations. It refuses
an existing database unless it is resuming a generation previously started by
this command. A successfully initialized database can be passed to the command
again safely; only pending updates are considered.

This creates structures, not a copy of production records or login accounts.
Use a database dump/restore if you need an existing database's data.

## VPS deployment

After uploading/pulling the updated code and checking that the environment points
to the intended database:

```bash
npm ci
npm run db:migrate -- --dry-run
npm run db:migrate
npm run build
pm2 restart teakwood-web
```

Use the actual PM2 process name from `pm2 list`. Stop if a command fails. Use
`db:generate` only when setting up a new, empty database. Take a database backup
before deploying schema changes.

## Adding future changes

Add a new, uniquely numbered `.cjs` migration to `database/migrations/`, for example
`20261101_001_add_field.cjs`. Each migration exports `up(context)`:

```js
exports.up = async ({ensureColumn}) => {
  await ensureColumn('tblPODetails', 'NewField', 'VARCHAR(100) NULL');
};
```

Available context functions:

- `query(sql, parameters)`: one MySQL statement, with parameters.
- `ensureColumn(table, column, definition)`: adds a missing column and preserves
  existing columns and values.
- `runSql(text)`: executes semicolon-separated SQL outside quoted strings/comments.

For an associated SQL file, list its sibling filename in `exports.files`. These
files are included in the checksum. Routine definitions should be passed as one
complete statement to `query`, without client-only `DELIMITER` commands.

Never edit a migration after it has been applied. Add another migration, and
update `database/schema.sql` if fresh installations also need the change. Editing
`schema.sql` alone does not update an existing database.

`webSchemaMigrations` stores IDs, checksums and completion states. A database-level
lock prevents concurrent migration runs. MySQL DDL is not transactional: a failed
step may leave earlier changes applied. Migrations must be repeatable so that,
after correcting the cause, the same command can resume the incomplete step.
Do not delete migration history or alter stored checksums to bypass an error.
