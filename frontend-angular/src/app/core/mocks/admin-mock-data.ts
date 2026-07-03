import { AssistantApiItem, AdminAssistantCategory } from '@app-types/admin/assistant.types';
import type {
  CountStatItem,
  FeedbackItem,
  SatisfactionFeedbackItem,
} from '@app-types/admin/feedback.types';
import type {
  GlossaryDictionaryAssistantRow,
  GlossaryWordTableRow,
} from '@app-types/admin/glossary-dictionary.types';
import type { GlossaryItem, GlossaryTagItem } from '@app-types/admin/glossary.types';
import type { AdminTemplate } from '@app-types/admin/template.types';
import type { ApiConfig, TenantInfo, UsageHistory } from '@app-types/admin/tenant.types';
import type { AdminUser } from '@app-types/admin/user.types';
import type { TrainingData } from '@app-types/chat/training-data.type';
import { SelectOption } from '@app-types/common';
import type { Group } from '@app-types/group.type';
import { ASSISTANT_SERVER_TYPE } from '@app/features/admin/management/assistant-list/assistant-list.constants';

export const MOCK_ADMIN_USERS: AdminUser[] = Array.from({ length: 20 }).map((_, index) => {
  const totalCreditsValues = [1000, 2000, 3000, 4000, 5000];

  const names = [
    '佐藤 大輔',
    '田中 花',
    '鈴木 太郎',
    '高橋 里奈',
    '斉藤 朱莉',
    '渡辺 健太',
    '伊藤 美咲',
    '山本 陽菜',
    '中村 拓海',
    '小林 結菜',
  ];

  const roles: AdminUser['role'][] = ['admin', 'user', 'system'];

  const accountTypes: AdminUser['accountType'][] = ['google', 'microsoft', 'none'];

  return {
    id: `aaaaaaaa-bbbb-4ccc-8ddd-${index.toString(16).padStart(12, '0')}`,
    userId: `login_${index}`,
    displayName: `${index} ${names[index % names.length]}`,
    role: roles[index % roles.length],
    totalCredits: totalCreditsValues[index % totalCreditsValues.length],
    loginKey: '*****',
    accountType: accountTypes[index % accountTypes.length],
    email: '',
    updatedAt: new Date(),
  };
});

export const MOCK_ADMIN_USERS_1: AdminUser[] = [
  {
    id: '1',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1000,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2021-04-01T11:05:00'),
  },
  {
    id: '2',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'user',
    totalCredits: 1000,
    loginKey: '*****',
    accountType: 'none',
    email: 'mail@mail.com',
    updatedAt: new Date('2026-03-20T20:05:00'),
  },
  {
    id: '3',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1000,
    loginKey: '*****',
    accountType: 'none',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-01-10T20:05:00'),
  },
  {
    id: '4',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1000,
    loginKey: '*****',
    accountType: 'none',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-09-29T20:05:00'),
  },
  {
    id: '5',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1000,
    loginKey: '*****',
    accountType: 'none',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-09-29T20:05:00'),
  },
  {
    id: '6',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1000,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-12-29T20:05:00'),
  },
  {
    id: '7',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1241,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2026-02-10T20:05:00'),
  },
  {
    id: '8',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1241,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-09-29T20:05:00'),
  },
  {
    id: '9',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1241,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-11-11T20:05:00'),
  },
  {
    id: '10',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1241,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-09-29T20:05:00'),
  },
  {
    id: '11',
    userId: 'name_name999',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1241,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2026-03-24T20:05:00'),
  },
  {
    id: '12',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1241,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-09-29T20:05:00'),
  },
  {
    id: '13',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1241,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-09-29T20:05:00'),
  },
  {
    id: '14',
    userId: 'name_name',
    displayName: '苗字 名前',
    role: 'admin',
    totalCredits: 1241,
    loginKey: '*****',
    accountType: 'google',
    email: 'mail@mail.com',
    updatedAt: new Date('2025-09-29T20:05:00'),
  },
];

