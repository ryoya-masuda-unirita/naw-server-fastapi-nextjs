import { useTranslation } from 'react-i18next';
import type { ChatInputTemplate } from '@/hooks/use-chat-input-controls';
import { ChatInputIcon } from './chat-input-icons';

interface TemplateSelectorProps {
  templates: ChatInputTemplate[];
  activeTemplate?: ChatInputTemplate | null;
  showBackButton?: boolean;
  showPreviewImage?: boolean;
  onTemplateSelect: (template: ChatInputTemplate) => void;
  onBack?: () => void;
}

/** 移植元 `<app-template-selector>`。「＋」メニューのテンプレート一覧（PC は右のポップアップ、モバイルは同じパネル内） */
export function TemplateSelector({
  templates,
  activeTemplate = null,
  showBackButton = false,
  showPreviewImage = false,
  onTemplateSelect,
  onBack,
}: TemplateSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="block">
      {showBackButton && (
        <div className="flex items-center mb-4 px-4">
          <button
            type="button"
            className="dropdown-back"
            aria-label={t('HEADER.BACK')}
            onClick={(event) => {
              event.stopPropagation();
              onBack?.();
            }}
          >
            <ChatInputIcon name="chevronLeft" />
          </button>
        </div>
      )}

      {showPreviewImage && (
        <div className="px-4 mb-4">
          <div className="w-full h-40 bg-bg-weak rounded-lg"></div>
        </div>
      )}

      <div className="flex flex-col min-h-0 w-full">
        {templates.map((template) => {
          const isActive = activeTemplate?.value === template.value;
          return (
            <button
              key={template.value}
              type="button"
              className={`flex items-start gap-1 px-4 py-2 bg-transparent cursor-pointer text-left w-full transition-colors duration-150 hover:bg-bg-brand-weak${isActive ? ' bg-bg-brand-strong' : ''}`}
              role="menuitem"
              onClick={() => onTemplateSelect(template)}
            >
              <span className={isActive ? 'opacity-100' : 'opacity-0'}>
                <ChatInputIcon name="check" className="w-5 h-5 shrink-0 text-brand-primary" />
              </span>

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-label-small font-semibold text-text-strong leading-snug px-1 rounded-sm inline box-decoration-clone">
                  {template.label}
                </span>
                <span className="text-label text-text-weak leading-normal line-clamp-2">
                  {template.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
