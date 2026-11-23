import type { ComponentProps } from 'react';
import { ChatAddMenu } from './chat-add-menu';
import type { ChatInput } from './chat-input';
import { handleMentionKeyDown } from '@/lib/chat/mention-key-handler';
import { ChatInputToolbar } from './chat-input-toolbar';
import { ChatMention } from './chat-mention';

type ChatInputSlots = Pick<
  ComponentProps<typeof ChatInput>,
  'renderMention' | 'renderAddMenu' | 'renderToolbar' | 'onTextareaKeyDown'
>;

/**
 * アシスタント選択・テンプレート選択・メンション・「＋」メニュー（#286）を `ChatInput` に差し込む口。
 * `ChatWindow` が既定で渡す。別の部品（添付など）を足すときは、`inputSlots` で個別のスロットだけ上書きする。
 */
export const CHAT_INPUT_SLOTS: ChatInputSlots = {
  renderMention: (controls) => <ChatMention controls={controls} />,
  renderAddMenu: (controls) => <ChatAddMenu controls={controls} />,
  renderToolbar: (controls) => <ChatInputToolbar controls={controls} />,
  onTextareaKeyDown: handleMentionKeyDown,
};
