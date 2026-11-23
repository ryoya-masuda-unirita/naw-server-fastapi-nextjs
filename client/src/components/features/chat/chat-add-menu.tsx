import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { ChatInputControls, ChatInputTemplate } from '@/hooks/use-chat-input-controls';
import { usePromptTemplates } from '@/hooks/use-prompt-templates';
import { useChatInputUiStore } from '@/store/chat-input-ui-store';
import { ChatInputIcon } from './chat-input-icons';
import { TemplateSelector } from './template-selector';
import './chat-multi-panel.css';

const ADD_MENU_WIDTH = 280;
const TEMPLATE_MENU_WIDTH = 280;
const MENU_GAP = 8;
const MENU_PAD = 8;
const MENU_MAX_HEIGHT = 400;
const MENU_MIN_HEIGHT = 120;
/** ボタンとメニューの間の隙間(px) */
const TRIGGER_GAP = 4;
/** Tailwind の md ブレークポイント。これ未満ではテンプレートを同じパネル内で切り替える */
const MOBILE_MAX_WIDTH = 768;
/** 添付用の `<input type="file">`（#287 の添付領域にある）を探すための、入力欄の外枠 */
const INPUT_WRAP_SELECTOR = '.chat-input-textarea-wrap';
const FILE_INPUT_SELECTOR = 'input[type="file"]';

interface MenuStyle {
  bottom: string;
  left: string;
  maxHeight: string;
}

const INITIAL_MENU_STYLE: MenuStyle = { bottom: '0px', left: '0px', maxHeight: '320px' };

const ITEM_CLASS =
  'dropdown-item flex min-h-9 items-center gap-2 cursor-pointer rounded-lg w-full px-2 py-1 text-(length:--text-label) font-medium text-text-strong transition-colors duration-150';
const CLOSE_BUTTON_CLASS =
  'flex h-4 w-4 bg-text-strong rounded-full justify-center items-center hover:bg-bg-brand-weak transition-colors';

function clampMenuLeft(left: number, width: number): number {
  return Math.min(Math.max(MENU_PAD, left), window.innerWidth - width - MENU_PAD);
}

function computeMenuMaxHeight(triggerTop: number): number {
  return Math.max(Math.min(triggerTop - MENU_PAD, MENU_MAX_HEIGHT), MENU_MIN_HEIGHT);
}

interface StatefulItemProps {
  active: boolean;
  testId?: string;
  onActivate: () => void;
  children: ReactNode;
}

/**
 * 状態を持つメニュー項目。移植元は `<button>` の中に閉じるボタンを入れているが、
 * ボタンの入れ子は HTML として不正（React が警告する）ため、外側だけ `role="menuitem"` の div にする。
 */
