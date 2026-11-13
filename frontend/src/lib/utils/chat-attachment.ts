import type { ChatInputControls } from '@/hooks/use-chat-input-controls';
import { isAllowedChatAttachment } from '@/lib/constants/chat-attachment';

/** 添付ファイルを選ぶ input の id（移植元 `#chat-file-upload`）。label の for と input の id を結ぶ */
export const CHAT_FILE_INPUT_ID = 'chat-file-upload';

/**
 * 許可された種類のファイルだけを、入力欄の添付に足す（移植元 ChatInputComponent.addAttachedFiles）。
 * 許可外のファイルは黙って捨て、1 件も許可されなければ何もしない
 */
export function addAttachedFiles(files: File[], controls: ChatInputControls): void {
  const allowedFiles = files.filter(isAllowedChatAttachment);
  if (allowedFiles.length === 0) return;
  controls.setAttachedFiles((current) => [...current, ...allowedFiles]);
}
