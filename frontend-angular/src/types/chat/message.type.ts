import { ResponseStatus } from '@app-types/common';
import { FileAttachment } from './file-attachment.type';
import type { MessageContentToolItem } from './message-api.type';

export interface ReferenceFilePaths {
  name: string;
  url: string;
}

export type MessageRole = 'user' | 'assistant';

export type MessageFeedbackRating = 'GOOD' | 'BAD';

export interface MessageReasoningSection {
  summary: string;
  detail: string;
}

export interface MessageReasoning {
  sections: MessageReasoningSection[];
}

export interface Message {
  id: string;
  messageId: string;
  role: MessageRole;
  status: ResponseStatus;
  question: string;
  answer: string;
  context: string;
  attachmentFiles?: FileAttachment[];
  files?: File[];
  referenceFilePaths?: ReferenceFilePaths[];
  isRated: boolean;
  rating?: MessageFeedbackRating | null;
  assistantId?: string;
  parentId?: string | null;
  message?: string;
  reasoning?: MessageReasoning;
  /** チャット送信時に使用した tools（編集・再生成で再利用） */
  tools?: MessageContentToolItem[] | null;
  /** チャット送信時に適用したプロンプトテンプレート本文（編集・再生成で再利用） */
  promptTemplateContent?: string | null;
  /** ライブラリ生成を行ったか（編集・再生成で再利用） */
  isCreateLibrary?: boolean;
}
