export interface CreditUsageResponse {
  totalCredits?: number;
  creditLimit?: number;
  periodFrom?: string;
  periodTo?: string;
  nextBillingResetAt?: string;
}

export function hasCreditUsageData(data: CreditUsageResponse | undefined): boolean {
  return data != null && data.totalCredits != null;
}

/** Returns the billing period end instant (day before `nextBillingResetAt`). */
export function getBillingPeriodEndFromResetAt(nextBillingResetAt?: string): string | undefined {
  if (!nextBillingResetAt) return undefined;
  const resetDate = new Date(nextBillingResetAt);
  if (Number.isNaN(resetDate.getTime())) return undefined;
  resetDate.setUTCDate(resetDate.getUTCDate() - 1);
  return resetDate.toISOString();
}
