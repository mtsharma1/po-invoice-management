-- Teakwood PO & Invoice MySQL schema foundation.
-- This matches the linked production tables observed from PO and Invoice Management V1.03.accdb.
-- Run on a fresh database only after reviewing existing Hostinger tables.

CREATE TABLE IF NOT EXISTS tblAccessType (
  ID INT NOT NULL AUTO_INCREMENT,
  AccessType INT NULL,
  AccessDescription VARCHAR(255) NULL,
  AdminPane SMALLINT NULL,
  PRIMARY KEY (ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblUsers (
  ID INT NOT NULL AUTO_INCREMENT,
  UserID VARCHAR(100) NULL,
  PWD VARCHAR(255) NULL,
  Access INT NULL,
  isActive SMALLINT NULL DEFAULT 1,
  PwdLastChanged DATETIME NULL,
  PRIMARY KEY (ID),
  INDEX IX_tblUsers_UserID (UserID),
  INDEX IX_tblUsers_Access (Access)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Web authentication uses signed, HTTP-only cookies and the existing tblUsers records.
-- isActive remains untouched because Access uses it as login state, not account eligibility.

CREATE TABLE IF NOT EXISTS tblPOHeaders (
  POBarcode VARCHAR(50) NOT NULL,
  POApprovedDate DATETIME NULL,
  PurchaseType VARCHAR(50) NULL,
  EstimatedDeliveryDate DATETIME NULL,
  VendorName VARCHAR(255) NULL,
  VendorGSTIN VARCHAR(20) NULL,
  BillTo TEXT NULL,
  ShipTo TEXT NULL,
  VendorAddress TEXT NULL,
  Party VARCHAR(100) NULL,
  CreatedOn DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  POImportDate DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (POBarcode),
  INDEX IX_POApprovedDate (POApprovedDate),
  INDEX IX_POImportDate (POImportDate),
  INDEX IX_EstimatedDeliveryDate (EstimatedDeliveryDate),
  INDEX IX_VendorName (VendorName),
  INDEX IX_VendorGSTIN (VendorGSTIN)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblAvailableStock (
  MID INT NOT NULL AUTO_INCREMENT,
  uuid VARCHAR(255) NULL,
  ItemId VARCHAR(255) NULL,
  ProductName VARCHAR(255) NULL,
  Unit VARCHAR(255) NULL,
  HSNCode VARCHAR(255) NULL,
  ItemType VARCHAR(255) NULL,
  IsService VARCHAR(255) NULL,
  Price DECIMAL(18,2) NULL DEFAULT 0,
  Stock INT NULL DEFAULT 0,
  CategoryName VARCHAR(255) NULL,
  CreatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (MID),
  INDEX IX_tblAvailableStock_ItemId (ItemId),
     INDEX IX_tblAvailableStock_uuid (uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webSettings (
  SettingKey VARCHAR(100) NOT NULL,
  SettingValue TEXT NULL,
  UpdatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (SettingKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webFileTemplates (
  TemplateKey VARCHAR(100) NOT NULL,
  FileName VARCHAR(255) NOT NULL,
  MimeType VARCHAR(150) NOT NULL,
  FileData LONGBLOB NOT NULL,
  FileSize BIGINT UNSIGNED NOT NULL,
  FileHash CHAR(64) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (TemplateKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblPODetails (
  POID INT NOT NULL AUTO_INCREMENT,
  POBarcode VARCHAR(50) NULL,
  SKUID VARCHAR(100) NULL,
  StyleId VARCHAR(100) NULL,
  SKUCode VARCHAR(100) NULL,
  HSNCode VARCHAR(20) NULL,
  Brand VARCHAR(100) NULL,
  GTIN VARCHAR(50) NULL,
  Category VARCHAR(100) NULL,
  VendorArticleNumber VARCHAR(255) NULL,
  VendorArticleName VARCHAR(255) NULL,
  Size VARCHAR(50) NULL,
  Colour VARCHAR(100) NULL,
  MRP DECIMAL(18,2) NULL DEFAULT 0,
  CreditPeriod VARCHAR(50) NULL,
  MarginType VARCHAR(50) NULL,
  AgreedMargin DECIMAL(18,2) NULL DEFAULT 0,
  GrossMargin DECIMAL(18,2) NULL DEFAULT 0,
  Quantity INT NULL DEFAULT 0,
  FOBAmount DECIMAL(18,2) NULL DEFAULT 0,
  ListPriceFOBTransportExcise DECIMAL(18,2) NULL DEFAULT 0,
  LandingPrice DECIMAL(18,2) NULL DEFAULT 0,
  EstimatedDeliveryDate DATETIME NULL,
  TaxBCD DECIMAL(18,2) NULL DEFAULT 0,
  TaxBCDAmount DECIMAL(18,2) NULL DEFAULT 0,
  BuyingTaxIGST DECIMAL(18,2) NULL DEFAULT 0,
  BuyingTaxIGSTAmount DECIMAL(18,2) NULL DEFAULT 0,
  TaxSWT DECIMAL(18,2) NULL DEFAULT 0,
  TaxSWTAmount DECIMAL(18,2) NULL DEFAULT 0,
  SellingTax DECIMAL(18,2) NULL DEFAULT 0,
  SellingTaxCGST DECIMAL(18,2) NULL DEFAULT 0,
  SellingTaxIGST DECIMAL(18,2) NULL DEFAULT 0,
  SellingTaxIGSTAmount DECIMAL(18,2) NULL DEFAULT 0,
  SellingTaxSGST DECIMAL(18,2) NULL DEFAULT 0,
  SellingTaxSGSTAmount DECIMAL(18,2) NULL DEFAULT 0,
  CreatedDate DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  ModifiedDate DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FactoryDispatchDate DATETIME NULL,
  VendorPrefix VARCHAR(4) NULL,
  AvailableStock INT NULL DEFAULT 0,
  PRIMARY KEY (POID),
  INDEX IX_POBarcode (POBarcode),
  INDEX IX_SKUCode (SKUCode),
  INDEX IX_SKUID (SKUID),
  INDEX IX_VendorArticleNumber (VendorArticleNumber),
  INDEX IX_Category (Category),
  INDEX idx_pd_vendor (VendorArticleName),
  INDEX idx_pd_prefix (VendorPrefix),
  CONSTRAINT FK_tblPODetails_tblPOHeaders FOREIGN KEY (POBarcode)
    REFERENCES tblPOHeaders (POBarcode) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblDispatchHeader (
  DispatchID INT NOT NULL AUTO_INCREMENT,
  DispatchNo VARCHAR(5) NULL,
  DispatchDate DATETIME NULL,
  PRIMARY KEY (DispatchID),
  INDEX IX_tblDispatchHeader_DispatchNo (DispatchNo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblDispatch (
  DID INT NOT NULL AUTO_INCREMENT,
  POID INT NULL,
  DispatchQty INT NULL DEFAULT 0,
  TrollySize VARCHAR(50) NULL,
  AppointmentDate DATETIME NULL,
  POBarcode VARCHAR(50) NULL,
  CreatedOn DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  DispatchDate DATETIME NULL,
  DispatchNo VARCHAR(5) NULL,
  InvoiceNo VARCHAR(20) NULL,
  PRIMARY KEY (DID),
  INDEX IX_POID (POID),
  INDEX IX_POBarcode (POBarcode),
  INDEX IX_AppointmentDate (AppointmentDate),
  INDEX IX_DispatchDate (DispatchDate),
  INDEX IX_DispatchNo (DispatchNo),
  INDEX IX_InvoiceNo (InvoiceNo),
  CONSTRAINT FK_tblDispatch_tblPODetails FOREIGN KEY (POID)
    REFERENCES tblPODetails (POID) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_tblDispatch_tblPOHeaders FOREIGN KEY (POBarcode)
    REFERENCES tblPOHeaders (POBarcode) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webTmpDispatch (
  WTDID BIGINT NOT NULL AUTO_INCREMENT,
  SessionId VARCHAR(64) NOT NULL,
  POID INT NULL,
  DispatchQty INT NULL DEFAULT 0,
  TrollySize VARCHAR(50) NULL,
  AppointmentDate DATETIME NULL,
  POBarcode VARCHAR(50) NULL,
  CreatedOn DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  DispatchDate DATETIME NULL,
  AvailableQuantity INT NULL DEFAULT 0,
  Quantity INT NULL DEFAULT 0,
  DispatchNo VARCHAR(20) NULL,
  InvoiceNo VARCHAR(100) NULL,
  PRIMARY KEY (WTDID),
  INDEX IX_webTmpDispatch_SessionPO (SessionId, POBarcode),
  INDEX IX_webTmpDispatch_SessionPOID (SessionId, POID),
  INDEX IX_webTmpDispatch_DispatchNo (DispatchNo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblInvoiceHeader (
  InvoiceID INT NOT NULL AUTO_INCREMENT,
  InvoiceNo VARCHAR(100) NULL,
  InvoiceDate DATETIME NULL,
  GSTN VARCHAR(50) NULL,
  IRN TEXT NULL,
  AckNo VARCHAR(100) NULL,
  AckDate DATETIME NULL,
  BillFromName VARCHAR(255) NULL,
  BillFromAddress TEXT NULL,
  DispatchFromName VARCHAR(255) NULL,
  DispatchFromAddress TEXT NULL,
  ConsigneeName VARCHAR(255) NULL,
  ConsigneeAddress TEXT NULL,
  DeliveredToName VARCHAR(255) NULL,
  DeliveredToAddress TEXT NULL,
  BuyerName VARCHAR(255) NULL,
  BuyerAddress TEXT NULL,
  BuyerGSTIN VARCHAR(50) NULL,
  AccountNo VARCHAR(100) NULL,
  BankName VARCHAR(255) NULL,
  BranchName VARCHAR(255) NULL,
  IFSCCode VARCHAR(20) NULL,
  TotalQty DECIMAL(18,2) NULL,
  TaxableAmount DECIMAL(18,2) NULL,
  IGSTRate DECIMAL(18,2) NULL,
  IGSTAmount DECIMAL(18,2) NULL,
  RoundOff DECIMAL(18,2) NULL,
  GrandTotal DECIMAL(18,2) NULL,
  TotalInWords TEXT NULL,
  POBarcode VARCHAR(255) NULL,
  SealNo VARCHAR(100) NULL,
  OrderNumber VARCHAR(100) NULL,
  OrderDate DATETIME NULL,
  SGST INT NULL,
  CGST INT NULL,
  InterStateTax SMALLINT NULL,
  PRIMARY KEY (InvoiceID),
  INDEX IX_tblInvoiceHeader_InvoiceNo (InvoiceNo),
  INDEX IX_tblInvoiceHeader_InvoiceDate (InvoiceDate),
  INDEX IX_tblInvoiceHeader_POBarcode (POBarcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblShellOrders (
  SOID INT NOT NULL AUTO_INCREMENT,
  POID INT NULL,
  POBarcode VARCHAR(50) NULL,
  FactoryDispatchDate DATETIME NULL,
  S01 INT NULL DEFAULT 0,
  M02 INT NULL DEFAULT 0,
  L03 INT NULL DEFAULT 0,
  TotalQty INT NULL DEFAULT 0,
  ShellQTY_S INT NULL DEFAULT 0,
  ShellQTY_M INT NULL DEFAULT 0,
  ShellQTY_L INT NULL DEFAULT 0,
  TRANZACT_QTY_S INT NULL DEFAULT 0,
  TRANZACT_QTY_M INT NULL DEFAULT 0,
  TRANZACT_QTY_L INT NULL DEFAULT 0,
  FINAL_QTY_S INT NULL DEFAULT 0,
  FINAL_QTY_M INT NULL DEFAULT 0,
  FINAL_QTY_L INT NULL DEFAULT 0,
  Size VARCHAR(20) NULL,
  Colour VARCHAR(100) NULL,
  VendorArticleName VARCHAR(255) NULL,
  SKUCode VARCHAR(100) NULL,
  ParentSKU VARCHAR(100) NULL,
  ParentSKUSize INT NULL,
  CreatedOn DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  AvailableStock INT NULL DEFAULT 0,
  PRIMARY KEY (SOID),
  INDEX IX_POID (POID),
  INDEX IX_POBarcode (POBarcode),
  INDEX IX_SKUCode (SKUCode),
  INDEX IX_ParentSKU (ParentSKU),
  INDEX IX_FactoryDispatchDate (FactoryDispatchDate),
  CONSTRAINT FK_tblShellOrders_tblPODetails FOREIGN KEY (POID)
    REFERENCES tblPODetails (POID) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_tblShellOrders_tblPOHeaders FOREIGN KEY (POBarcode)
    REFERENCES tblPOHeaders (POBarcode) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW vwPOHeader AS
SELECT POBarcode FROM tblPOHeaders;

CREATE OR REPLACE VIEW vwPoDetails AS
SELECT
  d.POID,
  d.POBarcode,
  d.SKUCode,
  d.HSNCode,
  d.Brand,
  d.GTIN,
  d.VendorArticleNumber,
  d.VendorArticleName,
  d.Size,
  d.Colour,
  d.MRP,
  d.CreditPeriod,
  d.Quantity,
  d.FOBAmount,
  d.ListPriceFOBTransportExcise AS Rate,
  d.LandingPrice,
  d.EstimatedDeliveryDate,
  h.BillTo,
  d.StyleId,
  d.AvailableStock,
  d.FactoryDispatchDate
FROM tblPODetails d
LEFT JOIN tblPOHeaders h ON h.POBarcode = d.POBarcode;

CREATE OR REPLACE VIEW vwDispatchDetails AS
SELECT
  disp.DID,
  disp.POID,
  disp.POBarcode,
  pod.StyleId,
  pod.HSNCode,
  pod.VendorArticleName,
  pod.Size,
  pod.Colour,
  pod.MRP,
  pod.Quantity,
  disp.DispatchQty,
  COALESCE(pod.Quantity, 0) - COALESCE(disp.DispatchQty, 0) AS PendingQuantity,
  disp.DispatchDate,
  pod.VendorPrefix,
  disp.DispatchNo,
  disp.InvoiceNo
FROM tblDispatch disp
LEFT JOIN tblPODetails pod ON pod.POID = disp.POID;

CREATE OR REPLACE VIEW vwShellOrders AS
SELECT
  so.*,
  pod.Quantity,
  CASE WHEN LEFT(COALESCE(so.VendorArticleName, pod.VendorArticleName, ''), 4) = 'T_TR' THEN 'SuitCase' ELSE 'BackPack' END AS Category
FROM tblShellOrders so
LEFT JOIN tblPODetails pod ON pod.POID = so.POID;

CREATE OR REPLACE VIEW vwInvoiceDetails AS
SELECT
  pod.POID,
  pod.POBarcode,
  ROW_NUMBER() OVER (PARTITION BY disp.InvoiceNo ORDER BY pod.POID) AS SlNo,
  pod.SKUCode,
  pod.StyleId,
  pod.HSNCode,
  pod.VendorArticleName,
  pod.Colour,
  pod.Size,
  COALESCE(disp.DispatchQty, pod.Quantity, 0) AS Qty,
  pod.MRP,
  pod.ListPriceFOBTransportExcise AS Rate,
  COALESCE(disp.DispatchQty, pod.Quantity, 0) * COALESCE(pod.ListPriceFOBTransportExcise, 0) AS Amount,
  inv.InvoiceID,
  inv.InvoiceNo,
  inv.InvoiceDate,
  inv.GSTN,
  inv.IRN,
  inv.AckNo,
  inv.AckDate,
  inv.BillFromName,
  inv.BillFromAddress,
  inv.DispatchFromName,
  inv.DispatchFromAddress,
  inv.ConsigneeName,
  inv.ConsigneeAddress,
  inv.DeliveredToName,
  inv.DeliveredToAddress,
  inv.AccountNo,
  inv.BankName,
  inv.BranchName,
  inv.IFSCCode,
  inv.IGSTRate,
  inv.TotalInWords,
  poh.POApprovedDate,
  poh.VendorGSTIN,
  poh.VendorName,
  disp.DispatchQty,
  inv.SealNo,
  inv.OrderNumber,
  inv.OrderDate AS InvoiceOrderDate,
  disp.DispatchNo,
  disp.InvoiceNo AS DispatchInvoiceNo,
  inv.SGST,
  inv.CGST
FROM tblDispatch disp
JOIN tblPODetails pod ON pod.POID = disp.POID
LEFT JOIN tblPOHeaders poh ON poh.POBarcode = pod.POBarcode
JOIN tblInvoiceHeader inv ON inv.InvoiceNo = disp.InvoiceNo
WHERE COALESCE(disp.DispatchNo, '') <> '';
