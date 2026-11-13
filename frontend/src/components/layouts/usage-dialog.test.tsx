import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { UsageDialog } from './usage-dialog';

const FIXTURE_PLAN = {
  id: 'p1',
  name: 'Standard',
  maxUsers: 10,
  maxCreditsPerMonth: 1000,
  maxCreditsPerDay: 100,
  alertPercentage: 80,
  dailyAlertPercentage: 80,
};
const FIXTURE_PROFILE = {
  id: 'u1',
  loginId: 'user1',
  name: 'ユーザー',
  role: 'USER',
  hasLoginKey: false,
  subscription: {
    id: 's1',
    status: 'active',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    plan: FIXTURE_PLAN,
  },
};
const FIXTURE_WORKSPACE = {
  totalCredits: 250,
  creditLimit: 1000,
  periodFrom: '2026-11-02T00:00:00Z',
  nextBillingResetAt: '2026-12-02T00:00:00Z',
};

function useUsage(me: Record<string, unknown>, workspace: Record<string, unknown>) {
  server.use(
    http.get(mockPath(API_PATHS.CREDIT_USAGE.ME), () => HttpResponse.json(me)),
    http.get(mockPath(API_PATHS.CREDIT_USAGE.WORKSPACE), () => HttpResponse.json(workspace)),
    http.get(mockPath(API_PATHS.USERS.PROFILE), () => HttpResponse.json(FIXTURE_PROFILE))
  );
}

function renderDialog(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <UsageDialog open onClose={onClose} />
    </QueryClientProvider>
  );
  return onClose;
}

describe('UsageDialog（クレジット確認）', () => {
  test('閉じているときは何も表示しないこと', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <UsageDialog open={false} onClose={vi.fn()} />
      </QueryClientProvider>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('個人とワークスペースの利用量・請求期間を表示すること', async () => {
    useUsage({ totalCredits: 10, periodFrom: '2026-11-02T00:00:00Z', nextBillingResetAt: '2026-12-02T00:00:00Z' }, FIXTURE_WORKSPACE);
    renderDialog();

    expect(await screen.findByText('USAGE_DIALOG.PERSONAL_TITLE')).toBeInTheDocument();
    expect(screen.getByText('USAGE_DIALOG.WORKSPACE_TITLE')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText(/250 \/ 1,000/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('1日の上限の80%以上で警告を表示し、閉じられること', async () => {
    const user = userEvent.setup();
    useUsage({ totalCredits: 85 }, FIXTURE_WORKSPACE);
    renderDialog();

    expect(await screen.findByText('USAGE_DIALOG.ALERT_TITLE')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'COMMON.CLOSE' }));

    expect(screen.queryByText('USAGE_DIALOG.ALERT_TITLE')).not.toBeInTheDocument();
  });

  test('上限に達するとエラーを表示すること', async () => {
    useUsage({ totalCredits: 100 }, FIXTURE_WORKSPACE);
    renderDialog();

    expect(await screen.findByText('USAGE_DIALOG.ERROR_TITLE')).toBeInTheDocument();
    expect(screen.queryByText('USAGE_DIALOG.ALERT_TITLE')).not.toBeInTheDocument();
  });

  test('利用情報がないときは案内を表示すること', async () => {
    useUsage({}, {});
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('USAGE_DIALOG.NO_SUBSCRIPTION')).toBeInTheDocument();
    });
  });

  test('キャンセルで閉じる通知が呼ばれること', async () => {
    const user = userEvent.setup();
    useUsage({}, {});
    const onClose = renderDialog();

    await user.click(screen.getByTestId('dialog-cancel-button'));

    expect(onClose).toHaveBeenCalled();
  });
});
