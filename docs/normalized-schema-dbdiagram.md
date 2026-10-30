# Dokumentasi Normalisasi Database (3NF) & Skema DBML (`dbdiagram.io`)
## Proyek: ERP Keuangan & Operasional PMO UTama

Dokumen ini menyajikan skema basis data yang telah **dinormalisasi penuh hingga Bentuk Normal Ketiga (3NF / Third Normal Form)** khusus untuk kebutuhan dokumentasi arsitektur sistem dan visualisasi Entity Relationship Diagram (ERD) di **[dbdiagram.io](https://dbdiagram.io/d)**.

---

## 1. Analisis Tahapan Normalisasi (1NF, 2NF, dan 3NF)

Pada implementasi fisik (`prisma/schema.prisma`), beberapa atribut sengaja didenormalisasi untuk performa pembacaan cepat dan jejak audit historis. Untuk kebutuhan dokumentasi perancangan basis data yang memenuhi kaidah relasional murni (**3NF**), berikut adalah transformasi normalisasi yang diterapkan:

### A. First Normal Form (1NF) - Atomisitas Nilai & Eliminasi Repeating Groups
* **Masalah Sebelum 1NF**:
  * Kolom `permissions` pada tabel `Role` disimpan sebagai array (`String[]`), yang melanggar aturan nilai atomik 1NF.
  * Rincian barang/jasa pada dokumen anggaran, pengadaan, dan penjualan tidak boleh digabung dalam satu baris header.
* **Solusi 1NF**:
  * Memecah `Role.permissions` menjadi entitas mandiri `permissions` dan tabel asosiasi (*junction table*) `role_permissions` (`role_id`, `permission_id`).
  * Memastikan setiap dokumen berstruktur *Header-Detail* (`budgets` -> `budget_lines`, `purchase_requests` -> `purchase_request_lines`, `purchase_orders` -> `purchase_order_lines`, `sales_orders` -> `sales_order_lines`, `journal_entries` -> `journal_lines`).

### B. Second Normal Form (2NF) - Ketergantungan Fungsional Penuh pada Primary Key
* **Masalah Sebelum 2NF**:
  * Pada tabel detail transaksi seperti `purchase_order_lines`, `goods_receipt_lines`, dan `customer_invoice_lines`, menyimpan ulang nama barang (`item_name`), satuan (`unit`), dan tarif pajak menyebabkan ketergantungan parsial.
* **Solusi 2NF**:
  * `purchase_order_lines` merujuk langsung ke `purchase_request_lines.id` sehingga spesifikasi barang dan satuan hanya disimpan satu kali di sumbernya.
  * `goods_receipt_lines` merujuk langsung ke `purchase_order_lines.id` dan hanya mencatat kuantitas yang diterima (`quantity_received`) serta kondisi fisik.
  * `sales_order_lines` dan `customer_invoice_lines` merujuk ke `products_services.id` dan `tax_configurations.id`.

### C. Third Normal Form (3NF) - Eliminasi Ketergantungan Transitif (Transitive Dependency)
* **Masalah Sebelum 3NF**:
  * **Redundansi Nama Pengguna**: Menyimpan `created_by_name`, `approved_by_name`, `requested_by_name`, `cashier_name`, `deposited_by_name`, dan `reconciled_by_name` di tabel transaksi menciptakan ketergantungan transitif (`transaction -> user_id -> full_name`).
  * **Atribut Kalkulasi Turunan (*Derived Attributes*)**: Menyimpan `total_allocated`, `total_committed`, `total_actual`, `subtotal`, `total_amount`, `balance_due`, `theoretical_balance`, dan `book_value` di tabel header merupakan duplikasi dari hasil agregasi (`SUM`) tabel detailnya.
* **Solusi 3NF**:
  * Seluruh kolom nama pelaku (`*_by_name`) dihapus dan digantikan sepenuhnya oleh Foreign Key (`created_by_id`, `approved_by_id`, `cashier_id`, dll.) yang berelasi langsung ke `users.id`.
  * Kolom total/saldo yang dapat dihitung dari tabel anak (*derived columns*) dieliminasi dari skema 3NF karena nilainya selalu diturunkan dari `SUM()` baris detail.
  * Seluruh relasi antar-modul (termasuk `expenses.journal_entry_id`, `payments.journal_entry_id`, `journal_entries.reversed_from_id`, dan `budget_lines.account_id`) diikat dengan Foreign Key eksplisit.

---

## 2. Kode DBML Normalisasi (3NF) untuk `dbdiagram.io`

Salin seluruh isi blok kode `dbml` di bawah ini ke **[https://dbdiagram.io/d](https://dbdiagram.io/d)**:

```dbml
Project pmo_utama_erp_3nf {
  database_type: 'PostgreSQL'
  Note: 'Skema Database Ter-normalisasi (3NF) ERP Keuangan & Operasional PMO UTama (28 Entitas Inti)'
}

// ============================================================================
// 1. ORGANISASI, MASTER DATA & HAK AKSES (RBAC 3NF)
// ============================================================================

Table business_units {
  id uuid [pk]
  code varchar(20) [unique, not null]
  name varchar(150) [not null]
  unit_type varchar(30) [not null, default: 'OPERATIONAL']
  manager_user_id uuid [ref: > users.id]
  is_active boolean [not null, default: true]
  created_at timestamp [not null, default: `now()`]
}

Table cost_centers {
  id uuid [pk]
  code varchar(20) [unique, not null]
  name varchar(150) [not null]
  business_unit_id uuid [not null, ref: > business_units.id]
  is_active boolean [not null, default: true]
}

Table fund_sources {
  id uuid [pk]
  code varchar(20) [unique, not null]
  name varchar(150) [not null]
  source_type varchar(40) [not null]
  description text
  is_active boolean [not null, default: true]
}

Table fiscal_periods {
  id uuid [pk]
  code varchar(20) [unique, not null]
  name varchar(100) [not null]
  start_date date [not null]
  end_date date [not null]
  status varchar(20) [not null, default: 'OPEN']
  closed_by_id uuid [ref: > users.id]
  closed_at timestamp
  reopen_reason text
}

Table roles {
  id uuid [pk]
  code varchar(40) [unique, not null]
  name varchar(100) [not null]
  description text [not null]
  approval_limit decimal(18,2) [not null, default: 0]
}

Table permissions {
  id uuid [pk]
  code varchar(60) [unique, not null, note: 'Contoh: budget:approve, expense:pay']
  module varchar(40) [not null]
  description text
}

Table role_permissions {
  role_id uuid [not null, ref: > roles.id]
  permission_id uuid [not null, ref: > permissions.id]

  indexes {
    (role_id, permission_id) [pk]
  }
}

Table users {
  id uuid [pk]
  email varchar(150) [unique, not null]
  full_name varchar(150) [not null]
  password_hash varchar(255) [not null]
  role_id uuid [not null, ref: > roles.id]
  business_unit_id uuid [ref: > business_units.id]
  is_active boolean [not null, default: true]
  created_at timestamp [not null, default: `now()`]
}

// ============================================================================
// 2. AKUNTANSI, COA, PAJAK & BUKU BESAR (3NF)
// ============================================================================

Table chart_of_accounts {
  id uuid [pk]
  code varchar(20) [unique, not null]
  name varchar(150) [not null]
  account_type varchar(30) [not null, note: 'ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE']
  normal_balance varchar(10) [not null, note: 'DEBIT, CREDIT']
  parent_account_id uuid [ref: > chart_of_accounts.id]
  is_control_account boolean [not null, default: false]
  is_active boolean [not null, default: true]
}

Table tax_configurations {
  id uuid [pk]
  tax_code varchar(30) [unique, not null]
  name varchar(120) [not null]
  tax_type varchar(30) [not null, note: 'PPN, PPH23, PPH21']
  rate_percent decimal(5,2) [not null]
  tax_account_id uuid [not null, ref: > chart_of_accounts.id]
  effective_from date [not null]
  effective_to date
  is_inclusive boolean [not null, default: false]
  is_active boolean [not null, default: true]
}

Table journal_entries {
  id uuid [pk]
  journal_number varchar(40) [unique, not null]
  entry_date date [not null]
  fiscal_period_id uuid [not null, ref: > fiscal_periods.id]
  business_unit_id uuid [not null, ref: > business_units.id]
  source_type varchar(40) [not null]
  idempotency_key varchar(100) [unique, not null]
  description text [not null]
  status varchar(20) [not null, default: 'POSTED']
  reversed_from_id uuid [ref: > journal_entries.id]
  reversal_reason text
  created_by_id uuid [not null, ref: > users.id]
  posted_by_id uuid [ref: > users.id]
  posted_at timestamp
  created_at timestamp [not null, default: `now()`]
}

Table journal_lines {
  id uuid [pk]
  journal_entry_id uuid [not null, ref: > journal_entries.id]
  account_id uuid [not null, ref: > chart_of_accounts.id]
  cost_center_id uuid [ref: > cost_centers.id]
  description text [not null]
  debit decimal(18,2) [not null, default: 0]
  credit decimal(18,2) [not null, default: 0]
}

Table fixed_assets {
  id uuid [pk]
  asset_code varchar(40) [unique, not null]
  name varchar(150) [not null]
  category varchar(60) [not null]
  business_unit_id uuid [not null, ref: > business_units.id]
  asset_account_id uuid [not null, ref: > chart_of_accounts.id]
  acquisition_date date [not null]
  acquisition_cost decimal(18,2) [not null]
  salvage_value decimal(18,2) [not null, default: 0]
  useful_life_months int [not null]
  depreciation_method varchar(30) [not null, default: 'STRAIGHT_LINE']
  location varchar(150) [not null]
  status varchar(20) [not null, default: 'ACTIVE']
}

// ============================================================================
// 3. PERENCANAAN MODAL & ANGGARAN (3NF)
// ============================================================================

Table budgets {
  id uuid [pk]
  doc_number varchar(40) [unique, not null]
  title varchar(200) [not null]
  business_unit_id uuid [not null, ref: > business_units.id]
  fiscal_period_id uuid [not null, ref: > fiscal_periods.id]
  fund_source_id uuid [not null, ref: > fund_sources.id]
  version int [not null, default: 1]
  status varchar(30) [not null, default: 'DRAFT']
  revenue_target decimal(18,2) [not null, default: 0]
  notes text
  rejection_reason text
  created_by_id uuid [not null, ref: > users.id]
  approved_by_id uuid [ref: > users.id]
  submitted_at timestamp
  approved_at timestamp
  created_at timestamp [not null, default: `now()`]
}

Table budget_lines {
  id uuid [pk]
  budget_id uuid [not null, ref: > budgets.id]
  cost_center_id uuid [not null, ref: > cost_centers.id]
  account_id uuid [not null, ref: > chart_of_accounts.id]
  category varchar(40) [not null, note: 'CAPEX, OPEX, MODAL_KERJA, PENGADAAN, PEGAWAI, PAJAK']
  description text [not null]
  allocated_amount decimal(18,2) [not null]
}

Table budget_revisions {
  id uuid [pk]
  budget_id uuid [not null, ref: > budgets.id]
  version int [not null]
  reason text [not null]
  revised_by_id uuid [not null, ref: > users.id]
  approved_by_id uuid [ref: > users.id]
  created_at timestamp [not null, default: `now()`]
}

Table budget_commitments {
  id uuid [pk]
  budget_line_id uuid [not null, ref: > budget_lines.id]
  purchase_request_id uuid [not null, ref: > purchase_requests.id]
  amount decimal(18,2) [not null]
  status varchar(20) [not null, default: 'RESERVED', note: 'RESERVED, CONSUMED, RELEASED']
  created_at timestamp [not null, default: `now()`]
}

// ============================================================================
// 4. PENGADAAN, VENDOR, PO, PENERIMAAN & PENGELUARAN (3NF)
// ============================================================================

Table vendors {
  id uuid [pk]
  code varchar(30) [unique, not null]
  name varchar(150) [not null]
  legal_name varchar(150) [not null]
  tax_id_npwp varchar(40) [unique, not null]
  category varchar(60) [not null]
  contact_name varchar(100) [not null]
  email varchar(150) [not null]
  phone varchar(40) [not null]
  address text [not null]
  bank_name varchar(80) [not null]
  bank_account_no varchar(60) [not null]
  bank_account_holder varchar(150) [not null]
  has_conflict_of_interest boolean [not null, default: false]
  conflict_note text
  status varchar(30) [not null, default: 'ACTIVE']
}

Table purchase_requests {
  id uuid [pk]
  doc_number varchar(40) [unique, not null]
  title varchar(200) [not null]
  business_unit_id uuid [not null, ref: > business_units.id]
  cost_center_id uuid [not null, ref: > cost_centers.id]
  budget_line_id uuid [not null, ref: > budget_lines.id]
  purpose text [not null]
  status varchar(30) [not null, default: 'DRAFT']
  min_quotations_required int [not null, default: 3]
  quotation_exception_reason text
  rejection_reason text
  requested_by_id uuid [not null, ref: > users.id]
  approved_by_id uuid [ref: > users.id]
  approved_at timestamp
  created_at timestamp [not null, default: `now()`]
}

Table purchase_request_lines {
  id uuid [pk]
  purchase_request_id uuid [not null, ref: > purchase_requests.id]
  item_name varchar(150) [not null]
  specification text
  quantity decimal(12,2) [not null]
  unit varchar(30) [not null]
  estimated_unit_price decimal(18,2) [not null]
}

Table vendor_quotations {
  id uuid [pk]
  purchase_request_id uuid [not null, ref: > purchase_requests.id]
  vendor_id uuid [not null, ref: > vendors.id]
  quotation_number varchar(60) [not null]
  quoted_subtotal decimal(18,2) [not null]
  tax_config_id uuid [ref: > tax_configurations.id]
  delivery_days int [not null]
  warranty_info text
  document_complete boolean [not null, default: true]
  is_selected boolean [not null, default: false]
  selection_reason text
}

Table purchase_orders {
  id uuid [pk]
  doc_number varchar(40) [unique, not null]
  purchase_request_id uuid [not null, ref: > purchase_requests.id]
  vendor_id uuid [not null, ref: > vendors.id]
  selected_quotation_id uuid [not null, ref: > vendor_quotations.id]
  business_unit_id uuid [not null, ref: > business_units.id]
  order_date date [not null]
  expected_delivery_date date [not null]
  payment_terms varchar(40) [not null, default: 'NET 30']
  discount_amount decimal(18,2) [not null, default: 0]
  tax_config_id uuid [ref: > tax_configurations.id]
  status varchar(30) [not null, default: 'APPROVED']
  selection_justification text [not null]
  created_by_id uuid [not null, ref: > users.id]
  approved_by_id uuid [ref: > users.id]
}

Table purchase_order_lines {
  id uuid [pk]
  purchase_order_id uuid [not null, ref: > purchase_orders.id]
  pr_line_id uuid [not null, ref: > purchase_request_lines.id]
  ordered_quantity decimal(12,2) [not null]
  agreed_unit_price decimal(18,2) [not null]
}

Table goods_receipts {
  id uuid [pk]
  doc_number varchar(40) [unique, not null]
  purchase_order_id uuid [not null, ref: > purchase_orders.id]
  received_date timestamp [not null, default: `now()`]
  received_by_id uuid [not null, ref: > users.id]
  delivery_note_ref varchar(80) [not null]
  condition_note text
  status varchar(30) [not null, default: 'COMPLETE']
}

Table goods_receipt_lines {
  id uuid [pk]
  goods_receipt_id uuid [not null, ref: > goods_receipts.id]
  po_line_id uuid [not null, ref: > purchase_order_lines.id]
  quantity_received decimal(12,2) [not null]
  condition varchar(30) [not null, default: 'GOOD']
}

Table vendor_invoices {
  id uuid [pk]
  internal_number varchar(40) [unique, not null]
  vendor_invoice_number varchar(80) [not null]
  vendor_id uuid [not null, ref: > vendors.id]
  purchase_order_id uuid [ref: > purchase_orders.id]
  business_unit_id uuid [not null, ref: > business_units.id]
  invoice_date date [not null]
  due_date date [not null]
  subtotal decimal(18,2) [not null]
  tax_amount decimal(18,2) [not null, default: 0]
  matching_status varchar(30) [not null, default: 'MATCHED_3WAY']
  matching_note text
  status varchar(30) [not null, default: 'VERIFIED']
  created_by_id uuid [not null, ref: > users.id]
  verified_by_id uuid [ref: > users.id]

  indexes {
    (vendor_id, vendor_invoice_number) [unique]
  }
}

Table expenses {
  id uuid [pk]
  doc_number varchar(40) [unique, not null]
  title varchar(200) [not null]
  business_unit_id uuid [not null, ref: > business_units.id]
  cost_center_id uuid [not null, ref: > cost_centers.id]
  budget_line_id uuid [not null, ref: > budget_lines.id]
  fund_source_id uuid [not null, ref: > fund_sources.id]
  vendor_invoice_id uuid [ref: > vendor_invoices.id]
  bank_account_id uuid [ref: > bank_accounts.id]
  journal_entry_id uuid [ref: > journal_entries.id]
  payment_method varchar(40) [not null, default: 'BANK_TRANSFER']
  transaction_date date [not null]
  subtotal decimal(18,2) [not null]
  tax_amount decimal(18,2) [not null, default: 0]
  description text [not null]
  receipt_ref varchar(80)
  status varchar(30) [not null, default: 'DRAFT']
  void_reason text
  created_by_id uuid [not null, ref: > users.id]
  approved_by_id uuid [ref: > users.id]
  paid_at timestamp
}

// ============================================================================
// 5. PENDAPATAN, PESANAN PELANGGAN, INVOICE, PEMBAYARAN & KASIR (3NF)
// ============================================================================

Table customers {
  id uuid [pk]
  code varchar(30) [unique, not null]
  name varchar(150) [not null]
  organization_type varchar(40) [not null, default: 'CORPORATE']
  tax_id_npwp varchar(40)
  contact_person varchar(100) [not null]
  email varchar(150) [not null]
  phone varchar(40) [not null]
  address text [not null]
  credit_limit decimal(18,2) [not null, default: 100000000]
  status varchar(20) [not null, default: 'ACTIVE']
}

Table products_services {
  id uuid [pk]
  sku varchar(40) [unique, not null]
  name varchar(150) [not null]
  category varchar(60) [not null]
  business_unit_id uuid [not null, ref: > business_units.id]
  revenue_account_id uuid [not null, ref: > chart_of_accounts.id]
  default_tax_config_id uuid [ref: > tax_configurations.id]
  current_unit_price decimal(18,2) [not null]
  unit varchar(30) [not null, default: 'Paket']
  is_active boolean [not null, default: true]
}

Table product_price_histories {
  id uuid [pk]
  product_service_id uuid [not null, ref: > products_services.id]
  old_price decimal(18,2) [not null]
  new_price decimal(18,2) [not null]
  changed_by_id uuid [not null, ref: > users.id]
  reason text [not null]
  changed_at timestamp [not null, default: `now()`]
}

Table sales_orders {
  id uuid [pk]
  doc_number varchar(40) [unique, not null]
  customer_id uuid [not null, ref: > customers.id]
  business_unit_id uuid [not null, ref: > business_units.id]
  order_date date [not null]
  due_date date [not null]
  terms varchar(40) [not null, default: 'NET 14']
  status varchar(30) [not null, default: 'CONFIRMED']
  delivery_status varchar(30) [not null, default: 'PENDING']
  delivered_at timestamp
  delivered_by_id uuid [ref: > users.id]
  delivery_notes text
  created_by_id uuid [not null, ref: > users.id]
}

Table sales_order_lines {
  id uuid [pk]
  sales_order_id uuid [not null, ref: > sales_orders.id]
  product_service_id uuid [not null, ref: > products_services.id]
  tax_config_id uuid [ref: > tax_configurations.id]
  quantity decimal(12,2) [not null]
  locked_unit_price decimal(18,2) [not null, note: 'Snapshot harga saat kontrak dibuat']
  discount_amount decimal(18,2) [not null, default: 0]
}

Table customer_invoices {
  id uuid [pk]
  doc_number varchar(40) [unique, not null]
  sales_order_id uuid [not null, ref: > sales_orders.id]
  customer_id uuid [not null, ref: > customers.id]
  business_unit_id uuid [not null, ref: > business_units.id]
  journal_entry_id uuid [ref: > journal_entries.id]
  issue_date date [not null]
  due_date date [not null]
  status varchar(30) [not null, default: 'ISSUED']
  created_by_id uuid [not null, ref: > users.id]
}

Table cash_registers {
  id uuid [pk]
  code varchar(30) [unique, not null]
  name varchar(120) [not null]
  business_unit_id uuid [not null, ref: > business_units.id]
  cash_account_id uuid [not null, ref: > chart_of_accounts.id]
  is_active boolean [not null, default: true]
}

Table cashier_sessions {
  id uuid [pk]
  session_number varchar(40) [unique, not null]
  cash_register_id uuid [not null, ref: > cash_registers.id]
  cashier_user_id uuid [not null, ref: > users.id]
  opened_at timestamp [not null, default: `now()`]
  opening_float decimal(18,2) [not null]
  actual_counted_cash decimal(18,2)
  discrepancy_reason text
  status varchar(30) [not null, default: 'OPEN']
  closed_at timestamp
  reviewed_by_id uuid [ref: > users.id]
  reviewed_at timestamp
  review_note text
}

Table payments {
  id uuid [pk]
  receipt_number varchar(40) [unique, not null]
  customer_invoice_id uuid [not null, ref: > customer_invoices.id]
  cashier_session_id uuid [ref: > cashier_sessions.id]
  bank_account_id uuid [ref: > bank_accounts.id]
  journal_entry_id uuid [ref: > journal_entries.id]
  payment_date timestamp [not null, default: `now()`]
  method varchar(40) [not null]
  gross_amount decimal(18,2) [not null]
  fee_amount decimal(18,2) [not null, default: 0]
  reference_no varchar(80) [not null]
  idempotency_key varchar(100) [unique, not null]
  status varchar(30) [not null, default: 'CONFIRMED']
  received_by_id uuid [ref: > users.id]
}

Table refunds {
  id uuid [pk]
  refund_number varchar(40) [unique, not null]
  payment_id uuid [not null, ref: > payments.id]
  journal_entry_id uuid [ref: > journal_entries.id]
  amount decimal(18,2) [not null]
  reason text [not null]
  status varchar(30) [not null, default: 'PROCESSED']
  requested_by_id uuid [not null, ref: > users.id]
  approved_by_id uuid [ref: > users.id]
  processed_at timestamp [not null, default: `now()`]
}

Table cash_deposits {
  id uuid [pk]
  deposit_number varchar(40) [unique, not null]
  cashier_session_id uuid [not null, ref: > cashier_sessions.id]
  bank_account_id uuid [not null, ref: > bank_accounts.id]
  journal_entry_id uuid [ref: > journal_entries.id]
  deposit_date timestamp [not null, default: `now()`]
  amount decimal(18,2) [not null]
  reference_no varchar(80) [not null]
  deposited_by_id uuid [not null, ref: > users.id]
  status varchar(30) [not null, default: 'VERIFIED']
}

// ============================================================================
// 6. REKENING BANK, REKONSILIASI, EVALUASI STRATEGIS & AUDIT (3NF)
// ============================================================================

Table bank_accounts {
  id uuid [pk]
  code varchar(30) [unique, not null]
  bank_name varchar(100) [not null]
  account_number varchar(60) [not null]
  account_holder varchar(150) [not null]
  business_unit_id uuid [not null, ref: > business_units.id]
  gl_account_id uuid [not null, ref: > chart_of_accounts.id]
  currency varchar(10) [not null, default: 'IDR']
  is_active boolean [not null, default: true]
}

Table bank_statement_imports {
  id uuid [pk]
  import_number varchar(40) [unique, not null]
  bank_account_id uuid [not null, ref: > bank_accounts.id]
  period_label varchar(60) [not null]
  file_name varchar(150) [not null]
  status varchar(30) [not null, default: 'RECONCILING']
  imported_by_id uuid [not null, ref: > users.id]
  finalized_by_id uuid [ref: > users.id]
  finalized_at timestamp
  created_at timestamp [not null, default: `now()`]
}

Table bank_statement_lines {
  id uuid [pk]
  import_id uuid [not null, ref: > bank_statement_imports.id]
  transaction_date date [not null]
  description text [not null]
  reference_no varchar(80) [not null]
  direction varchar(10) [not null, note: 'DEBIT, CREDIT']
  amount decimal(18,2) [not null]
  fingerprint varchar(64) [unique, not null]
  match_status varchar(30) [not null, default: 'UNMATCHED']
  matched_payment_id uuid [ref: > payments.id]
  matched_deposit_id uuid [ref: > cash_deposits.id]
  matched_expense_id uuid [ref: > expenses.id]
  exception_note text
  reconciled_by_id uuid [ref: > users.id]
  reconciled_at timestamp
}

Table strategic_evaluations {
  id uuid [pk]
  eval_number varchar(40) [unique, not null]
  fiscal_period_id uuid [not null, ref: > fiscal_periods.id]
  business_unit_id uuid [not null, ref: > business_units.id]
  variance_analysis text [not null]
  risk_summary text [not null]
  recommended_next_ceiling decimal(18,2) [not null]
  recommended_revenue_target decimal(18,2) [not null]
  gm_decision varchar(30) [not null, default: 'PENDING']
  gm_decision_note text
  decided_by_id uuid [ref: > users.id]
  decided_at timestamp
  created_at timestamp [not null, default: `now()`]
}

Table audit_logs {
  id uuid [pk]
  actor_user_id uuid [ref: > users.id]
  action varchar(60) [not null]
  module varchar(40) [not null]
  entity_type varchar(60) [not null]
  entity_id varchar(60) [not null]
  summary text [not null]
  before_data jsonb
  after_data jsonb
  request_id varchar(60)
  created_at timestamp [not null, default: `now()`]
}

// ============================================================================
// PENGELOMPOKAN VISUAL UNTUK DBDIAGRAM.IO
// ============================================================================

TableGroup OrganizationAndRBAC {
  business_units
  cost_centers
  fund_sources
  fiscal_periods
  roles
  permissions
  role_permissions
  users
}

TableGroup AccountingAndTax {
  chart_of_accounts
  tax_configurations
  journal_entries
  journal_lines
  fixed_assets
}

TableGroup Budgeting3NF {
  budgets
  budget_lines
  budget_revisions
  budget_commitments
}

TableGroup ProcurementAndExpense3NF {
  vendors
  purchase_requests
  purchase_request_lines
  vendor_quotations
  purchase_orders
  purchase_order_lines
  goods_receipts
  goods_receipt_lines
  vendor_invoices
  expenses
}

TableGroup RevenueAndCashier3NF {
  customers
  products_services
  product_price_histories
  sales_orders
  sales_order_lines
  customer_invoices
  cash_registers
  cashier_sessions
  payments
  refunds
  cash_deposits
}

TableGroup ReconciliationAndGovernance3NF {
  bank_accounts
  bank_statement_imports
  bank_statement_lines
  strategic_evaluations
  audit_logs
}
```

---

## 3. Tabel Ringkasan Perbandingan Skema Fisik vs Skema Normalisasi (3NF)

Tabel ini dapat Anda masukkan langsung ke bab Perancangan Basis Data pada dokumentasi proyek:

| Aspek Normalisasi | Skema Fisik Aplikasi (`schema.prisma`) | Skema Dokumentasi Ter-normalisasi (`3NF`) | Alasan Normalisasi |
| :--- | :--- | :--- | :--- |
| **Hak Akses Peran (1NF)** | Kolom array `Role.permissions` (`String[]`) | Tabel `roles`, `permissions`, dan tabel penghubung `role_permissions` | Menghilangkan *multi-valued attribute* agar memenuhi syarat atomisitas **1NF**. |
| **Detail Barang PO & GR (2NF)** | Menyimpan ulang `itemName` dan `unit` di `PurchaseOrderLine` & `GoodsReceiptLine` | `purchase_order_lines` merujuk `pr_line_id`; `goods_receipt_lines` merujuk `po_line_id` | Menghilangkan duplikasi data deskriptif item agar memenuhi **2NF**. |
| **Nama Pelaku Transaksi (3NF)** | Menyimpan `createdById` + `createdByName`, `approvedByName`, `cashierName` | Hanya menyimpan Foreign Key `created_by_id`, `approved_by_id`, `cashier_user_id` -> `users.id` | Menghilangkan *transitive dependency* (`transaksi -> user_id -> full_name`) sesuai aturan **3NF**. |
| **Kolom Total & Saldo (3NF)** | Menyimpan `totalAllocated`, `totalCommitted`, `totalAmount`, `balanceDue`, `netAmount` | Dihitung melalui query agregasi (`SUM`) dari tabel baris (`*_lines` & `payments`) | Menghilangkan *derived attributes* yang berisiko menimbulkan anomali pembaruan (*update anomaly*) pada **3NF**. |
| **Relasi Rekonsiliasi & Jurnal (3NF)** | Polimorfik (`matchedEntityType` + `matchedEntityId`) & kode string | Foreign Key eksplisit (`matched_payment_id`, `matched_deposit_id`, `matched_expense_id`, `journal_entry_id`) | Menjamin integritas referensial (*referential integrity*) penuh di tingkat RDBMS dan memperjelas garis relasi pada ERD `dbdiagram.io`. |
