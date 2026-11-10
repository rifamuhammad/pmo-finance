| id | task | status | notes |
| --- | --- | --- | --- |
| koi124-1 | Setup Jira Task KOI-124 linked to Epic KOI-122 & Git Branch | completed | Branch feature/KOI-124-core-double-entry-ledger-engine aktif |
| koi124-2 | Review & harden double-entry validation engine with decimal cent precision & storno reversal rules | completed | Enforce Debit = Credit, block closed/locked periods, immutable posted journals |
| koi124-3 | Verify & enhance General Ledger APIs with Unit Bisnis scoping, running balance & audit logs | completed | Endpoint /api/v1/accounting/ledger & /api/v1/accounting/journals |
| koi124-4 | Polish AccountingView.vue with real-time Trial Balance status & drilldown running balance | completed | Dropdown filter unit bisnis, balance badge, modal reversal with notes |
| koi124-5 | Add Section 17 integration tests in apps/api/src/tests/erp.test.ts for KOI-124 | completed | 57/57 Vitest integration tests passing 100% |
| koi124-6 | Quality Gate (typecheck, tests, build), docs, commit, push & set Jira to In Review | completed | Strictly In Review (anti-Done), PR link disiapkan |
