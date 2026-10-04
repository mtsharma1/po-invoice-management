-- Install in the application's MySQL 8 database.
-- Run CALL in a dedicated connection with no existing transaction.
-- Pause invoice/dispatch posting and IRN/e-way-bill jobs during the call.
-- p_delete = 0: dry run (performs deletes inside a transaction, then rolls back).
-- p_delete = 1: permanently commit the deletion.
-- Purchase orders are retained; removing dispatch lines restores pending quantities.
-- This does NOT cancel any externally issued IRN or e-way bill.
-- No DROP PROCEDURE is included: installing will not overwrite an existing routine.

DELIMITER $$

CREATE PROCEDURE sp_delete_invoice_everywhere(
    IN p_invoice_no VARCHAR(100),
    IN p_delete TINYINT
)
SQL SECURITY INVOKER
MODIFIES SQL DATA
BEGIN
    DECLARE v_invoice_no VARCHAR(100);
    DECLARE v_started BOOLEAN DEFAULT FALSE;
    DECLARE v_table_count INT DEFAULT 0;
    DECLARE v_report JSON DEFAULT (JSON_ARRAY());

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        IF v_started THEN
            ROLLBACK;
        END IF;
        DROP TEMPORARY TABLE IF EXISTS tmp_invoice_purge_ids;
        DROP TEMPORARY TABLE IF EXISTS tmp_invoice_purge_dispatches;
        RESIGNAL;
    END;

    SET v_invoice_no = TRIM(p_invoice_no);
    IF v_invoice_no IS NULL OR v_invoice_no = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A non-empty invoice number is required.';
    END IF;
    IF p_delete IS NULL OR p_delete NOT IN (0, 1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Use p_delete = 0 for dry run or 1 for permanent deletion.';
    END IF;

    -- Do not risk partial rollback on nontransactional or incomplete installations.
    SELECT COUNT(*) INTO v_table_count
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
      AND ENGINE = 'InnoDB'
      AND TABLE_NAME IN (
          'tblInvoiceHeader', 'tblDispatch', 'tblDispatchHeader', 'webTmpDispatch',
          'webWhitebooksProductionEwayBill', 'webWhitebooksStandaloneEwayBill',
          'webWhitebooksSandboxEwayBill', 'webWhitebooksProductionIrn',
          'webWhitebooksSandboxIrn', 'webInvoiceEwayBillTransport'
      );
    IF v_table_count <> 10 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Required tables are missing or not InnoDB; no deletion attempted.';
    END IF;

    DROP TEMPORARY TABLE IF EXISTS tmp_invoice_purge_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_invoice_purge_dispatches;
    CREATE TEMPORARY TABLE tmp_invoice_purge_ids (
        InvoiceID BIGINT PRIMARY KEY
    ) ENGINE = InnoDB;
    CREATE TEMPORARY TABLE tmp_invoice_purge_dispatches (
        DispatchNo VARCHAR(100) PRIMARY KEY
    ) ENGINE = InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    START TRANSACTION;
    SET v_started = TRUE;

    INSERT INTO tmp_invoice_purge_ids (InvoiceID)
    SELECT InvoiceID FROM tblInvoiceHeader WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;

    INSERT INTO tmp_invoice_purge_dispatches (DispatchNo)
    SELECT DISTINCT DispatchNo FROM tblDispatch
    WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci AND COALESCE(DispatchNo, '') <> '';

    INSERT IGNORE INTO tmp_invoice_purge_dispatches (DispatchNo)
    SELECT DISTINCT DispatchNo FROM webTmpDispatch
    WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci AND COALESCE(DispatchNo, '') <> '';

    DELETE FROM webWhitebooksProductionEwayBill WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'webWhitebooksProductionEwayBill', 'rows', ROW_COUNT()));

    DELETE FROM webWhitebooksStandaloneEwayBill WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'webWhitebooksStandaloneEwayBill', 'rows', ROW_COUNT()));

    DELETE FROM webWhitebooksSandboxEwayBill WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'webWhitebooksSandboxEwayBill', 'rows', ROW_COUNT()));

    DELETE FROM webWhitebooksProductionIrn
    WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci
       OR InvoiceID IN (SELECT InvoiceID FROM tmp_invoice_purge_ids);
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'webWhitebooksProductionIrn', 'rows', ROW_COUNT()));

    DELETE FROM webWhitebooksSandboxIrn WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'webWhitebooksSandboxIrn', 'rows', ROW_COUNT()));

    DELETE FROM webInvoiceEwayBillTransport WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'webInvoiceEwayBillTransport', 'rows', ROW_COUNT()));

    DELETE FROM tblDispatch WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'tblDispatch', 'rows', ROW_COUNT()));

    DELETE FROM webTmpDispatch WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'webTmpDispatch (invoice)', 'rows', ROW_COUNT()));

    DELETE tmp FROM webTmpDispatch AS tmp
    JOIN tmp_invoice_purge_dispatches AS target ON target.DispatchNo = tmp.DispatchNo COLLATE utf8mb4_unicode_ci
    WHERE COALESCE(tmp.InvoiceNo, '') = ''
      AND NOT EXISTS (SELECT 1 FROM tblDispatch AS d WHERE d.DispatchNo = tmp.DispatchNo COLLATE utf8mb4_unicode_ci);
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'webTmpDispatch (unreferenced copies)', 'rows', ROW_COUNT()));

    DELETE h FROM tblDispatchHeader AS h
    JOIN tmp_invoice_purge_dispatches AS target ON target.DispatchNo = h.DispatchNo COLLATE utf8mb4_unicode_ci
    WHERE NOT EXISTS (SELECT 1 FROM tblDispatch AS d WHERE d.DispatchNo = h.DispatchNo COLLATE utf8mb4_unicode_ci)
      AND NOT EXISTS (SELECT 1 FROM webTmpDispatch AS tmp WHERE tmp.DispatchNo = h.DispatchNo COLLATE utf8mb4_unicode_ci);
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'tblDispatchHeader', 'rows', ROW_COUNT()));

    DELETE FROM tblInvoiceHeader WHERE InvoiceNo = v_invoice_no COLLATE utf8mb4_unicode_ci;
    SET v_report = JSON_ARRAY_APPEND(v_report, '$', JSON_OBJECT('table_name', 'tblInvoiceHeader', 'rows', ROW_COUNT()));

    IF p_delete = 1 THEN
        COMMIT;
    ELSE
        ROLLBACK;
    END IF;
    SET v_started = FALSE;

    DROP TEMPORARY TABLE IF EXISTS tmp_invoice_purge_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_invoice_purge_dispatches;

    SELECT v_invoice_no AS InvoiceNo,
           IF(p_delete = 1, 'DELETED', 'DRY RUN - ROLLED BACK') AS Result,
           report.TableName,
           report.AffectedRows
    FROM JSON_TABLE(v_report, '$[*]' COLUMNS (
        TableName VARCHAR(100) PATH '$.table_name',
        AffectedRows BIGINT PATH '$.rows'
    )) AS report;
END$$

DELIMITER ;

-- Run these separately, after reviewing a backup and the dry-run results:
-- CALL sp_delete_invoice_everywhere('YOUR_INVOICE_NUMBER', 0);
-- CALL sp_delete_invoice_everywhere('YOUR_INVOICE_NUMBER', 1);
