import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { useCreditUsage } from '@/hooks/use-credit-usage';
import { useUserProfile } from '@/hooks/use-user-profile';
import { formatUtcDate } from '@/lib/utils/api-datetime';
import {
  getBillingPeriodEndFromResetAt,
  hasCreditUsageData,
} from '@/types/credit-usage.type';

const DONUT_RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const PERCENT = 100;
const DIALOG_WIDTH = '800px';

interface UsageDialogProps {
  open: boolean;
  onClose: () => void;
}

function formatNumber(n: number): string {
  return n.toLocaleString('ja-JP');
}

function formatBillingPeriodEnd(nextBillingResetAt?: string): string {
  return formatUtcDate(getBillingPeriodEndFromResetAt(nextBillingResetAt));
}

/** ドーナツの進み具合。dashoffset が小さいほど円が埋まる */
function dashoffsetFor(ratio: number): number {
  return CIRCUMFERENCE * (1 - ratio);
}

interface DonutProps {
  dashoffset: number;
}

function Donut({ dashoffset }: DonutProps) {
  return (
    <svg viewBox="0 0 200 200" className="w-50 h-50 -rotate-90 pointer-events-none">
      <circle
        cx="100"
        cy="100"
        r={DONUT_RADIUS}
        fill="none"
        stroke="rgba(21,129,154,0.2)"
        strokeWidth="20"
      />
      <circle
        cx="100"
        cy="100"
        r={DONUT_RADIUS}
        fill="none"
        stroke="var(--color-brand-primary)"
        strokeWidth="20"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashoffset}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 移植元 `UsageDialogComponent` の本文。開くたびに作り直され、開いた時点で利用量を取りに行く */
function UsageDialogContent() {
  const { t } = useTranslation();
  const { meQuery, workspaceQuery, fetchUsage } = useCreditUsage();
  const profileQuery = useUserProfile();
  const [alertDismissed, setAlertDismissed] = useState(false);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const isLoading = meQuery.isPending || workspaceQuery.isPending;
  const meUsage = meQuery.data;
  const workspaceUsage = workspaceQuery.data;
  const hasPersonalUsage = hasCreditUsageData(meUsage);
  const hasWorkspaceUsage = hasCreditUsageData(workspaceUsage);

  const plan = profileQuery.data?.subscription?.plan;
  const personalUsed = meUsage?.totalCredits ?? 0;
  const personalLimit = plan?.maxCreditsPerDay ?? 0;
  const personalAlertPct = plan?.dailyAlertPercentage ?? 0;

  const workspaceUsed = workspaceUsage?.totalCredits ?? 0;
  const workspaceLimit = workspaceUsage?.creditLimit ?? 0;

  const personalRatio = personalLimit > 0 ? Math.min(personalUsed / personalLimit, 1) : 0;
  const showAlert =
    hasPersonalUsage &&
    !alertDismissed &&
    personalAlertPct > 0 &&
    personalRatio * PERCENT >= personalAlertPct &&
    personalRatio < 1;
  const showError = hasPersonalUsage && personalLimit > 0 && personalRatio >= 1;

  const workspaceRatio = workspaceLimit === 0 ? 0 : Math.min(workspaceUsed / workspaceLimit, 1);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {showAlert && (
        <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-caution" role="alert">
          <div className="flex gap-1 items-start">
            <span className="shrink-0 pt-px" aria-hidden="true">
              <SvgIcon name="alert" className="w-5 h-5 text-status-caution" />
            </span>
            <p className="flex-1 min-w-0 text-label-x-large font-medium text-text-strong">
              {t('USAGE_DIALOG.ALERT_TITLE')}
            </p>
            <button
              type="button"
              className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-text-strong cursor-pointer"
              aria-label={t('COMMON.CLOSE')}
              onClick={() => setAlertDismissed(true)}
            >
              <svg viewBox="0 0 20 20" className="w-3 h-3 fill-current text-text-white" aria-hidden="true">
                <path d="M15.2498 5.81836L14.1815 4.75003L9.99984 8.93169L5.81817 4.75003L4.74984 5.81836L8.9315 10L4.74984 14.1817L5.81817 15.25L9.99984 11.0684L14.1815 15.25L15.2498 14.1817L11.0682 10L15.2498 5.81836Z" />
              </svg>
            </button>
          </div>
          <p className="text-body-small font-normal text-text-strong leading-[1.7]">
            {t('USAGE_DIALOG.ALERT_DESC')}
          </p>
        </div>
      )}

      {showError && (
        <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-error" role="alert">
          <div className="flex gap-1 items-start">
            <span className="shrink-0 pt-px" aria-hidden="true">
              <SvgIcon name="alert" className="w-5 h-5 text-status-warning-primary" />
            </span>
            <p className="flex-1 min-w-0 text-label-x-large font-medium text-text-strong">
              {t('USAGE_DIALOG.ERROR_TITLE')}
            </p>
          </div>
          <p className="text-body-small font-normal text-text-strong leading-[1.7]">
            {t('USAGE_DIALOG.ERROR_DESC')}
          </p>
        </div>
      )}

      {hasPersonalUsage && (
        <div className="credit-panel">
          <p className="text-h2">{t('USAGE_DIALOG.PERSONAL_TITLE')}</p>
          <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-center">
            <div className="credit-donut">
              <Donut dashoffset={dashoffsetFor(personalRatio)} />
              <div className="credit-donut__center">
                <p className="text-label-small text-text-disabled">{t('USAGE_DIALOG.PERIOD_TOTAL')}</p>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-xl font-medium">{formatNumber(personalUsed)}</p>
                  {personalLimit > 0 && (
                    <>
                      <hr className="border-border-weak w-full" />
                      <p className="text-xl font-medium text-text-disabled">
                        {formatNumber(personalLimit)}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
            <dl className="credit-info-list">
              <div className="credit-info-row">
                <dt className="credit-info-term">{t('USAGE_DIALOG.BILLING_PERIOD')}</dt>
                <dd className="credit-info-desc">
                  {t('USAGE_DIALOG.BILLING_PERIOD_RANGE', {
                    from: formatUtcDate(meUsage?.periodFrom),
                    to: formatBillingPeriodEnd(meUsage?.nextBillingResetAt),
                  })}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {hasWorkspaceUsage && (
        <div className="credit-panel">
          <p className="text-h2">{t('USAGE_DIALOG.WORKSPACE_TITLE')}</p>
          <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-center">
            <div className="credit-donut">
              <Donut dashoffset={dashoffsetFor(workspaceRatio)} />
              <div className="credit-donut__center">
                <p className="text-label-small text-text-disabled">{t('USAGE_DIALOG.PERIOD_TOTAL')}</p>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-xl font-medium">{formatNumber(workspaceUsed)}</p>
                  <hr className="border-border-strong w-full" />
                  <p className="text-xl font-medium text-text-disabled">
                    {formatNumber(workspaceLimit)}
                  </p>
                </div>
              </div>
            </div>
            <dl className="credit-info-list">
              <div className="credit-info-row">
                <dt className="credit-info-term">{t('USAGE_DIALOG.BILLING_PERIOD')}</dt>
                <dd className="credit-info-desc">
                  {t('USAGE_DIALOG.BILLING_PERIOD_RANGE', {
                    from: formatUtcDate(workspaceUsage?.periodFrom),
                    to: formatBillingPeriodEnd(workspaceUsage?.nextBillingResetAt),
                  })}
                </dd>
              </div>
              <div className="credit-info-row">
                <dt className="credit-info-term">{t('USAGE_DIALOG.BILLING_PERIOD_STATUS')}</dt>
                <dd className="credit-info-desc">
                  {formatNumber(workspaceUsed)} / {formatNumber(workspaceLimit)}{' '}
                  {t('USAGE_DIALOG.CREDIT_UNIT')}
                  <span className="credit-info-desc-note">{t('USAGE_DIALOG.CREDIT_EXCEED_NOTE')}</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {!isLoading && !hasPersonalUsage && !hasWorkspaceUsage && (
        <p className="text-body-small text-text-weak text-center py-4">
          {t('USAGE_DIALOG.NO_SUBSCRIPTION')}
        </p>
      )}
    </div>
  );
}

// サイドバーのユーザーメニュー「クレジット確認」から開く（移植元 layouts/admin-layout/components/usage-dialog）。
// 移植元は MatDialog（width 800px・maxWidth 90vw）に本文を入れて開く
export function UsageDialog({ open, onClose }: UsageDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      title={t('USER_MENU.CHECK_CREDIT')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm={false}
      buttonAlign="center"
      dialogWidth={DIALOG_WIDTH}
      // .cdk-overlay-pane の max-width（レイヤー外の CSS）に勝つため important にする
      panelClass="max-w-[90vw]!"
      onClose={onClose}
    >
      <UsageDialogContent />
    </Dialog>
  );
}
