# ERP Frontend Quality & User-Centered Design Rules

## 1. Zero-Slop Copywriting & Information Architecture
- **No Text Gelondongan**: Avoid multi-line explanatory paragraphs in page headers, cards, and tooltips. Finance professionals and executives scan numbers and metrics in milliseconds; do not force them to read academic or ceremonial prose.
- **Short Subtitles**: Limit page subtitles to concise, functional descriptions (e.g. *"Alokasi plafon belanja operasional dan kontrol realisasi per unit bisnis"* instead of *"Kelola siklus plafon modal, pengajuan persetujuan berjenjang, revisi plafon ber-histori, dan kontrol realisasi per unit bisnis"*).
- **Tab Cleanliness**: Never use ordered numbering on navigation tabs (e.g., use `Faktur Tagihan & Pembayaran`, NOT `1. Tagihan (Invoice) & Pembayaran`).
- **No Self-Validating AI Badges**: Never add badges claiming *"Data Riil PostgreSQL"* or *"AI Verified"*. Real ERP enterprise software (SAP, Odoo, Oracle NetSuite) simply displays verified metrics directly.

## 2. Visual Hierarchy & Palette Restraint
- **Brand Palette**:
  - Primary PMO Royal Navy: `#034693`
  - Warning / Alert Golden Amber: `#F59E0B`
  - Success / Cash In Forest Emerald: `#059669`
  - Canvas: `#F0F2F5`
  - Card Surfaces: `#FFFFFF`
- **Zero Redundant Visualizations**: Never duplicate charts showing the same datasets on the same page. If a comparative curve chart is present, provide liquidity, aging receivables, or bank reconciliation tables rather than rendering a duplicate bar chart.
- **Micro-Interactions**: Maximum transition duration 150ms-200ms without endless bouncing animations.

## 3. Financial Table & Numbers Standard
- **Tabular Numbers**: Always use `font-variant-numeric: tabular-nums` or `money` class on all IDR amounts, quantities, and dates so columns align vertically.
- **Alignment**: Text left-aligned, status badges centered, currency and numeric amounts right-aligned.
