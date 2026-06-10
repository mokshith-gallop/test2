-- BigQuery DDL: staging.v_returns_pending (VIEW)
-- Source: Hive staging.v_returns_pending — pending returns awaiting approval
-- Migration: cross-dataset reference raw.return_authorizations
--          → `acme-analytics.raw.return_authorizations` (fully qualified)
--            Hive date-diff and to-date functions replaced with BigQuery equivalents:
--          → DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY)
-- Original Hive query selected rma_id, customer_id, invoice_no, stock_code,
--   quantity, requested_at, and computed days_pending from raw.return_authorizations
--   filtering on unapproved returns

CREATE OR REPLACE VIEW `acme-analytics.staging.v_returns_pending` AS
SELECT
    r.rma_id,
    r.customer_id,
    r.invoice_no,
    r.stock_code,
    r.quantity,
    r.requested_at,
    DATE_DIFF(CURRENT_DATE(), DATE(r.requested_at), DAY) AS days_pending
FROM `acme-analytics.raw.return_authorizations` r
WHERE r.approved IS NULL OR r.approved = FALSE;
