import { MessageContentApiItem, type MessageListAssistant } from '@app-types/chat/message-api.type';
import type { MessageFeedbackRating } from '@app-types/chat/message.type';
import { CHAT_ASSISTANT_TYPE } from '@features/chat/constants/assistant-type.constants';

/** Mock-only extension of API content item (rating is not on the wire format). */
export interface MockMessageContentApiItem extends MessageContentApiItem {
  rating?: MessageFeedbackRating;
}

// Message metadata returned in GET /messages?roomId= under the "messages" key
export interface MockMessageRecord {
  id: string;
  roomId: string;
  assistantId: string;
  parentId: string | null;
  isRated: boolean;
}

export const MOCK_LOCAL_SERVER_BASE_URL = 'http://localhost:9090/';

export const MOCK_SAAS_MESSAGE_ASSISTANT: MessageListAssistant = {
  id: 'asst-001',
  type: CHAT_ASSISTANT_TYPE.SAAS_CHAT,
  endpoints: [
    {
      type: 'AZURE_OPENAI_CHAT',
      destination: 'https://secuaigent-dev.openai.azure.com/',
      apiKey: '',
    },
  ],
};

export const MOCK_SECURE_MESSAGE_ASSISTANT: MessageListAssistant = {
  id: 'asst-secure-001',
  type: CHAT_ASSISTANT_TYPE.SECURE,
  endpoints: [
    {
      type: 'LOCAL_SERVER',
      destination: MOCK_LOCAL_SERVER_BASE_URL,
      apiKey: 'mock-local-key',
    },
  ],
};

export const MOCK_MESSAGE_LIST_ASSISTANTS: MessageListAssistant[] = [
  MOCK_SAAS_MESSAGE_ASSISTANT,
  MOCK_SECURE_MESSAGE_ASSISTANT,
];

export const MOCK_MESSAGE_RECORDS: MockMessageRecord[] = [
  { id: 'msg-1', roomId: 'room-001', assistantId: 'assistant-1', parentId: null, isRated: false },
  {
    id: 'msg-1-alt',
    roomId: 'room-001',
    assistantId: 'asst-001',
    parentId: null,
    isRated: false,
  },
  {
    id: 'msg-2',
    roomId: 'room-001',
    assistantId: 'asst-001',
    parentId: 'msg-1',
    isRated: false,
  },
  {
    id: 'msg-2-alt',
    roomId: 'room-001',
    assistantId: 'asst-001',
    parentId: 'msg-1-alt',
    isRated: false,
  },
  {
    id: 'msg-3',
    roomId: 'room-001',
    assistantId: 'asst-001',
    parentId: 'msg-2',
    isRated: false,
  },
  { id: 'msg-4', roomId: 'room-001', assistantId: 'asst-001', parentId: 'msg-3', isRated: true },
  {
    id: 'msg-5',
    roomId: 'room-001',
    assistantId: 'asst-001',
    parentId: 'msg-4',
    isRated: false,
  },
  { id: 'msg-6', roomId: 'room-001', assistantId: 'asst-001', parentId: 'msg-5', isRated: true },
];

// POST /messages/contents — keyed by messageId from GET /messages
export const MOCK_MESSAGE_CONTENTS: Record<string, MockMessageContentApiItem> = {
  'msg-1': {
    id: 'content-msg-1',
    messageId: 'msg-1',
    status: 'OK',
    question: '在庫最適化のシミュレーションを実行してください',
    answer: null,
    context: null,
    attachmentFiles: [],
    referencePaths: [],
    isRated: false,
  },
  'msg-1-alt': {
    id: 'content-msg-1-alt',
    messageId: 'msg-1-alt',
    status: 'OK',
    question: '売上予測のレポートを作成してください（編集版）',
    answer: null,
    context: null,
    attachmentFiles: [],
    referencePaths: [],
    isRated: false,
  },
  'msg-2': {
    id: 'content-msg-2',
    messageId: 'msg-2',
    status: 'OK',
    question: null,
    answer: `<p>承知いたしました。売上DBの実績値と予算案データを結合し、第3四半期の<a href="#">予実対比分析</a>を行いました。分析の結果、<strong>営業第2部の未達幅が大きくなっています</strong>。右パネルに以下を出力しました。</p>
<ul>
  <li>未達要因分析コメント</li>
  <li>部門別 予実対比グラフ</li>
  <li>本レポートの仕様書</li>
</ul>
<p>詳細は <a href="https://example.com/report" target="_blank" rel="noopener noreferrer">こちらのレポート</a> をご参照ください。</p>`,
    context: null,
    attachmentFiles: [],
    referencePaths: [],
    isRated: false,
  },
  'msg-2-alt': {
    id: 'content-msg-2-alt',
    messageId: 'msg-2-alt',
    status: 'OK',
    question: null,
    answer: `<p>編集版の質問に対する回答です。売上予測レポートを右パネルに出力しました。</p>`,
    context: null,
    attachmentFiles: [],
    referencePaths: [],
    isRated: false,
  },
  'msg-3': {
    id: 'content-msg-3',
    messageId: 'msg-3',
    status: 'OK',
    question: '営業第2部の詳細データを見せてください',
    answer: null,
    context: null,
    attachmentFiles: [],
    referencePaths: [],
    isRated: false,
  },
  'msg-4': {
    id: 'content-msg-4',
    messageId: 'msg-4',
    status: 'OK',
    question: null,
    answer: `<p><strong>製品別在庫状況</strong>を以下にまとめました。</p>
<ul>
  <li><strong>製品A</strong>: 在庫数 1,250個 — 推奨発注数 300個</li>
  <li><strong>製品B</strong>: 在庫数 430個 — 推奨発注数 600個（<em>要注意</em>）</li>
  <li><strong>製品C</strong>: 在庫数 2,100個 — 推奨発注数 0個</li>
</ul>
<p>シミュレーション詳細は <a href="https://example.com/inventory" target="_blank" rel="noopener noreferrer">在庫管理ダッシュボード</a> でご確認いただけます。</p>`,
    context: null,
    attachmentFiles: [],
    referencePaths: [
      { name: '在庫管理ダッシュボード', url: 'https://example.com/inventory' },
      { name: 'シミュレーション仕様書', url: 'https://example.com/spec' },
    ],
    isRated: true,
    rating: 'GOOD',
  },
  'msg-5': {
    id: 'content-msg-5',
    messageId: 'msg-5',
    status: 'OK',
    question: '営業第2部の詳細データを見せてください',
    answer: null,
    context: null,
    attachmentFiles: [],
    referencePaths: [],
    isRated: false,
  },
  'msg-6': {
    id: 'content-msg-6',
    messageId: 'msg-6',
    status: 'ERROR',
    question: null,
    answer: null,
    context: null,
    attachmentFiles: [],
    referencePaths: [],
    isRated: true,
    rating: 'BAD',
    message: 'サポートテキストが入ります。サポートテキストが入ります。サポートテキストが入ります。',
  },
};
