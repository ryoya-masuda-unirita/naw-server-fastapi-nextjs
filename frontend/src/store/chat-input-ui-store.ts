import { create } from 'zustand';

/**
 * 入力欄の部品どうしで共有する UI 状態（移植元 ChatInputComponent の signal のうち、
 * メンション候補・有効な機能ウィジェットのパネルに関わるもの）。
 * メンション候補（`renderMention`）、キー入力（`onTextareaKeyDown`）、「＋」メニュー（`renderAddMenu`）、
 * ツールバー（`renderToolbar`）は別々のスロットで描画されるため、ここで受け渡す。
 */
interface ChatInputUiStore {
  /** 「@」で始まる入力のあと、Esc で候補を閉じたか */
  isMentionDismissed: boolean;
  /** メンション候補の選択位置 */
  mentionActiveIndex: number;
  /** 有効な機能が複数あるときのパネルを開いているか */
  isMultiPanelOpen: boolean;
  setMentionDismissed: (dismissed: boolean) => void;
  setMentionActiveIndex: (index: number) => void;
  setMultiPanelOpen: (open: boolean) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  isMentionDismissed: false,
  mentionActiveIndex: 0,
  isMultiPanelOpen: false,
};

export const useChatInputUiStore = create<ChatInputUiStore>((set) => ({
  ...INITIAL_STATE,
  setMentionDismissed: (isMentionDismissed) => set({ isMentionDismissed }),
  setMentionActiveIndex: (mentionActiveIndex) => set({ mentionActiveIndex }),
  setMultiPanelOpen: (isMultiPanelOpen) => set({ isMultiPanelOpen }),
  reset: () => set(INITIAL_STATE),
}));
