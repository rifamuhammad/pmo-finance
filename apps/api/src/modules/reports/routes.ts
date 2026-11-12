import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents, subMoney } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { AppError, requireAuth, requirePermission, requireRoles } from '../../middleware/auth.js';
import { queryQwenAiAssistant } from '../../shared/qwen.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

// 1. EXECUTIVE & ROLE-AWARE DASHBOARD
reportsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const { businessUnitId, fiscalPeriodId } = req.query;
    const unitFilter: Record<string, unknown> = {};

    if (req.user!.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(req.user!.roleCode)) {
      unitFilter.businessUnitId = req.user!.businessUnitId;
    } else if (typeof businessUnitId === 'string' && businessUnitId) {
      unitFilter.businessUnitId = businessUnitId;
    }

    const budgetFilter: Record<string, unknown> = {
      ...unitFilter,
      status: { in: ['APPROVED', 'REVISED'] },
    };
    if (typeof fiscalPeriodId === 'string' && fiscalPeriodId) {
      budgetFilter.fiscalPeriodId = fiscalPeriodId;
    }

    const [
      budgets,
      expenses,
      customerInvoices,
      payments,
      vendorInvoices,
      pendingApprovals,
      statementLines,
      cashierSessions,
      recentAuditLogs,
      businessUnits,
      salesOrders,
      customers,
      productServices,
    ] = await Promise.all([
      prisma.budget.findMany({
        where: budgetFilter,
        include: { businessUnit: true, lines: true },
      }),
      prisma.expense.findMany({
        where: { ...unitFilter, status: { not: 'VOID' } },
        include: { businessUnit: true },
      }),
      prisma.customerInvoice.findMany({
        where: { ...unitFilter, status: { not: 'VOID' } },
        include: { customer: true, businessUnit: true, lines: true },
      }),
      prisma.payment.findMany({
        where: {
          status: 'CONFIRMED',
          ...(unitFilter.businessUnitId
            ? { customerInvoice: { businessUnitId: unitFilter.businessUnitId as string } }
            : {}),
        },
      }),
      prisma.vendorInvoice.findMany({
        where: { ...unitFilter, status: { not: 'VOID' } },
        include: { vendor: true },
      }),
      prisma.approvalRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.bankStatementLine.findMany(),
      prisma.cashierSession.findMany({ where: unitFilter }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
      prisma.businessUnit.findMany({ orderBy: { code: 'asc' } }),
      prisma.salesOrder.findMany({
        where: unitFilter,
        include: { lines: true },
      }),
      prisma.customer.findMany(),
      prisma.productService.findMany({
        where: unitFilter,
        include: { businessUnit: true },
      }),
    ]);

    const totalBudgetAllocated = budgets.reduce((acc, b) => acc + Number(b.totalAllocated), 0);
    const totalBudgetCommitted = budgets.reduce((acc, b) => acc + Number(b.totalCommitted), 0);
    const totalExpenseActual = expenses
      .filter((e) => ['PAID', 'POSTED'].includes(e.status))
      .reduce((acc, e) => acc + Number(e.totalAmount), 0);
    const availableBudget = totalBudgetAllocated - totalBudgetCommitted - totalExpenseActual;

    // Crucial Rule (Section 6 Modul 1): Distinguish Invoiced Revenue vs Confirmed Cash Received!
    const totalInvoicedRevenue = customerInvoices.reduce((acc, inv) => acc + Number(inv.totalAmount), 0);
    const totalCashReceivedNet = payments.reduce((acc, p) => acc + Number(p.netAmount), 0);
    const netCashflow = totalCashReceivedNet - totalExpenseActual;

    const totalReceivablesOutstanding = customerInvoices.reduce((acc, inv) => acc + Number(inv.balanceDue), 0);
    const totalPayablesOutstanding = vendorInvoices.reduce(
      (acc, inv) => acc + (Number(inv.totalAmount) - Number(inv.paidAmount)),
      0
    );

    // Serapan Plafon Anggaran Persentase
    const realisasiBiayaPercent = totalBudgetAllocated > 0 ? Math.round((totalExpenseActual / totalBudgetAllocated) * 100) : 0;
    const komitmenPoPercent = totalBudgetAllocated > 0 ? Math.round((totalBudgetCommitted / totalBudgetAllocated) * 100) : 0;
    const totalSerapanPercent = Math.min(100, realisasiBiayaPercent + komitmenPoPercent);
    const sisaPlafonPercent = Math.max(0, 100 - totalSerapanPercent);

    // Budget vs Actual per Category
    const categories = ['CAPEX', 'OPEX', 'MODAL_KERJA', 'PENGADAAN', 'PEGAWAI', 'PAJAK'];
    const budgetByCategory = categories.map((cat) => {
      let allocated = 0;
      let committed = 0;
      let actual = 0;
      for (const b of budgets) {
        for (const l of b.lines) {
          if (l.category === cat) {
            allocated += Number(l.allocatedAmount);
            committed += Number(l.committedAmount);
            actual += Number(l.actualAmount);
          }
        }
      }
      return {
        category: cat,
        allocated,
        committed,
        actual,
        available: allocated - committed - actual,
        utilizationPercent: allocated > 0 ? Math.round(((committed + actual) / allocated) * 100) : 0,
      };
    });

    // 4 Divisi PMO UTama Performance Summary (USALI Aligned)
    const unitPerformance = businessUnits.map((u) => {
      const unitBudgets = budgets.filter((b) => b.businessUnitId === u.id);
      const unitAllocated = unitBudgets.reduce((acc, b) => acc + Number(b.totalAllocated), 0);
      const unitCommitted = unitBudgets.reduce((acc, b) => acc + Number(b.totalCommitted), 0);
      const unitExpense = expenses
        .filter((e) => e.businessUnitId === u.id && ['PAID', 'POSTED'].includes(e.status))
        .reduce((acc, e) => acc + Number(e.totalAmount), 0);
      const unitRevenue = customerInvoices
        .filter((inv) => inv.businessUnitId === u.id)
        .reduce((acc, inv) => acc + Number(inv.totalAmount), 0);

      const serapan = unitAllocated > 0 ? Math.round(((unitCommitted + unitExpense) / unitAllocated) * 100) : 0;

      return {
        unitId: u.id,
        unitCode: u.code,
        unitName: u.name,
        allocated: unitAllocated,
        committed: unitCommitted,
        actualExpense: unitExpense,
        invoicedRevenue: unitRevenue,
        operatingMargin: unitRevenue - unitExpense,
        utilizationPercent: serapan,
      };
    });

    // Real Top Services from Seeded PMO Catalog with Real Sales Order counts
    const productOrderMap = new Map<string, number>();
    for (const so of salesOrders) {
      for (const line of so.lines) {
        if (line.productServiceId) {
          productOrderMap.set(
            line.productServiceId,
            (productOrderMap.get(line.productServiceId) || 0) + Number(line.quantity)
          );
        }
      }
    }

    const palette = ['#034693', '#F59E0B', '#059669', '#2563EB', '#7C3AED', '#DC2626'];
    const topProducts = productServices.slice(0, 6).map((ps, idx) => ({
      id: ps.id,
      name: ps.name,
      code: ps.sku,
      category: ps.category,
      unitPrice: Number(ps.unitPrice),
      unitName: ps.businessUnit?.name || 'PMO UTama',
      orders: productOrderMap.get(ps.id) || 0,
      color: palette[idx % palette.length],
    }));

    // Real Monthly trends (12 months) directly aggregated from Database transactions
    const targetYear = parseInt(req.query.year as string) || 2026;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    const monthlyRev = Array(12).fill(0);
    const monthlyExp = Array(12).fill(0);
    const monthlyCash = Array(12).fill(0);

    for (const inv of customerInvoices) {
      const d = new Date(inv.issueDate);
      if (d.getFullYear() === targetYear) {
        monthlyRev[d.getMonth()] += Number(inv.totalAmount);
      }
    }

    for (const exp of expenses) {
      if (['PAID', 'POSTED'].includes(exp.status)) {
        const d = new Date(exp.transactionDate);
        if (d.getFullYear() === targetYear) {
          monthlyExp[d.getMonth()] += Number(exp.totalAmount);
        }
      }
    }

    for (const p of payments) {
      if (p.status === 'CONFIRMED') {
        const d = new Date(p.paymentDate);
        if (d.getFullYear() === targetYear) {
          monthlyCash[d.getMonth()] += Number(p.netAmount);
        }
      }
    }

    const monthlyTrends = monthNames.map((m, idx) => ({
      month: m,
      monthIndex: idx,
      year: targetYear,
      revenue: monthlyRev[idx],
      expense: monthlyExp[idx],
      cash: monthlyCash[idx],
      netMargin: monthlyCash[idx] - monthlyExp[idx],
    }));

    // Bank reconciliation status
    const reconSummary = {
      matched: statementLines.filter((l) => l.matchStatus === 'MATCHED').length,
      unmatched: statementLines.filter((l) => l.matchStatus === 'UNMATCHED').length,
      needsReview: statementLines.filter((l) => ['NEEDS_REVIEW', 'EXCEPTION'].includes(l.matchStatus)).length,
      total: statementLines.length,
    };

    // Operational warnings / alerts
    const alerts: Array<{ id: string; severity: 'WARNING' | 'DANGER' | 'INFO'; title: string; detail: string; route: string }> = [];

    for (const cat of budgetByCategory) {
      if (cat.allocated > 0 && cat.utilizationPercent >= 80) {
        alerts.push({
          id: `alert-bdg-${cat.category}`,
          severity: cat.utilizationPercent >= 95 ? 'DANGER' : 'WARNING',
          title: `Serapan Anggaran ${cat.category} Mencapai ${cat.utilizationPercent}%`,
          detail: `Sisa plafon tersedia Rp ${cat.available.toLocaleString('id-ID')} dari alokasi Rp ${cat.allocated.toLocaleString('id-ID')}.`,
          route: '/budgets',
        });
      }
    }

    const openCashierCount = cashierSessions.filter((s) => s.status === 'OPEN').length;
    const discrepancySessions = cashierSessions.filter((s) => s.status === 'CLOSING_SUBMITTED').length;
    if (discrepancySessions > 0) {
      alerts.push({
        id: 'alert-cashier-disc',
        severity: 'DANGER',
        title: `${discrepancySessions} Sesi Kasir Memiliki Selisih Fisik`,
        detail: 'Memerlukan verifikasi berita acara penutupan oleh Finance Manager.',
        route: '/cashier',
      });
    } else if (openCashierCount > 0) {
      alerts.push({
        id: 'alert-cashier-open',
        severity: 'INFO',
        title: `${openCashierCount} Register Kasir Sedang Beroperasi (OPEN)`,
        detail: 'Pastikan penutupan sesi dan hitung fisik kas dilakukan pada akhir shift.',
        route: '/cashier',
      });
    }

    if (reconSummary.unmatched + reconSummary.needsReview > 0) {
      alerts.push({
        id: 'alert-recon-unmatched',
        severity: 'WARNING',
        title: `${reconSummary.unmatched + reconSummary.needsReview} Baris Mutasi Bank Belum Terealisasi Rekonsiliasi`,
        detail: 'Tinjau mutasi rekening untuk mencocokkan penerimaan atau pengeluaran.',
        route: '/reconciliation',
      });
    }

    res.json({
      success: true,
      data: {
        isDemoEnvironment: true,
        kpis: {
          totalBudgetAllocated,
          totalBudgetCommitted,
          totalExpenseActual,
          availableBudget,
          totalInvoicedRevenue,
          totalCashReceivedNet,
          netCashflow,
          totalReceivablesOutstanding,
          totalPayablesOutstanding,
          pendingApprovalCount: pendingApprovals.length,
          totalOrders: salesOrders.length || customerInvoices.length,
          totalCustomers: customers.length,
          activeServicesCount: productServices.filter((p) => p.isActive).length,
          realisasiBiayaPercent,
          komitmenPoPercent,
          totalSerapanPercent,
          sisaPlafonPercent,
        },
        budgetByCategory: budgetByCategory.filter((c) => c.allocated > 0 || c.actual > 0),
        unitPerformance,
        reconSummary,
        topProducts,
        monthlyTrends,
        pendingApprovals: pendingApprovals.map((a) => ({
          ...a,
          amount: Number(a.amount),
        })),
        alerts,
        recentAuditLogs,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 2. CONSOLIDATED FINANCIAL & OPERATIONAL REPORTS
reportsRouter.get('/financial', requirePermission('report:view'), async (req, res, next) => {
  try {
    const { businessUnitId, fiscalPeriodId } = req.query;
    const entryWhere: Record<string, unknown> = { status: 'POSTED' };
    if (typeof businessUnitId === 'string' && businessUnitId) entryWhere.businessUnitId = businessUnitId;
    if (typeof fiscalPeriodId === 'string' && fiscalPeriodId) entryWhere.fiscalPeriodId = fiscalPeriodId;

    const [accounts, journalLines, budgets, payments, expenses] = await Promise.all([
      prisma.chartOfAccount.findMany({ orderBy: { code: 'asc' } }),
      prisma.journalLine.findMany({
        where: { journalEntry: entryWhere },
        include: { account: true, journalEntry: true },
      }),
      prisma.budget.findMany({
        where: {
          status: { in: ['APPROVED', 'REVISED'] },
          ...(typeof businessUnitId === 'string' && businessUnitId ? { businessUnitId } : {}),
        },
        include: { businessUnit: true, lines: { include: { costCenter: true } } },
      }),
      prisma.payment.findMany({ where: { status: 'CONFIRMED' } }),
      prisma.expense.findMany({ where: { status: { in: ['PAID', 'POSTED'] } } }),
    ]);

    const balances = accounts.map((acc) => {
      const lines = journalLines.filter((l) => l.accountCode === acc.code);
      let debitCents = 0n;
      let creditCents = 0n;
      for (const l of lines) {
        debitCents += toCents(l.debit);
        creditCents += toCents(l.credit);
      }
      const isContraAsset = acc.type === 'ASSET' && acc.normalBalance === 'CREDIT';
      let netCents = 0n;
      if (isContraAsset) {
        // Contra asset (Akumulasi Penyusutan) reduces total assets
        netCents = debitCents - creditCents;
      } else if (acc.normalBalance === 'DEBIT') {
        netCents = debitCents - creditCents;
      } else {
        netCents = creditCents - debitCents;
      }

      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        normalBalance: acc.normalBalance,
        isContraAsset,
        debit: Number(fromCents(debitCents)),
        credit: Number(fromCents(creditCents)),
        balance: Number(fromCents(netCents)),
      };
    });

    const revenueAccounts = balances.filter((b) => b.type === 'REVENUE');
    const expenseAccounts = balances.filter((b) => b.type === 'EXPENSE');
    const assetAccounts = balances.filter((b) => b.type === 'ASSET');
    const liabilityAccounts = balances.filter((b) => b.type === 'LIABILITY');
    const equityAccounts = balances.filter((b) => b.type === 'EQUITY');

    // ISAK 335 Asset Categories
    const currentAssetAccounts = balances.filter((b) => b.type === 'ASSET' && b.code.startsWith('11'));
    const nonCurrentAssetAccounts = balances.filter((b) => b.type === 'ASSET' && !b.code.startsWith('11'));
    const totalCurrentAssets = currentAssetAccounts.reduce((acc, a) => acc + a.balance, 0);
    const totalNonCurrentAssets = nonCurrentAssetAccounts.reduce((acc, a) => acc + a.balance, 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    // ISAK 335 Liability Categories
    const currentLiabilityAccounts = balances.filter((b) => b.type === 'LIABILITY' && b.code.startsWith('21'));
    const longTermLiabilityAccounts = balances.filter((b) => b.type === 'LIABILITY' && !b.code.startsWith('21'));
    const totalCurrentLiabilities = currentLiabilityAccounts.reduce((acc, a) => acc + a.balance, 0);
    const totalLongTermLiabilities = longTermLiabilityAccounts.reduce((acc, a) => acc + a.balance, 0);
    const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

    // ISAK 335 Net Assets (Aset Neto Tanpa Pembatasan vs Dengan Pembatasan)
    const unrestrictedAccounts = balances.filter((b) => b.code.startsWith('31'));
    const restrictedAccounts = balances.filter((b) => b.code.startsWith('32'));
    const unrestrictedBeginning = unrestrictedAccounts.reduce((acc, a) => acc + a.balance, 0);
    const restrictedBeginning = restrictedAccounts.reduce((acc, a) => acc + a.balance, 0);

    const totalRevenue = revenueAccounts.reduce((acc, a) => acc + a.balance, 0);
    const totalExpense = expenseAccounts.reduce((acc, a) => acc + a.balance, 0);
    const netIncome = totalRevenue - totalExpense; // Surplus / (Defisit) Neto Periode Berjalan

    const unrestrictedEnding = unrestrictedBeginning + netIncome;
    const restrictedEnding = restrictedBeginning;
    const totalNetAssets = unrestrictedEnding + restrictedEnding;

    const totalEquityBeforeCurrentIncome = equityAccounts.reduce((acc, a) => acc + a.balance, 0);
    const totalLiabilitiesAndNetAssets = totalLiabilities + totalNetAssets;
    const totalLiabilitiesAndEquity = totalLiabilitiesAndNetAssets;
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndNetAssets) < 1;

    const cashInFromCustomers = payments.reduce((acc, p) => acc + Number(p.netAmount), 0);
    const cashOutForExpenses = expenses.reduce((acc, e) => acc + Number(e.totalAmount), 0);

    // -------------------------------------------------------------
    // ISAK 335 DIRECT METHOD CASH FLOW STATEMENT
    // -------------------------------------------------------------
    const isCashAccount = (code: string) =>
      code.startsWith('1101') || code === '110501010100' || code === '1-1110' || code === '1-1120';

    const journalEntriesForCashFlow = await prisma.journalEntry.findMany({
      where: entryWhere,
      include: { lines: { include: { account: true } } },
      orderBy: { entryDate: 'asc' },
    });

    let operatingInflowsFromCustomers = 0;
    let operatingInflowsOther = 0;
    let operatingOutflowsToSuppliers = 0;
    let operatingOutflowsToEmployees = 0;
    let operatingOutflowsToPettyCash = 0;
    let operatingOutflowsTaxesAndOther = 0;

    let investingInflowsDisposals = 0;
    let investingOutflowsCapEx = 0;

    let financingInflowsContributions = 0;
    let financingOutflowsWithdrawals = 0;

    for (const jrn of journalEntriesForCashFlow) {
      const isAllCash = jrn.lines.every((l) => isCashAccount(l.accountCode));
      if (isAllCash) continue;

      const cashLines = jrn.lines.filter((l) => isCashAccount(l.accountCode));
      const nonCashLines = jrn.lines.filter((l) => !isCashAccount(l.accountCode));
      if (cashLines.length === 0 || nonCashLines.length === 0) continue;

      const totalCashDebit = cashLines.reduce((acc, l) => acc + Number(l.debit), 0);
      const totalCashCredit = cashLines.reduce((acc, l) => acc + Number(l.credit), 0);

      if (totalCashDebit > totalCashCredit) {
        const netInflow = totalCashDebit - totalCashCredit;
        const hasCode = (prefix: string) => nonCashLines.some((l) => l.accountCode.startsWith(prefix));

        if (hasCode('4') || hasCode('1103') || hasCode('2103')) {
          operatingInflowsFromCustomers += netInflow;
        } else if (hasCode('12')) {
          investingInflowsDisposals += netInflow;
        } else if (hasCode('3')) {
          financingInflowsContributions += netInflow;
        } else {
          operatingInflowsOther += netInflow;
        }
      } else if (totalCashCredit > totalCashDebit) {
        const netOutflow = totalCashCredit - totalCashDebit;
        const hasCode = (prefix: string) =>
          nonCashLines.some((l) => l.accountCode.startsWith(prefix) || l.accountCode === prefix);

        if (hasCode('5201')) {
          operatingOutflowsToEmployees += netOutflow;
        } else if (hasCode('110501010100')) {
          operatingOutflowsToPettyCash += netOutflow;
        } else if (hasCode('2101') || hasCode('5203') || hasCode('5202') || hasCode('5209') || hasCode('5-1400')) {
          operatingOutflowsToSuppliers += netOutflow;
        } else if (hasCode('12')) {
          investingOutflowsCapEx += netOutflow;
        } else if (hasCode('3')) {
          financingOutflowsWithdrawals += netOutflow;
        } else {
          operatingOutflowsTaxesAndOther += netOutflow;
        }
      }
    }

    const totalOperatingInflows = operatingInflowsFromCustomers + operatingInflowsOther;
    const totalOperatingOutflows =
      operatingOutflowsToSuppliers +
      operatingOutflowsToEmployees +
      operatingOutflowsToPettyCash +
      operatingOutflowsTaxesAndOther;
    const netOperatingCashFlow = totalOperatingInflows - totalOperatingOutflows;

    const totalInvestingInflows = investingInflowsDisposals;
    const totalInvestingOutflows = investingOutflowsCapEx;
    const netInvestingCashFlow = totalInvestingInflows - totalInvestingOutflows;

    const totalFinancingInflows = financingInflowsContributions;
    const totalFinancingOutflows = financingOutflowsWithdrawals;
    const netFinancingCashFlow = totalFinancingInflows - totalFinancingOutflows;

    const netCashIncreaseDecrease = netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow;

    const cashAndBankAccounts = balances
      .filter((b) => isCashAccount(b.code))
      .map((b) => ({
        code: b.code,
        name: b.name,
        balance: b.balance,
      }));
    const endingCashBalance = cashAndBankAccounts.reduce((acc, a) => acc + a.balance, 0);
    const beginningCashBalance = endingCashBalance - netCashIncreaseDecrease;

    const directCashFlowStatement = {
      standard: 'ISAK_335',
      operatingActivities: {
        inflows: {
          fromCustomers: operatingInflowsFromCustomers,
          otherOperating: operatingInflowsOther,
          totalInflows: totalOperatingInflows,
        },
        outflows: {
          toSuppliers: operatingOutflowsToSuppliers,
          toEmployees: operatingOutflowsToEmployees,
          pettyCashDisbursements: operatingOutflowsToPettyCash,
          taxesAndOther: operatingOutflowsTaxesAndOther,
          totalOutflows: totalOperatingOutflows,
        },
        netOperatingCashFlow,
      },
      investingActivities: {
        inflows: {
          assetDisposals: totalInvestingInflows,
          totalInflows: totalInvestingInflows,
        },
        outflows: {
          capitalExpenditures: totalInvestingOutflows,
          totalOutflows: totalInvestingOutflows,
        },
        netInvestingCashFlow,
      },
      financingActivities: {
        inflows: {
          capitalContributions: totalFinancingInflows,
          totalInflows: totalFinancingInflows,
        },
        outflows: {
          capitalWithdrawals: totalFinancingOutflows,
          totalOutflows: totalFinancingOutflows,
        },
        netFinancingCashFlow,
      },
      reconciliation: {
        netCashIncreaseDecrease,
        beginningCashBalance,
        endingCashBalance,
        cashAndBankAccounts,
        isReconciled: Math.abs(endingCashBalance - (beginningCashBalance + netCashIncreaseDecrease)) < 1,
      },
    };

    const budgetVsActualRows = budgets.flatMap((b) =>
      b.lines.map((l) => {
        const alloc = Number(l.allocatedAmount);
        const comm = Number(l.committedAmount);
        const act = Number(l.actualAmount);
        const avail = Number(subMoney(subMoney(l.allocatedAmount, l.committedAmount), l.actualAmount));
        return {
          budgetDocNumber: b.docNumber,
          unitName: b.businessUnit.name,
          costCenterCode: l.costCenter.code,
          category: l.category,
          accountCode: l.accountCode,
          description: l.description,
          allocated: alloc,
          committed: comm,
          actual: act,
          available: avail,
          absorptionRate: alloc > 0 ? Math.round(((comm + act) / alloc) * 100) : 0,
        };
      })
    );

    res.json({
      success: true,
      data: {
        standard: 'ISAK_335',
        incomeStatement: {
          revenueAccounts,
          expenseAccounts,
          totalRevenue,
          totalExpense,
          netIncome,
        },
        statementOfActivities: {
          standard: 'ISAK_335',
          revenueAccounts,
          expenseAccounts,
          totalRevenue,
          totalExpense,
          surplusDeficit: netIncome,
          unrestrictedSurplus: netIncome,
          restrictedSurplus: 0,
        },
        balanceSheet: {
          assetAccounts,
          liabilityAccounts,
          equityAccounts,
          currentPeriodEarnings: netIncome,
          totalAssets,
          totalLiabilities,
          totalEquity: totalNetAssets,
          totalLiabilitiesAndEquity,
          isBalanced,
          netAssetsUnrestricted: {
            accounts: unrestrictedAccounts,
            beginningBalance: unrestrictedBeginning,
            currentPeriodSurplus: netIncome,
            endingBalance: unrestrictedEnding,
          },
          netAssetsRestricted: {
            accounts: restrictedAccounts,
            beginningBalance: restrictedBeginning,
            currentPeriodSurplus: 0,
            endingBalance: restrictedEnding,
          },
          totalNetAssets,
        },
        statementOfFinancialPosition: {
          standard: 'ISAK_335',
          currentAssets: currentAssetAccounts,
          nonCurrentAssets: nonCurrentAssetAccounts,
          totalCurrentAssets,
          totalNonCurrentAssets,
          totalAssets,
          currentLiabilities: currentLiabilityAccounts,
          longTermLiabilities: longTermLiabilityAccounts,
          totalCurrentLiabilities,
          totalLongTermLiabilities,
          totalLiabilities,
          netAssets: {
            unrestricted: {
              accounts: unrestrictedAccounts,
              beginningBalance: unrestrictedBeginning,
              currentPeriodSurplus: netIncome,
              endingBalance: unrestrictedEnding,
            },
            restricted: {
              accounts: restrictedAccounts,
              beginningBalance: restrictedBeginning,
              currentPeriodSurplus: 0,
              endingBalance: restrictedEnding,
            },
            totalNetAssets,
          },
          totalLiabilitiesAndNetAssets,
          isBalanced,
        },
        cashFlowStatement: {
          cashInFromCustomers: directCashFlowStatement.operatingActivities.inflows.totalInflows,
          cashOutForExpenses: directCashFlowStatement.operatingActivities.outflows.totalOutflows,
          netOperatingCashFlow: directCashFlowStatement.operatingActivities.netOperatingCashFlow,
          directMethod: directCashFlowStatement,
        },
        directCashFlowStatement,
        budgetVsActualRows,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 3. CSV EXPORT WITH PERMISSION & METADATA HEADER
reportsRouter.get('/export', requirePermission('report:export'), async (req, res, next) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : 'budget-vs-actual';
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const lines: string[] = [
      `# LAPORAN ERP KEUANGAN & OPERASIONAL PMO UTAMA [STATUS DATA: DATA DEMO]`,
      `# Jenis Laporan: ${type.toUpperCase()}`,
      `# Waktu Ekspor (Asia/Jakarta): ${timestamp}`,
      `# Diekspor Oleh: ${req.user!.fullName} (${req.user!.roleCode})`,
      ``,
    ];

    if (type === 'journals') {
      const journals = await prisma.journalEntry.findMany({
        include: { businessUnit: true },
        orderBy: { entryDate: 'desc' },
      });
      lines.push('No Jurnal,Tanggal,Unit Bisnis,Sumber,Ref Dokumen,Uraian,Total Debit (IDR),Total Kredit (IDR),Status');
      for (const j of journals) {
        lines.push(
          `"${j.journalNumber}","${j.entryDate.toISOString().slice(0, 10)}","${j.businessUnit.code}","${j.sourceType}","${j.sourceDocNumber || '-'}","${j.description.replace(/"/g, '""')}",${j.totalDebit},${j.totalCredit},"${j.status}"`
        );
      }
    } else {
      const budgets = await prisma.budget.findMany({
        include: { businessUnit: true, lines: { include: { costCenter: true } } },
      });
      lines.push('No Anggaran,Unit Bisnis,Cost Center,Kategori,Kode Akun,Mata Anggaran,Plafon (IDR),Komitmen (IDR),Aktual (IDR),Sisa Tersedia (IDR)');
      for (const b of budgets) {
        for (const l of b.lines) {
          const avail = subMoney(subMoney(l.allocatedAmount, l.committedAmount), l.actualAmount);
          lines.push(
            `"${b.docNumber}","${b.businessUnit.name}","${l.costCenter.code}","${l.category}","${l.accountCode}","${l.description.replace(/"/g, '""')}",${l.allocatedAmount},${l.committedAmount},${l.actualAmount},${avail}`
          );
        }
      }
    }

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'REPORT_EXPORTED',
      module: 'REPORT',
      entityType: 'ReportExport',
      entityId: type,
      entityCode: type.toUpperCase(),
      summary: `Mengekspor laporan CSV (${type})`,
      requestId: req.requestId,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pmo-erp-${type}-${Date.now()}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

// 4. CENTRAL APPROVAL INBOX
reportsRouter.get('/approvals', async (req, res, next) => {
  try {
    const { status, module, scope } = req.query;
    const user = req.user!;
    const where: Record<string, unknown> = {};
    const isDevOrTest = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SELF_APPROVAL === 'true';

    if (typeof status === 'string' && status) where.status = status;
    if (typeof module === 'string' && module) where.module = module;

    // Role-based scoping: Unit Manager only sees requests belonging to their unit or created by them
    if (user.roleCode === 'UNIT_MANAGER') {
      const unitConditions: Record<string, unknown>[] = [{ requestedById: user.userId }];
      if (user.businessUnitId) {
        unitConditions.push({ businessUnitId: user.businessUnitId });
      }

      if (scope === 'assigned') {
        // Unit Managers have no direct approval authority over GM/FM items
        where.AND = [
          { requiredRoleCode: 'UNIT_MANAGER' },
          { OR: unitConditions },
        ];
      } else {
        where.OR = unitConditions;
      }
    } else if (user.roleCode === 'FINANCE_MANAGER') {
      if (scope === 'assigned') {
        where.requiredRoleCode = 'FINANCE_MANAGER';
        if (!isDevOrTest) {
          where.requestedById = { not: user.userId };
        }
      }
    } else if (user.roleCode === 'GM_PMO') {
      if (scope === 'assigned') {
        where.requiredRoleCode = { in: ['GM_PMO', 'FINANCE_MANAGER'] };
        if (!isDevOrTest) {
          where.requestedById = { not: user.userId };
        }
      }
    } else if (user.roleCode !== 'SUPER_ADMIN') {
      if (scope === 'assigned') {
        where.requiredRoleCode = user.roleCode;
      }
    }

    const approvals = await prisma.approvalRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    res.json({
      success: true,
      data: approvals.map((a) => {
        const isPending = a.status === 'PENDING';
        const isNotRequester = a.requestedById !== user.userId;
        const allowSelf = isDevOrTest || user.roleCode === 'SUPER_ADMIN';
        let canApprove = false;

        if (isPending && (isNotRequester || allowSelf)) {
          if (user.roleCode === 'SUPER_ADMIN') {
            canApprove = true;
          } else if (user.roleCode === 'GM_PMO') {
            canApprove = ['GM_PMO', 'FINANCE_MANAGER', 'UNIT_MANAGER'].includes(a.requiredRoleCode) || !a.requiredRoleCode;
          } else if (user.roleCode === 'FINANCE_MANAGER') {
            canApprove = ['FINANCE_MANAGER', 'UNIT_MANAGER'].includes(a.requiredRoleCode);
          } else if (user.roleCode === 'UNIT_MANAGER') {
            canApprove = a.requiredRoleCode === 'UNIT_MANAGER';
          }
        }

        return {
          ...a,
          amount: Number(a.amount),
          canApprove,
        };
      }),
      meta: { total: approvals.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 5. NOTIFICATIONS, AUDIT TRAIL & ATTACHMENTS
reportsRouter.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        OR: [{ userId: req.user!.userId }, { roleCode: req.user!.roleCode }, { roleCode: null }],
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json({ success: true, data: notifications, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

reportsRouter.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/audit-logs', requirePermission('audit:view'), async (req, res, next) => {
  try {
    const { module, action, search } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof module === 'string' && module) where.module = module;
    if (typeof action === 'string' && action) where.action = action;
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { summary: { contains: search.trim(), mode: 'insensitive' } },
        { entityCode: { contains: search.trim(), mode: 'insensitive' } },
        { actorName: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      success: true,
      data: logs,
      meta: { total: logs.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Safe File Attachment Metadata Registration (Validating MIME, Extension, and Size Limit)
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/csv'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const attachmentSchema = z.object({
  displayName: z.string().min(3),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  module: z.string().min(2),
  entityId: z.string().min(1),
  documentType: z.string().default('SUPPORTING_DOC'),
});

reportsRouter.post('/attachments', async (req, res, next) => {
  try {
    const parsed = attachmentSchema.parse(req.body);

    if (!ALLOWED_MIME_TYPES.includes(parsed.mimeType)) {
      throw new AppError(
        400,
        'UNSUPPORTED_FILE_TYPE',
        `Tipe file "${parsed.mimeType}" ditolak. Hanya mendukung PDF, PNG, JPEG, atau CSV.`
      );
    }

    if (parsed.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new AppError(
        400,
        'FILE_TOO_LARGE',
        `Ukuran file (${(parsed.sizeBytes / 1048576).toFixed(2)} MB) melebihi batas maksimum 10 MB.`
      );
    }

    // Never trust user-supplied path in storageKey
    const safeExt = parsed.displayName.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
    const storageKey = `priv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${safeExt}`;

    const created = await prisma.fileAttachment.create({
      data: {
        displayName: parsed.displayName.replace(/[\\/]/g, '_'),
        storageKey,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        module: parsed.module,
        entityId: parsed.entityId,
        documentType: parsed.documentType,
        uploadedById: req.user!.userId,
        uploadedByName: req.user!.fullName,
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'ATTACHMENT_UPLOADED',
      module: parsed.module,
      entityType: 'FileAttachment',
      entityId: created.id,
      entityCode: created.displayName,
      summary: `Mengunggah dokumen pendukung "${created.displayName}" (${(created.sizeBytes / 1024).toFixed(1)} KB)`,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 6. STRATEGIC EVALUATION & NEXT-PERIOD BUDGET CEILING RECOMMENDATION
reportsRouter.get('/strategy/evaluations', requirePermission('strategy:view'), async (req, res, next) => {
  try {
    const evaluations = await prisma.strategicEvaluation.findMany({
      include: { fiscalPeriod: true, businessUnit: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: evaluations.map((ev) => ({
        ...ev,
        targetRevenue: Number(ev.targetRevenue),
        actualRevenue: Number(ev.actualRevenue),
        budgetCeiling: Number(ev.budgetCeiling),
        actualExpense: Number(ev.actualExpense),
        netCashflow: Number(ev.netCashflow),
        recommendedNextCeiling: Number(ev.recommendedNextCeiling),
        recommendedRevenueTarget: Number(ev.recommendedRevenueTarget),
      })),
      meta: { total: evaluations.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createEvalSchema = z.object({
  fiscalPeriodId: z.string().min(1),
  businessUnitId: z.string().min(1),
  varianceAnalysis: z.string().min(10),
  riskSummary: z.string().min(10),
  recommendedNextCeiling: z.number().positive(),
  recommendedRevenueTarget: z.number().positive(),
});

reportsRouter.post('/strategy/evaluations', requirePermission('strategy:manage'), async (req, res, next) => {
  try {
    const parsed = createEvalSchema.parse(req.body);

    const [budgets, invoices, expenses] = await Promise.all([
      prisma.budget.findMany({
        where: { businessUnitId: parsed.businessUnitId, fiscalPeriodId: parsed.fiscalPeriodId },
      }),
      prisma.customerInvoice.findMany({
        where: { businessUnitId: parsed.businessUnitId, status: { not: 'VOID' } },
      }),
      prisma.expense.findMany({
        where: { businessUnitId: parsed.businessUnitId, status: { in: ['PAID', 'POSTED'] } },
      }),
    ]);

    const targetRevenue = budgets.reduce((acc, b) => acc + Number(b.revenueTarget), 0);
    const budgetCeiling = budgets.reduce((acc, b) => acc + Number(b.totalAllocated), 0);
    const actualRevenue = invoices.reduce((acc, i) => acc + Number(i.totalAmount), 0);
    const actualExpense = expenses.reduce((acc, e) => acc + Number(e.totalAmount), 0);
    const netCashflow = actualRevenue - actualExpense;

    const count = await prisma.strategicEvaluation.count();
    const evalNumber = `EVAL-2026-${String(count + 1).padStart(3, '0')}`;

    const created = await prisma.strategicEvaluation.create({
      data: {
        evalNumber,
        fiscalPeriodId: parsed.fiscalPeriodId,
        businessUnitId: parsed.businessUnitId,
        targetRevenue: fromCents(toCents(targetRevenue)),
        actualRevenue: fromCents(toCents(actualRevenue)),
        budgetCeiling: fromCents(toCents(budgetCeiling)),
        actualExpense: fromCents(toCents(actualExpense)),
        netCashflow: fromCents(toCents(netCashflow)),
        varianceAnalysis: parsed.varianceAnalysis.trim(),
        riskSummary: parsed.riskSummary.trim(),
        recommendedNextCeiling: fromCents(toCents(parsed.recommendedNextCeiling)),
        recommendedRevenueTarget: fromCents(toCents(parsed.recommendedRevenueTarget)),
        gmDecision: 'PENDING',
      },
      include: { fiscalPeriod: true, businessUnit: true },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'STRATEGIC_EVALUATION_CREATED',
      module: 'STRATEGY',
      entityType: 'StrategicEvaluation',
      entityId: created.id,
      entityCode: created.evalNumber,
      summary: `Menyusun evaluasi strategis periode ${created.evalNumber} untuk ${created.businessUnit.name}`,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const decideEvalSchema = z.object({
  decision: z.enum(['APPROVED', 'REVISION_REQUIRED', 'REJECTED']),
  note: z.string().min(5, 'Catatan keputusan strategis GM wajib diisi.'),
  adjustedNextCeiling: z.number().positive().optional(),
  adjustedRevenueTarget: z.number().positive().optional(),
});

reportsRouter.post(
  '/strategy/evaluations/:id/decide',
  requireRoles('GM_PMO'),
  async (req, res, next) => {
    try {
      const parsed = decideEvalSchema.parse(req.body);
      const ev = await prisma.strategicEvaluation.findUnique({ where: { id: req.params.id } });
      if (!ev) throw new AppError(404, 'EVAL_NOT_FOUND', 'Dokumen evaluasi strategis tidak ditemukan.');

      const updated = await prisma.strategicEvaluation.update({
        where: { id: ev.id },
        data: {
          gmDecision: parsed.decision,
          gmDecisionNote: parsed.note.trim(),
          recommendedNextCeiling: parsed.adjustedNextCeiling
            ? fromCents(toCents(parsed.adjustedNextCeiling))
            : ev.recommendedNextCeiling,
          recommendedRevenueTarget: parsed.adjustedRevenueTarget
            ? fromCents(toCents(parsed.adjustedRevenueTarget))
            : ev.recommendedRevenueTarget,
          decidedById: req.user!.userId,
          decidedByName: req.user!.fullName,
          decidedAt: new Date(),
        },
        include: { fiscalPeriod: true, businessUnit: true },
      });

      await recordAuditLog({
        actorId: req.user!.userId,
        actorName: req.user!.fullName,
        actorRole: req.user!.roleCode,
        action: 'STRATEGIC_EVALUATION_DECIDED',
        module: 'STRATEGY',
        entityType: 'StrategicEvaluation',
        entityId: updated.id,
        entityCode: updated.evalNumber,
        summary: `Keputusan GM PMO atas evaluasi ${updated.evalNumber}: ${updated.gmDecision}. Catatan: ${parsed.note}`,
        requestId: req.requestId,
      });

      res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  }
);

// 12. AI FINANCIAL ASSISTANT (ODTI-STYLE COPILOT FOR PMO FINANCE)
const aiAssistantSchema = z.object({
  query: z.string().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

function formatRupiahInt(amount: number): string {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

reportsRouter.post('/ai-assistant', async (req, res, next) => {
  try {
    const { query, history } = aiAssistantSchema.parse(req.body);
    const qLower = query.toLowerCase();
    const user = req.user!;

    // Scoped context based on role and unit
    const unitFilter: Record<string, unknown> = {};
    if (user.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(user.roleCode)) {
      unitFilter.businessUnitId = user.businessUnitId;
    }

    // Fetch live ERP context
    const [currentUserData, budgets, expenses, approvals, customerInvoices, cashierSessions, businessUnits] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.userId },
        include: { businessUnit: true, role: true },
      }),
      prisma.budget.findMany({
        where: {
          ...unitFilter,
          status: { in: ['APPROVED', 'REVISED'] },
        },
        include: { businessUnit: true, lines: true },
      }),
      prisma.expense.findMany({
        where: unitFilter,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { businessUnit: true },
      }),
      prisma.approvalRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.customerInvoice.findMany({
        where: unitFilter,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { businessUnit: true, customer: true },
      }),
      prisma.cashierSession.findMany({
        where: { status: 'OPEN' },
        include: { cashRegister: true },
      }),
      prisma.businessUnit.findMany({ where: { isActive: true } }),
    ]);

    // Calculate aggregated metrics
    let totalAllocated = 0;
    let totalCommitted = 0;
    let totalActualExpense = 0;

    budgets.forEach((b) => {
      b.lines.forEach((l) => {
        totalAllocated += Number(l.allocatedAmount);
        totalCommitted += Number(l.committedAmount);
        totalActualExpense += Number(l.actualAmount);
      });
    });

    const totalAvailable = Math.max(0, totalAllocated - totalCommitted - totalActualExpense);

    const qwenResult = await queryQwenAiAssistant({
      query,
      history,
      context: {
        user: {
          fullName: currentUserData?.fullName || user.fullName,
          email: currentUserData?.email || user.email,
          roleCode: user.roleCode,
          roleName: currentUserData?.role?.name || user.roleCode,
          businessUnitId: user.businessUnitId,
          businessUnitName: currentUserData?.businessUnit?.name || 'Kantor Pusat / Holding (Lintas Divisi)',
        },
        metrics: {
          totalAllocated,
          totalCommitted,
          totalActualExpense,
          totalAvailable,
          serapanPercent:
            totalAllocated > 0
              ? Math.round(((totalCommitted + totalActualExpense) / totalAllocated) * 100)
              : 0,
        },
        budgets: budgets.map((b) => ({
          title: b.title,
          unitCode: b.businessUnit?.code,
          unitName: b.businessUnit?.name,
          allocated: b.lines.reduce((acc, l) => acc + Number(l.allocatedAmount), 0),
          committed: b.lines.reduce((acc, l) => acc + Number(l.committedAmount), 0),
          actual: b.lines.reduce((acc, l) => acc + Number(l.actualAmount), 0),
        })),
        pendingApprovals: approvals.map((a) => ({
          code: a.entityCode || a.requestNumber,
          module: a.module,
          title: a.title,
          requestedBy: a.requestedByName,
          requiredRole: a.requiredRoleCode,
        })),
        recentExpenses: expenses.map((e) => ({
          docNumber: e.docNumber,
          title: e.title,
          recipientName: e.recipientName,
          amount: Number(e.totalAmount),
          status: e.status,
        })),
        unpaidInvoices: customerInvoices
          .filter((i) => i.status !== 'PAID')
          .map((i) => ({
            docNumber: i.docNumber,
            customerName: i.customer?.name || 'Pelanggan',
            amount: Number(i.totalAmount),
            status: i.status,
          })),
        openCashierSessionsCount: cashierSessions.length,
      },
    });

    res.json({
      success: true,
      data: {
        reply: qwenResult.reply,
        suggestions: qwenResult.suggestions,
        provider: qwenResult.provider,
        model: qwenResult.model,
        contextMetrics: {
          totalAllocated,
          totalCommitted,
          totalActualExpense,
          totalAvailable,
          pendingApprovalsCount: approvals.length,
          expensesCount: expenses.length,
          openCashierSessionsCount: cashierSessions.length,
        },
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});