export const MOCK_TRAINING_DATA: TrainingData[] = [
  {
    id: '1',
    displayName: 'アシスタントの名前',
    description: 'AzureOpenAIのGPT-4o-miniを使用したアシスタン...',
    serverType: 'cloud',
    serverCode: 'SAAS_CHAT',
    model: 'gpt-4o-mini-2024-07-18',
    historyEnabled: true,
    fileName: 'training_data_01.pdf',
    status: 'active',
  },
  {
    id: '2',
    displayName: 'アシスタントの名前',
    description: 'AzureOpenAIのGPT-4o-miniを使用したアシスタン...',
    serverType: 'cloud',
    serverCode: 'SAAS_CHAT',
    model: 'gpt-4o-mini-2024-07-18',
    historyEnabled: true,
    fileName: 'training_data_02.pdf',
    status: 'active',
  },
  {
    id: '3',
    displayName: 'アシスタントの名前',
    description: 'AzureOpenAIのGPT-4o-miniを使用したアシスタン...',
    serverType: 'local',
    serverCode: 'WAHA_CHAT',
    model: 'gpt-4o-mini-2024-07-18',
    historyEnabled: false,
    fileName: 'training_data_03.pdf',
    status: 'inactive',
  },
  {
    id: '4',
    displayName: 'アシスタントの名前',
    description: 'AzureOpenAIのGPT-4o-miniを使用したアシスタン...',
    serverType: 'cloud',
    serverCode: 'SAAS_CHAT',
    model: 'gpt-4o-mini-2024-07-18',
    historyEnabled: true,
    fileName: 'training_data_04.pdf',
    status: 'active',
  },
  {
    id: '5',
    displayName: 'アシスタントの名前',
    description: 'AzureOpenAIのGPT-4o-miniを使用したアシスタン...',
    serverType: 'cloud',
    serverCode: 'SAAS_CHAT',
    model: 'gpt-4o-mini-2024-07-18',
    historyEnabled: true,
    fileName: 'training_data_05.pdf',
    status: 'active',
  },
  {
    id: '6',
    displayName: 'アシスタントの名前',
    description: 'AzureOpenAIのGPT-4o-miniを使用したアシスタン...',
    serverType: 'local',
    serverCode: 'WAHA_CHAT',
    model: 'gpt-4o-mini-2024-07-18',
    historyEnabled: false,
    fileName: 'training_data_06.pdf',
    status: 'inactive',
  },
];

export const MOCK_TENANT_INFO: TenantInfo = {
  deleted: false,
  tenantId: 'tenant-001',
  tenantName: 'ワークスペースAA',
  isDeleted: false,
  resources: [
    { id: 'res-001', type: 'STORAGE', description: 'ストレージリソース' },
    { id: 'res-002', type: 'API', description: 'APIリソース' },
  ],
  subscription: {
    id: 'sub-001',
    status: 'ACTIVE',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-04-01T00:00:00Z',
    plan: {
      id: 'plan-001',
      name: 'ライトプラン(月額 xx円)',
      maxUsers: 80,
      maxCreditsPerMonth: 1_400_000_000,
      maxCreditsPerDay: 500_000,
      alertPercentage: 80,
      dailyAlertPercentage: 80,
    },
  },
};