function StatefulItem({ active, testId, onActivate, children }: StatefulItemProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      onActivate();
    }
  };

  return (
    <div
      data-testid={testId}
      tabIndex={0}
      className={`${ITEM_CLASS}${active ? ' dropdown-item--active' : ''}`}
      role="menuitem"
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

interface ChatAddMenuProps {
  controls: ChatInputControls;
}

/**
 * 移植元 `<app-chat-input>` の「＋」メニュー。ファイル添付・Web 検索・ライブラリ作成・テンプレート選択。
 * ファイルを選ぶ処理（`<input type="file">`）は添付の領域（#287）にあるため、その input を探してクリックする。
 */
export function ChatAddMenu({ controls }: ChatAddMenuProps) {
  const { t } = useTranslation();
  const {
    webSearchActive,
    setWebSearchActive,
    templateActive,
    setTemplateActive,
    createLibraryActive,
    setCreateLibraryActive,
  } = controls;
  const { data: templates } = usePromptTemplates();
  const setMultiPanelOpen = useChatInputUiStore((s) => s.setMultiPanelOpen);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuSection, setMenuSection] = useState<'main' | 'templates'>('main');
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [addMenuStyle, setAddMenuStyle] = useState<MenuStyle>(INITIAL_MENU_STYLE);
  const [templateMenuStyle, setTemplateMenuStyle] = useState<MenuStyle>(INITIAL_MENU_STYLE);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setIsTemplateMenuOpen(false);
    setMenuSection('main');
  }, []);

  // メニューの外側をクリックしたら閉じる（移植元の `document:click`）
  useEffect(() => {
    if (!isOpen) return;
    const onDocumentClick = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-chat-add-menu]')) closeMenu();
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [isOpen, closeMenu]);

  const toggleMenu = (event: MouseEvent) => {
    event.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setMenuSection('main');
    setMultiPanelOpen(false);
    const trigger = triggerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      setAddMenuStyle({
        bottom: `${window.innerHeight - rect.top + TRIGGER_GAP}px`,
        left: `${clampMenuLeft(rect.right - ADD_MENU_WIDTH, ADD_MENU_WIDTH)}px`,
        maxHeight: `${computeMenuMaxHeight(rect.top)}px`,
      });
    }
    setIsOpen(true);
  };

  const openFileSelector = () => {
    const wrap = triggerRef.current?.closest(INPUT_WRAP_SELECTOR);
    wrap?.querySelector<HTMLInputElement>(FILE_INPUT_SELECTOR)?.click();
    closeMenu();
  };

  const openTemplateMenu = () => {
    if (window.innerWidth < MOBILE_MAX_WIDTH) {
      setMenuSection('templates');
      return;
    }
    if (isTemplateMenuOpen) {
      setIsTemplateMenuOpen(false);
      return;
    }

    // テンプレートのメニューは「＋」メニューの右に出す。右にはみ出すなら「＋」メニューごと左へ寄せる
    const addMenuLeft = parseFloat(addMenuStyle.left) || 0;
    let templateLeft = addMenuLeft + ADD_MENU_WIDTH + MENU_GAP;
    let nextAddMenuStyle = addMenuStyle;

    if (templateLeft + TEMPLATE_MENU_WIDTH > window.innerWidth - MENU_PAD) {
      const shiftedAddLeft = clampMenuLeft(
        templateLeft - ADD_MENU_WIDTH - MENU_GAP,
        ADD_MENU_WIDTH + MENU_GAP + TEMPLATE_MENU_WIDTH,
      );
      if (shiftedAddLeft !== addMenuLeft) {
        nextAddMenuStyle = { ...addMenuStyle, left: `${shiftedAddLeft}px` };
        setAddMenuStyle(nextAddMenuStyle);
        templateLeft = shiftedAddLeft + ADD_MENU_WIDTH + MENU_GAP;
      }
    }

    const triggerTop = triggerRef.current?.getBoundingClientRect().top ?? 0;
    setTemplateMenuStyle({
      bottom: nextAddMenuStyle.bottom,
      left: `${clampMenuLeft(templateLeft, TEMPLATE_MENU_WIDTH)}px`,
      maxHeight: `${computeMenuMaxHeight(triggerTop)}px`,
    });
    setIsTemplateMenuOpen(true);
  };

  const backToMain = () => {
    setMenuSection('main');
    setIsTemplateMenuOpen(false);
  };

  const selectTemplate = (template: ChatInputTemplate) => {
    setTemplateActive(template);
    closeMenu();
  };

  const panelStyle = (style: MenuStyle): CSSProperties => ({
    bottom: style.bottom,
    left: style.left,
    maxHeight: style.maxHeight,
  });

  const templateList = templates ?? [];

  return (
    <>
      <button
        ref={triggerRef}
        data-testid="chat-attach-button"
        type="button"
        className="inline-flex items-center justify-center transition-colors duration-200 cursor-pointer rounded-full disabled:cursor-not-allowed disabled:pointer-events-none bg-white text-brand-primary hover:bg-bg-brand-weak w-7 h-7 dropdown-trigger"
        aria-expanded={isOpen}
        aria-label={t('CHAT.INPUT.ATTACH_FILE')}
        onClick={toggleMenu}
      >
        <ChatInputIcon name="plus" />
      </button>

      <div
        className={`chat-multi-panel w-screen! md:w-70!${menuSection === 'templates' ? ' px-0!' : ''}${isOpen ? ' is-open' : ''}`}
        role="menu"
        hidden={!isOpen}
        style={panelStyle(addMenuStyle)}
      >
        {menuSection === 'main' && (
          <>
            <button
              type="button"
              data-testid="chat-attach-menu-item"
              className={ITEM_CLASS}
              role="menuitem"
              onClick={openFileSelector}
            >
              <span className="flex h-5 w-5 shrink-0 justify-center items-center">
                <ChatInputIcon name="attach" />
              </span>
              {t('CHAT.INPUT.ATTACH_IMAGE_FILE')}
            </button>

            <hr className="border-border-weak my-1" />

            <StatefulItem active={webSearchActive} onActivate={() => setWebSearchActive(!webSearchActive)}>
              <span className="flex h-5 w-5 shrink-0 justify-center items-center">
                <ChatInputIcon name="globe" />
              </span>
              <span className="flex-1 text-left">{t('CHAT.INPUT.WEB_SEARCH')}</span>
              {webSearchActive && (
                <button
                  type="button"
                  className={CLOSE_BUTTON_CLASS}
                  aria-label={t('COMMON.CLOSE')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setWebSearchActive(false);
                  }}
                >
                  <MatIcon name="close" size={12} className="text-white!" />
                </button>
              )}
            </StatefulItem>

            <StatefulItem
              active={createLibraryActive}
              testId="chat-create-library-toggle"
              onActivate={() => setCreateLibraryActive(!createLibraryActive)}
            >
              <SvgIcon name="library" className="shrink-0" />
              <span className="flex-1 text-left">{t('CHAT.INPUT.CREATE_LIBRARY')}</span>
              {createLibraryActive && (
                <button
                  type="button"
                  className={CLOSE_BUTTON_CLASS}
                  aria-label={t('COMMON.CLOSE')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setCreateLibraryActive(false);
                  }}
                >
                  <MatIcon name="close" size={12} className="text-white!" />
                </button>
              )}
            </StatefulItem>

            <StatefulItem active={templateActive !== null} onActivate={openTemplateMenu}>
              <span className="flex h-5 w-5 shrink-0 justify-center items-center">
                <ChatInputIcon name="template" />
              </span>
              <span className="flex-1 text-left">
                {templateActive ? templateActive.label : t('CHAT.INPUT.TEMPLATE')}
              </span>
              {templateActive ? (
                <button
                  type="button"
                  className={CLOSE_BUTTON_CLASS}
                  aria-label={t('COMMON.CLOSE')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTemplateActive(null);
                  }}
                >
                  <MatIcon name="close" size={12} className="text-white!" />
                </button>
              ) : (
                <ChatInputIcon
                  name="chevronRight"
                  className="w-4 h-4 text-text-weak shrink-0 ml-auto"
                />
              )}
            </StatefulItem>
          </>
        )}

        {menuSection === 'templates' && (
          <TemplateSelector
            templates={templateList}
            activeTemplate={templateActive}
            showBackButton
            onTemplateSelect={selectTemplate}
            onBack={backToMain}
          />
        )}
      </div>

      {/* テンプレートのサブメニュー（PC のみ。「＋」メニューの右に出す） */}
      <div
        className={`chat-multi-panel w-70! hidden md:flex px-0!${isTemplateMenuOpen ? ' is-open' : ''}`}
        role="menu"
        hidden={!isTemplateMenuOpen}
        style={panelStyle(templateMenuStyle)}
      >
        {isTemplateMenuOpen && (
          <TemplateSelector
            templates={templateList}
            activeTemplate={templateActive}
            onTemplateSelect={selectTemplate}
          />
        )}
      </div>
    </>
  );
}
