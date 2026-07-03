// GET /api/assistants — Get all assistants (triggered on New Chat modal display)

import { Assistant } from '@app-types/chat/assistant.type';

export type { Assistant };

export const MOCK_ASSISTANTS: Assistant[] = [
  {
    id: 'asst-001',
    name: '社内情報アシスタント',
    description: '会社の規定・ポリシー・業務手順などの社内情報を検索・回答します。',
    category: '社内知識',
    model: 'gpt-4o',
    isDefault: true,
  },
  {
    id: 'asst-002',
    name: 'データ分析アシスタント',
    description: '売上データや顧客データなどの分析・集計をサポートします。',
    category: 'データ分析',
    model: 'gpt-4o',
  },
  {
    id: 'asst-003',
    name: 'GPT-4o-mini',
    description: '汎用的な質問応答や文書作成をサポートします。',
    category: '汎用',
    model: 'gpt-4o-mini',
  },
  {
    id: 'asst-004',
    name: 'コードレビューアシスタント',
    description: 'コードのレビュー・バグ修正・リファクタリングをサポートします。',
    category: '開発',
    model: 'gpt-4o',
  },
  {
    id: 'asst-005',
    name: '議事録作成アシスタント',
    description: '会議の内容を整理し、議事録を自動作成します。',
    category: '業務効率化',
    model: 'gpt-4o-mini',
  },
  {
    id: 'asst-006',
    name: '翻訳アシスタント',
    description: '日英・英日翻訳をはじめ、多言語翻訳をサポートします。',
    category: '翻訳',
    model: 'gpt-4o-mini',
  },
];
