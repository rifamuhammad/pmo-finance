# PMO UTama x DropX Admin Design System

Authenticated institutional ERP for PMO UTama finance leadership and operators, pairing ThemeWagon DropX Admin's clean light sidebar shell and luminous KPI cards with PMO UTama's corporate palette and strict per-feature separation.

## 1. Typography (1:1 DropX Admin Variable Font System)
- Self-hosted official `Geist` (`font-weight: 100 900`) and `Geist Mono` (`font-weight: 100 900`) variable `.woff2` fonts in `apps/web/src/assets/fonts/` with `font-synthesis-weight: none` and `text-rendering: optimizeLegibility`.
- Root Scale: `html { font-size: 16px; }`, `body { font-size: 14px; font-weight: 400; }`, `button, input, select, textarea { font-family: inherit; }`.
- Restrained DropX Weight Hierarchy:
  - Page `<h1>`: `20px`, `font-weight: 600`, `letter-spacing: -0.025em`.
  - Card `<h2>`: `14.5px`, `font-weight: 600`, `letter-spacing: -0.015em`.
  - KPI values: `20px-24px`, `font-weight: 700`, `letter-spacing: -0.025em`, `tabular-nums`; KPI labels/footers: `font-weight: 400`.
  - Tables: `12px` Title-Case `font-weight: 500` headers (no ALL-CAPS), `font-weight: 500` row labels & mono document codes, `font-weight: 400` metadata, `font-weight: 600` numeric amounts.
  - Buttons, pills, badges, and nav links: `font-weight: 500`.

## 2. Surfaces & PMO UTama x DropX Palette
- Canvas: `#f9fafb`, Elevated Surface & Sidebar: `#ffffff`, Hairline Border: `#e5e7eb`.
- Primary Ink: `#111827`, Secondary Ink: `#6b7280`.
- Brand Accent: PMO Royal Blue `#034693` and PMO Navy `#0b2144`.
- DropX Luminous Gradient KPI Cards (with soft translucent corner orbs & top-right frosted icon tile):
  - Navy-Royal: `linear-gradient(135deg, #0b2144 0%, #034693 100%)`
  - Luminous Emerald: `linear-gradient(135deg, #22c55e 0%, #10b981 55%, #059669 100%)`
  - Luminous Ocean: `linear-gradient(135deg, #38bdf8 0%, #0ea5e9 55%, #0284c7 100%)`
  - Luminous Amber: `linear-gradient(135deg, #f59e0b 0%, #d97706 100%)`

## 3. Navigation & Strict Feature Isolation
- Post-login Module Picker (`/`): clean 2-card selector (`Penerimaan` and `Pengeluaran`) only, with RBAC access states and zero dashboard clutter.
- Pure white `252px` (`60px` collapsed) DropX sidebar + frosted `69px` topbar (`rgba(255, 255, 255, 0.85)`, `backdrop-filter: blur(8px)`) + in-main breadcrumbs + full-bleed hairline data tables.
- Strict feature isolation: every page focuses exclusively on its own feature with zero cross-feature links, workflow jump bars, quick-shortcut grids, or duplicate inner tab strips inside pages. Switching features is done cleanly through the left sidebar while backend data stays fully connected.
- Responsive across phone (`< 680px`, labeled `Menu` drawer trigger, `>= 44px` touch targets), tablet (`680px-1023px`), and desktop (`>= 1024px`).
