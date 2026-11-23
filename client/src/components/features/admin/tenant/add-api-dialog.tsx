import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { cx } from '@/components/shared/class-names';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { FormSelect } from '@/components/shared/form-select';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { SelectOption } from '@/components/shared/types';
import { useCreateEndpoint, useUpdateEndpoint } from '@/hooks/use-tenant';
import type { EndpointCreatePayload } from '@/types/admin/tenant.types';
import { MANAGEABLE_ENDPOINT_TYPE } from './tenant.constants';

/** ダイアログの幅（移植元 `width: '800px', maxWidth: '90vw'`） */
const DIALOG_WIDTH = 'min(800px, 90vw)';
const API_KEY_LENGTH = 32;
const API_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** 「コピー」ボタンが「コピー済み」の見た目でいる時間（移植元 3000ms） */
const COPIED_DISPLAY_MS = 3000;

const CONNECTION_OPTIONS: SelectOption[] = [{ label: 'Local Server', value: MANAGEABLE_ENDPOINT_TYPE }];

const EMPTY_FORM: EndpointCreatePayload = {
  endpointName: '',
  type: MANAGEABLE_ENDPOINT_TYPE,
  endpoint: '',
  apiKey: '',
};

interface AddApiDialogProps {
  /** 編集するエンドポイントの値と ID。無ければ新規作成 */
  edit?: { id: string; values: EndpointCreatePayload };
  onClose: () => void;
}

/** 32 文字の英数字の API キーを作る（移植元 generateApiKey） */
function generateApiKey(): string {
  return Array.from(
    { length: API_KEY_LENGTH },
    () => API_KEY_CHARS[Math.floor(Math.random() * API_KEY_CHARS.length)],
  ).join('');
}

/**
 * 移植元の「APIを新規作成」「APIの設定を編集」ダイアログ（`<app-add-api-dialog>` を入れた DialogComponent）。
 * 開くたびに作り直す前提で、親は開いている間だけ描画する。
 * ラベル・プレースホルダーは移植元が日本語をハードコードしているのでそのまま移す。
 */
export function AddApiDialog({ edit, onClose }: AddApiDialogProps) {
  const { t } = useTranslation();
  const isEdit = edit !== undefined;
  const { createEndpoint, isPending: isCreating } = useCreateEndpoint();
  const { updateEndpoint, isPending: isUpdating } = useUpdateEndpoint();
  const [form, setForm] = useState<EndpointCreatePayload>(edit?.values ?? EMPTY_FORM);
  const [apiKeyGenerated, setApiKeyGenerated] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  const confirmDisabled = !form.endpointName || !form.type || !form.endpoint || !form.apiKey;

  const updateField = (field: keyof EndpointCreatePayload, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleGenerate = () => {
    updateField('apiKey', generateApiKey());
    setApiKeyGenerated(true);
  };

  const handleCopy = () => {
    if (!form.apiKey) return;
    void navigator.clipboard?.writeText(form.apiKey);
    setIsCopied(true);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setIsCopied(false), COPIED_DISPLAY_MS);
  };

  const submit = async () => {
    try {
      if (edit) {
        await updateEndpoint(edit.id, form);
      } else {
        await createEndpoint(form);
      }
      onClose();
    } catch {
      // 失敗のトーストは hook が出している。ダイアログは開いたままにして、やり直せるようにする（移植元と同じ）
    }
  };

  return (
    <Dialog
      open
      title={t(isEdit ? 'TENANT.EDIT_API_SETTING' : 'TENANT.ADD_API_MODAL_TITLE')}
      confirmText={t(isEdit ? 'COMMON.SAVE' : 'TENANT.CREATE')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm
      buttonAlign="right"
      confirmMinWidth="min-w-[98px]"
      confirmDisabled={confirmDisabled}
      confirmLoading={isEdit ? isUpdating : isCreating}
      dialogWidth={DIALOG_WIDTH}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <FormInput
          label="APIの表示名"
          placeholder="APIの表示名を入力"
          value={form.endpointName}
          dataTestid="tenant-api-name-input"
          onValueChange={(value) => updateField('endpointName', value)}
        />

        <FormSelect
          label="APIの接続先"
          placeholder="APIの接続先を選択"
          options={CONNECTION_OPTIONS}
          value={form.type}
          disabled={isEdit}
          width="100%"
          onValueChange={(value) => updateField('type', value || '')}
        />

        <FormInput
          label="接続先のURL"
          placeholder="接続先のURLを入力"
          value={form.endpoint}
          dataTestid="tenant-api-url-input"
          onValueChange={(value) => updateField('endpoint', value)}
        />

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-label-large font-medium text-text-strong">APIキー</span>
          </div>
          <div className="mt-1">
            <div className="flex gap-1 items-start text-status-caution">
              <span className="shrink-0" aria-hidden="true">
                <SvgIcon name="alert" className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0 text-body-small">
                <p>
                  「生成」を押下するとAPIキーが生成されます。
                  <br />
                  生成されたAPIキーは再度表示することはできませんので、記録しておいてください。
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 mt-2">
            <FormInput
              label=""
              placeholder="APIキー"
              disabled
              value={form.apiKey}
              dataTestid="tenant-api-key-input"
              className="flex-1 min-w-0 w-full md:w-auto"
            />
            {apiKeyGenerated ? (
              <span data-copy-btn className={cx('inline-block', isCopied && 'chat-message-action--copied')}>
                <Button variant="outline" size="lg" dataTestid="tenant-api-copy-button" onClick={handleCopy}>
                  <span data-icon-default>
                    <SvgIcon name="copy" className="w-5 h-5" />
                  </span>
                  <span data-icon-copied>
                    <SvgIcon name="check" className="w-5 h-5" />
                  </span>
                  コピー
                </Button>
              </span>
            ) : (
              <Button variant="outline" size="lg" dataTestid="tenant-api-generate-button" onClick={handleGenerate}>
                生成
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
