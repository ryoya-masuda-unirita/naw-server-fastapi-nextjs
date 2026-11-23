import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { Select } from '@/components/shared/select';
import type { SelectOption } from '@/components/shared/types';
import { useUpdateUsageLimit } from '@/hooks/use-tenant';
import type { PlanResponse } from '@/types/common';

/** ダイアログの幅（移植元 `width: '800px', maxWidth: '90vw'`） */
const DIALOG_WIDTH = 'min(800px, 90vw)';
const ALERT_PERCENTAGES = ['60', '70', '80', '90', '95'];
const MIN_LIMIT = 0;

export type UsageLimitMode = 'monthly' | 'daily';

interface UsageLimitFormData {
  monthlyLimit: string;
  dailyLimit: string;
  alertPercentage: string | null;
  dailyAlertPercentage: string | null;
}

interface UsageLimitDialogProps {
  /** monthly はワークスペースの月間上限、daily はユーザーの日間上限 */
  mode: UsageLimitMode;
  /** 入力欄の初期値にする契約プラン */
  plan: PlanResponse | undefined;
  onClose: () => void;
}

/** 移植元 usage-tab の `onOpenWsLimitDialog`・`onOpenUserLimitDialog` が組む初期値 */
function buildInitialForm(mode: UsageLimitMode, plan: PlanResponse | undefined): UsageLimitFormData {
  if (mode === 'monthly') {
    return {
      monthlyLimit: String(plan?.maxCreditsPerMonth ?? ''),
      dailyLimit: '',
      alertPercentage: plan?.alertPercentage ? String(plan.alertPercentage) : null,
      dailyAlertPercentage: null,
    };
  }
  return {
    monthlyLimit: '',
    dailyLimit: String(plan?.maxCreditsPerDay ?? ''),
    alertPercentage: null,
    dailyAlertPercentage: plan?.dailyAlertPercentage ? String(plan.dailyAlertPercentage) : null,
  };
}

/**
 * 移植元の利用制限の編集ダイアログ（`<app-usage-limit-dialog>` を入れた DialogComponent）。
 * 保存先の API は移植元 server にも無く、保存すると失敗のトーストになる（移植元の本番と同じ）。
 * 入力欄の日本語は移植元がハードコードしているのでそのまま移す。
 */
export function UsageLimitDialog({ mode, plan, onClose }: UsageLimitDialogProps) {
  const { t } = useTranslation();
  const { updateUsageLimit, isPending } = useUpdateUsageLimit();
  const [form, setForm] = useState<UsageLimitFormData>(() => buildInitialForm(mode, plan));
  const [limitTouched, setLimitTouched] = useState(false);
  const isDaily = mode === 'daily';

  const limitValue = isDaily ? form.dailyLimit : form.monthlyLimit;
  const limitError = limitTouched && limitValue && Number(limitValue) <= MIN_LIMIT ? '1以上の数値を入力してください' : '';
  const alertValue = isDaily ? form.dailyAlertPercentage : form.alertPercentage;
  const prefix = isDaily ? '日間' : '月間';
  const alertOptions: SelectOption[] = ALERT_PERCENTAGES.map((value) => ({
    value,
    label: `${prefix}上限の${value} %`,
  }));

  const updateLimit = (value: string) => {
    setLimitTouched(true);
    // 数字以外を取り除き、先頭の 0 を落とす
    const numeric = value.replace(/\D/g, '').replace(/^0+(\d)/, '$1');
    setForm((prev) => (isDaily ? { ...prev, dailyLimit: numeric } : { ...prev, monthlyLimit: numeric }));
  };

  const updateAlertPercentage = (value: string) =>
    setForm((prev) =>
      isDaily ? { ...prev, dailyAlertPercentage: value } : { ...prev, alertPercentage: value },
    );

  const submit = async () => {
    try {
      if (isDaily) {
        await updateUsageLimit({
          maxCreditsPerDay: form.dailyLimit ? Number(form.dailyLimit) : 0,
          dailyAlertPercentage: form.dailyAlertPercentage ? Number(form.dailyAlertPercentage) : 0,
        });
      } else {
        await updateUsageLimit({
          maxCreditsPerMonth: Number(form.monthlyLimit),
          alertPercentage: form.alertPercentage ? Number(form.alertPercentage) : 0,
        });
      }
      onClose();
    } catch {
      // 失敗のトーストは hook が出している。ダイアログは開いたままにする（移植元と同じ）
    }
  };

  return (
    <Dialog
      open
      title={t(isDaily ? 'TENANT.USER_LIMIT_EDIT' : 'TENANT.WS_LIMIT_EDIT')}
      confirmText={t('COMMON.SAVE')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm
      buttonAlign="right"
      confirmMinWidth="min-w-[98px]"
      confirmDisabled={!limitValue}
      confirmLoading={isPending}
      dialogWidth={DIALOG_WIDTH}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-secondary">
          <div className="flex gap-1 items-start">
            <span className="shrink-0" aria-hidden="true">
              <SvgIcon name="lightbulb" className="w-5 h-5 text-brand-primary" />
            </span>
            <p className="flex-1 min-w-0 text-label-large">{t('USAGE_LIMIT.INFO_HEADING')}</p>
          </div>
          <div className="text-body-small">
            <p>{t('USAGE_LIMIT.INFO_LIGHT')}</p>
            <p>{t('USAGE_LIMIT.INFO_STANDARD')}</p>
            <p>{t('USAGE_LIMIT.INFO_ENTERPRISE')}</p>
          </div>
        </div>

        <FormInput
          type="number"
          label={t(isDaily ? 'USAGE_LIMIT.DAILY_LIMIT_LABEL' : 'USAGE_LIMIT.MONTHLY_LIMIT_LABEL')}
          badgeText="任意"
          supportText={t(isDaily ? 'USAGE_LIMIT.DAILY_LIMIT_SUPPORT' : 'USAGE_LIMIT.MONTHLY_LIMIT_SUPPORT')}
          placeholder={t(isDaily ? 'USAGE_LIMIT.DAILY_LIMIT_PLACEHOLDER' : 'USAGE_LIMIT.MONTHLY_LIMIT_PLACEHOLDER')}
          value={limitValue}
          error={limitError}
          dataTestid="usage-limit-input"
          onValueChange={updateLimit}
        />

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-label-large font-medium text-text-strong">
              {t(isDaily ? 'USAGE_LIMIT.DAILY_ALERT_LABEL' : 'USAGE_LIMIT.MONTHLY_ALERT_LABEL')}
            </span>
            <span className="text-label text-text-medium">{t('USAGE_LIMIT.OPTIONAL')}</span>
          </div>
          <p className="text-body-small text-text-medium">
            {t(isDaily ? 'USAGE_LIMIT.DAILY_ALERT_SUPPORT' : 'USAGE_LIMIT.MONTHLY_ALERT_SUPPORT')}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Select
              className="flex-1 min-w-0"
              options={alertOptions}
              placeholder={t(
                isDaily ? 'USAGE_LIMIT.DAILY_ALERT_PLACEHOLDER' : 'USAGE_LIMIT.MONTHLY_ALERT_PLACEHOLDER',
              )}
              value={alertValue}
              onSelectionChange={updateAlertPercentage}
            />
            <span className="text-label-large text-text-strong shrink-0">{t('USAGE_LIMIT.NOTIFY_ON_REACH')}</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
