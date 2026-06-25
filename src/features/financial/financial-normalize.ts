import type { FinancialWorkspace as FinancialWorkspaceData } from "@/repositories/financial";

export function normalizeFinancialWorkspaceData(data: FinancialWorkspaceData): FinancialWorkspaceData {
  return {
    ...data,
    accounts: data.accounts ?? [],
    paymentMethods: data.paymentMethods ?? [],
    cardMachines: data.cardMachines ?? [],
    categories: data.categories ?? [],
    costCenters: data.costCenters ?? [],
    healthPlans: data.healthPlans ?? [],
    vendors: data.vendors ?? [],
    entries: (data.entries ?? []).map((entry) => ({
      ...entry,
      payments: entry.payments ?? [],
      receipts: entry.receipts ?? [],
      items: entry.items ?? [],
      events: entry.events ?? [],
      ledgerEntries: entry.ledgerEntries ?? [],
    })),
    payments: data.payments ?? [],
    recurringEntries: data.recurringEntries ?? [],
    reconciliations: data.reconciliations ?? [],
    commissionRules: data.commissionRules ?? [],
    commissions: data.commissions ?? [],
    commissionSettlements: data.commissionSettlements ?? [],
    bankImports: (data.bankImports ?? []).map((item) => ({ ...item, items: item.items ?? [] })),
    monthlyClosings: data.monthlyClosings ?? [],
    professionals: data.professionals ?? [],
    services: data.services ?? [],
    pendingEncounterCharges: data.pendingEncounterCharges ?? [],
    metrics: data.metrics ?? {
      receivableOpenCents: 0,
      receivablePaidCents: 0,
      payableOpenCents: 0,
      payablePaidCents: 0,
      overdueCents: 0,
      netCashCents: 0,
    },
  };
}
