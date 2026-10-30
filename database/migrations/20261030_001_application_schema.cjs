const fs = require('node:fs/promises');
const path = require('node:path');

exports.files = ['20261030_001_application_tables.sql'];
exports.up = async ({query, ensureColumn, runSql}) => {
  await runSql(await fs.readFile(path.join(__dirname, exports.files[0]), 'utf8'));
  for (const table of ['tblPODetails', 'webTmpPODetails']) {
    for (const name of ['BuyingTaxCGST','BuyingTaxCGSTAmount','BuyingTaxSGST','BuyingTaxSGSTAmount','BuyingTaxIGST','BuyingTaxIGSTAmount']) {
      await ensureColumn(table, name, 'DECIMAL(18,2) NULL DEFAULT 0');
    }
  }
  for (const [name,type] of [
    ['TaxDetailsVersion','TINYINT NOT NULL DEFAULT 0'],
    ['TransportationCharges','DECIMAL(18,2) NOT NULL DEFAULT 0'],
    ['InvoiceNote','TEXT NULL'],['BeneficiaryName','VARCHAR(255) NULL'],
  ]) await ensureColumn('tblInvoiceHeader',name,type);
  await ensureColumn('tblPOHeaders','ConsigneeName','VARCHAR(255) NULL');
  await ensureColumn('tblPOHeaders','POImportDate','DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('webTmpPOHeaders','ConsigneeName','VARCHAR(255) NULL');
  for (const [name,type] of [['path_display','VARCHAR(1024) NULL'],['ImageUrl','VARCHAR(2048) NULL'],['ImageData','LONGBLOB NULL'],['ImageData2','LONGBLOB NULL'],['ImageData3','LONGBLOB NULL']]) {
    await ensureColumn('tblPODetails',name,type);
  }
};
