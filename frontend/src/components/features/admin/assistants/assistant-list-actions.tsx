import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';

const ACTION_BUTTON_HEIGHT_PX = 54;

interface AssistantListActionsProps {
  selectedCount: number;
  /** 作成ボタンの文言（i18n キー） */
  createLabelKey: string;
  onCreate: () => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
}

/**
 * 移植元のタブ（assistant-tab・category-tab）の先頭にある `.sp-fixed-btn`。
 * 何も選んでいなければ作成ボタン、選んでいれば「選択を解除」と「削除」を出す。
 */
export function AssistantListActions({
  selectedCount,
  createLabelKey,
  onCreate,
  onDeselectAll,
  onDeleteSelected,
}: AssistantListActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="sp-fixed-btn">
      {selectedCount > 0 ? (
        <div className="flex flex-col-reverse md:flex-row gap-3">
          <Button
            variant="outline"
            intent="cancel"
            size="lg"
            heightPx={ACTION_BUTTON_HEIGHT_PX}
            className="w-full md:w-36.5 inline-grid"
            onClick={onDeselectAll}
          >
            {t('ADMIN.ASSISTANT.CLEAR_SELECTION')}
          </Button>
          <Button
            variant="outline"
            intent="delete"
            size="lg"
            heightPx={ACTION_BUTTON_HEIGHT_PX}
            className="w-full md:w-30.5 inline-grid"
            onClick={onDeleteSelected}
          >
            <SvgIcon name="delete" className="w-5 h-5" /> {t('COMMON.DELETE')}
          </Button>
        </div>
      ) : (
        <div data-assistant-create-wrap>
          <Button
            variant="solid"
            size="lg"
            iconPosition="right"
            fullWidth
            className="w-full md:w-auto"
            onClick={onCreate}
          >
            <div className="flex items-center gap-1 justify-center leading-normal">
              <SvgIcon name="addCircle" className="w-5 h-5" />
              <span>{t(createLabelKey)}</span>
            </div>
          </Button>
        </div>
      )}
    </div>
  );
}
