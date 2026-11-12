export interface SelectOption<T = string> {
  label: string;
  value: T;
  disabled?: boolean;
  description?: string;
  category?: string;
}

export type ResponseStatus = 'OK' | 'ERROR' | 'PENDING' | 'COMPLETE' | 'STREAMING';

export interface PlanResponse {
  id: string;
  name: string;
  maxUsers: number;
  maxCreditsPerMonth: number;
  maxCreditsPerDay: number | null;
  alertPercentage: number | null;
  dailyAlertPercentage: number | null;
}

export interface SubscriptionResponse {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  plan: PlanResponse;
}
