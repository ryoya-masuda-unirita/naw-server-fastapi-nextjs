import { MessageContentApiItem } from './message-api.type';

export type MessageContentStreamEvent =
  | { type: 'reasoning_delta'; text: string }
  | { type: 'text_delta'; text: string }
  | { type: 'library_title_delta'; text: string }
  | { type: 'library_content_delta'; text: string }
  | { type: 'message_stop'; inputTokens: number; outputTokens: number }
  | { type: 'message_content'; data: MessageContentApiItem };

export interface MessageContentStreamHandlers {
  onReasoningDelta?: (text: string) => void;
  onTextDelta: (text: string) => void;
  onLibraryTitleDelta?: (text: string) => void;
  onLibraryContentDelta?: (text: string) => void;
  onMessageStop?: (payload: { inputTokens: number; outputTokens: number }) => void;
  onMessageContent: (item: MessageContentApiItem) => void;
}
