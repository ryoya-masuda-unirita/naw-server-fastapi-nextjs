import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { FIXTURE_TENANT_DETAIL } from '@/mocks/handlers/admin-tenant';
import { useToastStore } from '@/components/shared/toast-store';
import type { PlanResponse } from '@/types/common';
import { UsageLimitDialog } from './usage-limit-dialog';

const FIXTURE_PLAN: PlanResponse = {
  id: 'plan-1',
  name: 'ライトプラン',
  maxUsers: 10,
  maxCreditsPerMonth: 10000,
  maxCreditsPerDay: 100,
  alertPercentage: 80,
  dailyAlertPercentage: null,
};

const usageLimitPath = mockPath(API_PATHS.ADMIN.TENANTS.UPDATE_USAGE_LIMIT(':tenantId'));
const toastMessages = () => useToastStore.getState().toasts.map((toast) => toast.message);

function renderDialog(mode: 'monthly' | 'daily', onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // 保存はテナント ID が分かっていないと何もしないので、取得済みにしておく
  queryClient.setQueryData(['tenant', 'info'], FIXTURE_TENANT_DETAIL);
  render(
    <QueryClientProvider client={queryClient}>
      <UsageLimitDialog mode={mode} plan={FIXTURE_PLAN} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, user: userEvent.setup() };
}

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('利用制限の編集ダイアログ', () => {
  test('契約プランの値を入力欄の初期値にすること', () => {
    renderDialog('monthly');

    expect(screen.getByTestId('usage-limit-input')).toHaveValue(10000);
    expect(screen.getByText('TENANT.WS_LIMIT_EDIT')).toBeInTheDocument();
  });

  test('日間の編集では日間の上限を初期値にすること', () => {
    renderDialog('daily');

    expect(screen.getByTestId('usage-limit-input')).toHaveValue(100);
    expect(screen.getByText('TENANT.USER_LIMIT_EDIT')).toBeInTheDocument();
  });

  test('数字以外を取り除き、先頭の 0 を落とすこと', async () => {
    const { user } = renderDialog('monthly');
    const input = screen.getByTestId('usage-limit-input');

    await user.clear(input);
    await user.type(input, '007');

    expect(input).toHaveValue(7);
  });

  test('0 を入力すると 1 以上を求めるエラーを出すこと', async () => {
    const { user } = renderDialog('monthly');
    const input = screen.getByTestId('usage-limit-input');

    await user.clear(input);
    await user.type(input, '0');

    expect(screen.getByText('1以上の数値を入力してください')).toBeInTheDocument();
  });

  test('上限を空にすると保存できないこと', async () => {
    const { user } = renderDialog('monthly');

    await user.clear(screen.getByTestId('usage-limit-input'));

    expect(screen.getByTestId('dialog-confirm-button')).toBeDisabled();
  });

  test('保存先の API が無いため、失敗のトーストを出してダイアログを残すこと', async () => {
    server.use(http.patch(usageLimitPath, () => HttpResponse.json({ message: 'Not Found' }, { status: 404 })));
    const { onClose, user } = renderDialog('monthly');

    await user.click(screen.getByTestId('dialog-confirm-button'));

    await waitFor(() => expect(toastMessages()).toContain('TENANT.UPDATE_USAGE_LIMIT_FAILED'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('月間の保存は月間上限とアラートを送ること', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch(usageLimitPath, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    const { onClose, user } = renderDialog('monthly');

    await user.click(screen.getByTestId('dialog-confirm-button'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ maxCreditsPerMonth: 10000, alertPercentage: 80 }]);
    expect(toastMessages()).toContain('TENANT.UPDATE_USAGE_LIMIT_SUCCESS');
  });

  test('日間の保存は日間上限とアラートを送り、アラート未選択は 0 にすること', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch(usageLimitPath, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    const { onClose, user } = renderDialog('daily');

    await user.click(screen.getByTestId('dialog-confirm-button'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ maxCreditsPerDay: 100, dailyAlertPercentage: 0 }]);
  });
});