export const MOCK_TODAY_USAGE: UsageHistory[] = [
  { id: '1', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '2', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '3', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '4', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '5', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '6', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
];

export const MOCK_USAGE_HISTORY: UsageHistory[] = [
  { id: '1', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '2', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '3', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '4', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '5', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '6', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '7', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '8', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
  { id: '9', datetime: '2025-09-29 20:05', user: 'ユーザー名', amount: '10000' },
];

export const MOCK_API_CONFIGS: ApiConfig[] = [
  {
    id: '1',
    displayName: 'AZURE_OPENAI_CHAT',
    functionName: 'AZURE_OPENAI_EMBEDDING',
    url: 'https://secuaigent-dev.openai.azure.com/',
    apiKey: '****',
  },
  {
    id: '2',
    displayName: 'AZURE_OPENAI_CHAT',
    functionName: 'AZURE_OPENAI_EMBEDDING',
    url: 'https://secuaigent-dev.openai.azure.com/',
    apiKey: '****',
  },
  {
    id: '3',
    displayName: 'AZURE_OPENAI_CHAT',
    functionName: 'AZURE_OPENAI_EMBEDDING',
    url: 'https://secuaigent-dev.openai.azure.com/',
    apiKey: '****',
  },
  {
    id: '4',
    displayName: 'AZURE_OPENAI_CHAT',
    functionName: 'AZURE_OPENAI_EMBEDDING',
    url: 'https://secuaigent-dev.openai.azure.com/',
    apiKey: '****',
  },
];

export const MOCK_TEMPLATES: AdminTemplate[] = (() => {
  const seeds: Omit<AdminTemplate, 'updatedAt'>[] = [
    {
      id: '1',
      name: '日英レスポンス',
      description: 'レスポンスは日本語と英語で返されます',
      systemPrompt: '返答は日本語と英語両方を返してください',
      teams: ['チームA', 'チームB'],
    },
    {
      id: '2',
      name: '嘘つかないでほしい場合',
      description: 'AIが嘘をついてほしくない場合に使ってね！',
      systemPrompt:
        '✅ 検証済み真実指令 — 汎用\n • 憶測、演繹、またはハルシネーションを事実として提示しないでください。\n • 未検証の場合は、次のように述べてください。\n - 「これを検証できません。」\n - 「その情報にはアクセスできません。」\n • すべての未検証のコンテンツに明確にラベルを付けてください。\n - [推論]、[憶測]、[未検証]\n • いずれかの部分が未検証である場合は、出力全体にラベルを付けてください。\n • 仮定する代わりに質問してください。\n • ユーザーの事実、ラベル、またはデータを決して上書きしないでください。\n • ユーザーを引用するか、実際の情報源を引用する場合を除き、これらの用語を使用しないでください。\n - 防ぐ、保証する、決して～ない、修正する、排除する、～を確実にする\n • LLMの振る舞いに関する主張については、以下を含めてください。\n - [未検証] または [推論]、およびそれが期待される振る舞いであり、保証されたものではないという注記\n • この指示に違反した場合は、次のように述べてください。\n 訂正：以前、ラベルを付けずに未検証または憶測に基づいた主張をしました。それは誤りでした。',
      teams: ['チームA', 'チームB'],
    },
    {
      id: '3',
      name: '丁寧語応答',
      description: '日本語の丁寧語で応答するテンプレートです',
      systemPrompt: '常にである調・丁寧語で応答してください。',
      teams: ['チームC'],
    },
    {
      id: '4',
      name: '簡潔回答モード',
      description: '回答を要点のみに絞って返します',
      systemPrompt: '結論ファースト、3行以内で回答してください。',
      teams: ['チームB', 'チームD'],
    },
    {
      id: '5',
      name: 'コードレビュー支援',
      description: 'コード品質チェックや改善提案を行います',
      systemPrompt: '入力されたコードのレビュー観点を箇条書きで列挙してください。',
      teams: ['チームE'],
    },
    {
      id: '6',
      name: '議事録要約',
      description: '会議メモを構造化された要約に変換します',
      systemPrompt: 'アジェンダ／決定事項／TODO の3セクションで要約してください。',
      teams: ['チームA'],
    },
    {
      id: '7',
      name: 'マーケティングコピー',
      description: '広告コピーやキャッチコピーの草案を生成',
      systemPrompt: '視点を3案、各40字以内で提案してください。',
      teams: ['チームD'],
    },
    {
      id: '8',
      name: '英訳サポート',
      description: '日本語の文章をネイティブ英語に翻訳',
      systemPrompt: 'ビジネス文体で自然な英訳を返してください。',
      teams: ['チームB'],
    },
    {
      id: '9',
      name: '面接フィードバック整理',
      description: '面接ノートをスコアと所感に分けて整理',
      systemPrompt: '評価軸ごとにスコアと根拠を記載してください。',
      teams: ['チームA', 'チームE'],
    },
    {
      id: '10',
      name: 'プレゼン構成案',
      description: 'プレゼンテーションのアウトラインを作成',
      systemPrompt: '導入・本論・結論の三部構成で章立てしてください。',
      teams: ['チームC', 'チームD'],
    },
    {
      id: '11',
      name: '質問深掘り',
      description: '質問に対して追加の確認質問を返します',
      systemPrompt: '理解を深める追質問を3件返してください。',
      teams: ['チームA'],
    },
    {
      id: '12',
      name: 'カスタマーサポート定型文',
      description: '問い合わせ対応用の丁寧な定型文',
      systemPrompt: '謝意 → 状況確認 → 提案 の順で返答してください。',
      teams: ['チームB'],
    },
  ];
  const pad = (n: number) => String(n).padStart(2, '0');
  const buildIso = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T20:0${daysAgo % 6}:00`;
  };
  return seeds.map((seed, i) => ({
    ...seed,
    id: String(i + 1),
    updatedAt: buildIso(i),
  }));
})();

export const MOCK_GROUPS: Group[] = [
  {
    id: '1',
    name: 'チームA',
    description: 'マーケティング戦略とキャンペーンの企画・実行',
    type: 'チーム',
    model: 'GPT-4o',
    memberCount: 12,
    createdAt: new Date('2024-01-15'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '2',
    name: 'プロダクト開発',
    description: '新製品の開発とイノベーション',
    type: 'プロジェクト',
    model: 'Claude 3.5',
    memberCount: 8,
    createdAt: new Date('2024-02-01'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '3',
    name: '営業部門',
    description: '法人営業とカスタマーサクセス',
    type: '部門',
    model: 'GPT-4',
    memberCount: 25,
    createdAt: new Date('2024-01-10'),
    createdBy: 'admin@example.com',
    isActive: false,
  },
  {
    id: '4',
    name: 'AIリサーチプロジェクト',
    description: '最新AI技術の研究開発',
    type: 'カスタム',
    model: 'Gemini Pro',
    memberCount: 5,
    createdAt: new Date('2024-03-01'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '5',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '6',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '7',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '8',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '9',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '10',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '11',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '12',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '13',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
  {
    id: '14',
    name: 'カスタマーサポート',
    description: '顧客サポートとヘルプデスク',
    type: 'チーム',
    model: 'GPT-4o-mini',
    memberCount: 15,
    createdAt: new Date('2024-01-20'),
    createdBy: 'admin@example.com',
    isActive: true,
  },
];

export const MOCK_ACCURACY_FEEDBACK: FeedbackItem[] = [
  {
    id: '1',
    accuracy: 'inaccurate',
    assistantName: 'アシスタントの名前',
    learningFolder: '-',
    questionSummary: 'システム運用の手順について教えてください。',
    answerSummary:
      'システム運用の手順については、以下のような内容があります。システム運用の手順については、以下のような内容があります。',
  },
  {
    id: '2',
    accuracy: 'inaccurate',
    assistantName: 'アシスタントの名前',
    learningFolder: '-',
    questionSummary: 'システム運用の手順について教えてください。',
    answerSummary: 'システム運用の手順については、以下のような内容があります。',
  },
  {
    id: '3',
    accuracy: 'accurate',
    assistantName: 'アシスタントの名前',
    learningFolder: '-',
    questionSummary: 'システム運用の手順について教えてください。',
    answerSummary: 'システム運用の手順については、以下のような内容があります。',
  },
  {
    id: '4',
    accuracy: 'inaccurate',
    assistantName: 'アシスタントの名前',
    learningFolder: '-',
    questionSummary: 'システム運用の手順について教えてください。',
    answerSummary: 'システム運用の手順については、以下のような内容があります。',
  },
  {
    id: '5',
    accuracy: 'accurate',
    assistantName: 'アシスタントの名前',
    learningFolder: '-',
    questionSummary: 'システム運用の手順について教えてください。',
    answerSummary: 'システム運用の手順については、以下のような内容があります。',
  },
];

export const MOCK_SATISFACTION_FEEDBACK: SatisfactionFeedbackItem[] = [
  {
    id: '1',
    userName: 'ユーザーの名前',
    satisfaction: 'star5',
    roomName: 'ルームの名前',
    learningFolder: '-',
    selected: false,
  },
  {
    id: '2',
    userName: 'ユーザーの名前',
    satisfaction: 'unrated',
    roomName: 'ルームの名前',
    learningFolder: '-',
    selected: false,
  },
  {
    id: '3',
    userName: 'ユーザーの名前',
    satisfaction: 'star3',
    roomName: 'ルームの名前',
    learningFolder: '-',
    selected: false,
  },
  {
    id: '4',
    userName: 'ユーザーの名前',
    satisfaction: 'unrated',
    roomName: 'ルームの名前',
    learningFolder: '-',
    selected: false,
  },
  {
    id: '5',
    userName: 'ユーザーの名前',
    satisfaction: 'star4',
    roomName: 'ルームの名前',
    learningFolder: '-',
    selected: false,
  },
];

export const MOCK_COUNT_STATS: CountStatItem[] = [
  {
    id: '1',
    userName: 'ユーザーの名前',
    accuracyCount: 1,
    satisfaction1: 1,
    satisfaction2: 1,
    satisfaction3: 1,
    satisfaction4: 1,
    satisfaction5: 1,
  },
  {
    id: '2',
    userName: 'ユーザーの名前',
    accuracyCount: 0,
    satisfaction1: 0,
    satisfaction2: 0,
    satisfaction3: 0,
    satisfaction4: 0,
    satisfaction5: 0,
  },
  {
    id: '3',
    userName: 'ユーザーの名前',
    accuracyCount: 0,
    satisfaction1: 0,
    satisfaction2: 0,
    satisfaction3: 0,
    satisfaction4: 0,
    satisfaction5: 0,
  },
  {
    id: '4',
    userName: 'ユーザーの名前',
    accuracyCount: 0,
    satisfaction1: 0,
    satisfaction2: 0,
    satisfaction3: 0,
    satisfaction4: 0,
    satisfaction5: 0,
  },
  {
    id: '5',
    userName: 'ユーザーの名前',
    accuracyCount: 0,
    satisfaction1: 0,
    satisfaction2: 0,
    satisfaction3: 0,
    satisfaction4: 0,
    satisfaction5: 0,
  },
];

export const MOCK_ASSISTANTS_SERVER_OPTIONS: SelectOption[] = [
  { value: ASSISTANT_SERVER_TYPE.SECURE, label: 'セキュア' },
  { value: ASSISTANT_SERVER_TYPE.SAAS_CHAT, label: 'クラウド(一般)' },
  { value: ASSISTANT_SERVER_TYPE.SAAS_RAG, label: 'クラウド(学習先指定)' },
];

export const MOCK_ASSISTANTS_API_OPTIONS: Record<string, SelectOption[]> = {
  [ASSISTANT_SERVER_TYPE.SECURE]: [
    { value: 'local-api-1', label: 'ローカルのAPI A' },
    { value: 'local-api-2', label: 'ローカルのAPI B' },
  ],
  [ASSISTANT_SERVER_TYPE.SAAS_CHAT]: [
    { value: 'cloud-api-1', label: 'クラウド(一般)のAPI A' },
    { value: 'cloud-api-2', label: 'クラウド(一般)のAPI B' },
  ],
  [ASSISTANT_SERVER_TYPE.SAAS_RAG]: [
    { value: 'saas-api-1', label: 'クラウド(学習先指定)のAPI A' },
    { value: 'saas-api-2', label: 'クラウド(学習先指定)のAPI B' },
  ],
};

export const MOCK_ASSISTANTS_MODEL_OPTIONS: Record<string, Record<string, SelectOption[]>> = {
  [ASSISTANT_SERVER_TYPE.SAAS_CHAT]: {
    'cloud-api-1': [
      { value: 'gpt-4o', label: 'gpt-4o' },
      { value: 'gpt-4o-mini-2024-07-18', label: 'gpt-4o-mini-2024-07-18' },
    ],
    'cloud-api-2': [{ value: 'gpt-35', label: 'gpt-3.5-turbo' }],
  },
  [ASSISTANT_SERVER_TYPE.SAAS_RAG]: {
    'saas-api-1': [
      { value: 'saas-a-1', label: 'gpt-4.1-nano-2025-04-14' },
      { value: 'saas-a-2', label: 'gpt-4.1-2025-04-14' },
    ],
    'saas-api-2': [
      { value: 'saas-b-1', label: 'gpt-4o-mini-2024-07-18' },
      { value: 'saas-b-2', label: 'gpt-4o-2024-11-20' },
    ],
  },
};

export const MOCK_ASSISTANTS_TEAM_OPTIONS: SelectOption[] = [
  { value: 'team-a', label: 'チームA' },
  { value: 'team-b', label: 'チームB' },
  { value: 'team-c', label: 'チームC' },
  { value: 'team-d', label: 'チームD' },
];

export const MOCK_ASSISTANTS_TERM_OPTIONS: SelectOption[] = [
  { value: 'term-a', label: '用語辞書A' },
  { value: 'term-b', label: '用語辞書B' },
  { value: 'term-c', label: '用語辞書C' },
  { value: 'term-d', label: '用語辞書D' },
];

export const MOCK_ASSISTANTS_ENDPOINTS_BY_TYPE: Record<
  string,
  { id: string; endpointName: string; type: string }[]
> = {
  [ASSISTANT_SERVER_TYPE.SECURE]: [
    { id: 'local-api-1', endpointName: 'ローカルのAPI A', type: 'LOCAL_SERVER' },
    { id: 'local-api-2', endpointName: 'ローカルのAPI B', type: 'LOCAL_SERVER' },
  ],
  [ASSISTANT_SERVER_TYPE.SAAS_CHAT]: [
    { id: 'cloud-api-1', endpointName: 'クラウド(一般)のAPI A', type: 'AZURE_OPENAI_CHAT' },
    { id: 'cloud-api-2', endpointName: 'クラウド(一般)のAPI B', type: 'AZURE_OPENAI_CHAT' },
  ],
  [ASSISTANT_SERVER_TYPE.SAAS_RAG]: [
    { id: 'saas-api-1', endpointName: 'クラウド(学習先指定)のAPI A', type: 'AZURE_OPENAI_RAG' },
    { id: 'saas-api-2', endpointName: 'クラウド(学習先指定)のAPI B', type: 'AZURE_OPENAI_RAG' },
  ],
};

export const MOCK_ASSISTANTS_AI_MODELS: { name: string; endpointType: string; active: boolean }[] =
  [
    { name: 'gpt-4o', endpointType: 'AZURE_OPENAI_CHAT', active: true },
    { name: 'gpt-4o-mini-2024-07-18', endpointType: 'AZURE_OPENAI_CHAT', active: true },
    { name: 'gpt-35-turbo', endpointType: 'AZURE_OPENAI_CHAT', active: true },
    { name: 'gpt-4.1-nano-2025-04-14', endpointType: 'AZURE_OPENAI_RAG', active: true },
    { name: 'gpt-4.1-2025-04-14', endpointType: 'AZURE_OPENAI_RAG', active: true },
    { name: 'gpt-4o-mini-2024-07-18', endpointType: 'AZURE_OPENAI_RAG', active: true },
    { name: 'gpt-4o-2024-11-20', endpointType: 'AZURE_OPENAI_RAG', active: true },
    { name: 'llama-3', endpointType: 'LOCAL_SERVER', active: true },
  ];

export const MOCK_ADMIN_CATEGORIES: AdminAssistantCategory[] = Array.from({ length: 20 }).map(
  (_, index) => {
    const name = ['A', 'B', 'C', 'D'];
    const cate = 'カテゴリ名';

    return {
      id: `category-${index}`,
      name: `${cate}${index % name.length}`,
      desc:
        index % 2
          ? 'カテゴリの説明を書きますカテゴリの説明を書きますカテゴリの説明を書きます'
          : '-',
      createdAt: new Date('2025-09-29T20:05:00'),
      updatedAt: new Date('2025-09-29T20:05:00'),
    };
  },
);

export const MOCK_ADMIN_ASSISTANTS: AssistantApiItem[] = Array.from({ length: 20 }).map(
  (_, index) => {
    const serverTypeOption =
      MOCK_ASSISTANTS_SERVER_OPTIONS[index % MOCK_ASSISTANTS_SERVER_OPTIONS.length];
    const cat = MOCK_ADMIN_CATEGORIES[index % MOCK_ADMIN_CATEGORIES.length];
    const isSaasRag = serverTypeOption.value === ASSISTANT_SERVER_TYPE.SAAS_RAG;

    return {
      id: index.toString(),
      name: `アシスタント${index}`,
      description: 'AzureOpenAIのGPT-4o-miniを使用したアシスタントです',
      type: serverTypeOption.value,
      endpoints: [
        { id: `endpoint-${index}`, label: 'gpt-4o-mini', model: 'gpt-4o-mini', url: '', type: '' },
      ],
      indexId: isSaasRag ? `idx-${3 + Math.floor(index / 3)}` : undefined,
      includeHistory: index % 2 === 0,
      iconColor: '',
      groups: MOCK_ASSISTANTS_TEAM_OPTIONS.map((item) => item.value),
      category: {
        id: cat.id,
        name: cat.name,
        description: cat.desc,
      },
    };
  },
);

const GLOSSARY_TERM_TAGS = [
  'タグタグ',
  'タグタグ',
  'タグタグタグタグ',
  'タグタグタグタグ',
  'タグタグタグタグ',
];

function mockGlossaryTerm(id: string): GlossaryItem {
  return {
    id,
    name: '用語辞書A',
    definition:
      '説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト',
    tags: [...GLOSSARY_TERM_TAGS],
    editedDate: new Date('2025-09-29'),
    creator: '名前名者名前',
    category: '全ての関語',
    assistant: 'Azure4o-mini, 論文添削',
  };
}

/** Mutable in-memory store for glossary terms (HTTP mock + GlossaryTermsMockService). */
export const MOCK_GLOSSARY_TERMS: GlossaryItem[] = Array.from({ length: 28 }, (_, i) =>
  mockGlossaryTerm(String(i + 1)),
);

/** Mutable in-memory store for glossary tags (Admin > Glossary > Tags tab). */
export const MOCK_GLOSSARY_TAG_ITEMS: GlossaryTagItem[] = Array.from({ length: 12 }, (_, i) => {
  const id = String(i + 1);
  return {
    id,
    name: `用語タグ${id}`,
    description: i % 3 === 0 ? '説明テキスト' : undefined,
    updatedDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
    updatedBy: '名前名前',
  };
});

const MOCK_GLOSSARY_WORD_DESCRIPTION =
  '用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト定義のテキスト定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト用語の定義のテキスト定義のテキスト定義のテキスト';

/** Seed rows for term-word-admin (per glossaryId). */
export function createSeedGlossaryDictionaryWords(): GlossaryWordTableRow[] {
  return Array.from({ length: 28 }, (_, i) => {
    const index = i + 1;
    return {
      id: `w${index}`,
      name: '用語用語',
      description: MOCK_GLOSSARY_WORD_DESCRIPTION,
      dateLabel: '2025/09/29 20:05',
      author: '名前名前',
      tags: ['タグタグ', 'タグタグ', 'タグタグ', 'タグタグ', 'タグタグ'],
    };
  });
}

const ASSISTANT_ROW_BASE: Omit<GlossaryDictionaryAssistantRow, 'id' | 'server' | 'history'> = {
  name: 'アシスタントの名前',
  description: 'AzureOpenAIのGPT-4o-miniを使用したアシスタントです',
  model: 'gpt-4o-mini-2024-07-18',
  category: 'カテゴリカテゴリ',
};

/** Seed rows for term-word-assistant-admin (per glossaryId). */
export function createSeedGlossaryDictionaryAssistants(): GlossaryDictionaryAssistantRow[] {
  return Array.from({ length: 28 }, (_, i) => {
    const index = i + 1;
    const mod = index % 4;
    const server =
      mod === 0
        ? 'ローカル'
        : mod === 1
          ? 'クラウド(一般)'
          : mod === 2
            ? 'クラウド(学習先指定)'
            : 'クラウド(一般)';
    return {
      id: `a${index}`,
      ...ASSISTANT_ROW_BASE,
      server,
      history: index % 2 === 0 ? 'ON' : 'OFF',
    };
  });
}

/** Mutable: dictionary word rows keyed by glossary term id. */
export const MOCK_GLOSSARY_DICTIONARY_WORDS: Record<string, GlossaryWordTableRow[]> = {};

export function ensureGlossaryDictionaryWords(glossaryId: string): GlossaryWordTableRow[] {
  if (!MOCK_GLOSSARY_DICTIONARY_WORDS[glossaryId]) {
    MOCK_GLOSSARY_DICTIONARY_WORDS[glossaryId] = createSeedGlossaryDictionaryWords();
  }
  return MOCK_GLOSSARY_DICTIONARY_WORDS[glossaryId];
}

/** Mutable: dictionary assistant rows keyed by glossary term id. */
export const MOCK_GLOSSARY_DICTIONARY_ASSISTANTS: Record<string, GlossaryDictionaryAssistantRow[]> =
  {};

export function ensureGlossaryDictionaryAssistants(
  glossaryId: string,
): GlossaryDictionaryAssistantRow[] {
  if (!MOCK_GLOSSARY_DICTIONARY_ASSISTANTS[glossaryId]) {
    MOCK_GLOSSARY_DICTIONARY_ASSISTANTS[glossaryId] = createSeedGlossaryDictionaryAssistants();
  }
  return MOCK_GLOSSARY_DICTIONARY_ASSISTANTS[glossaryId];
}
