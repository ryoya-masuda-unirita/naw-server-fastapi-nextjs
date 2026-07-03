import { Message } from '@app-types/chat/message.type';

export interface ChatAssistantMessageExam {
  title: string;
  message: Message;
}

export const MOCK_CHAT_ASSISTANT_MESSAGE_EXAMS: ChatAssistantMessageExam[] = [
  {
    title: 'ユーザーメッセージ 1',
    message: {
      id: 'exam-msg-1',
      messageId: 'exam-msg-1',
      role: 'user',
      status: 'OK',
      question:
        '社内の売上DBと、スプレッドシートの「2024年度予算案」を使って、第3四半期の予実対比グラフを作成してください。また、予算未達の部門については、「施策PDCA」を参照し、未達要因を分析し、対応策を提言してください。',
      answer: '',
      context: '',
      attachmentFiles: [],
      referenceFilePaths: [],
      isRated: false,
    },
  },
  {
    title: 'アシスタントメッセージ 1',
    message: {
      id: 'exam-msg-2',
      messageId: 'exam-msg-2',
      role: 'assistant',
      status: 'OK',
      question: '',
      answer: `承知いたしました。売上DBの実績値と予算案データを結合し、第3四半期の予実対比分析を行いました。分析の結果、営業第2部の未達幅が大きくなっています。

### 主な未達要因
- 新規顧客獲得数が目標比 **68%** にとどまっている
- 単価下落：競合他社との価格競争により平均単価が前年比 12% 低下
- 施策PDCAの「営業強化プログラム」が Q2 から遅延中

### 対応策の提言
1. Q4 に向けてターゲット顧客リストを再整備し、重点アプローチ先を絞り込む
2. 価格戦略の見直し：付加価値訴求による値引き回避
3. 遅延中の施策を 10 月末までに再スケジューリングする

**参考資料**
- 売上DB（2024 Q3）
- 2024年度予算案
- 施策PDCA レポート`,
      context: '',
      attachmentFiles: [],
      referenceFilePaths: [
        { name: '売上DB（2024 Q3）', url: '' },
        { name: '2024年度予算案', url: '' },
        { name: '施策PDCA レポート', url: '' },
      ],
      isRated: false,
      assistantId: 'asst-internal-001',
    },
  },
  {
    title: 'ユーザーメッセージ 2（ファイル添付）',
    message: {
      id: 'exam-msg-3',
      messageId: 'exam-msg-3',
      role: 'user',
      status: 'OK',
      question:
        '添付のファイルも参照しながら、営業第2部の改善計画をもう少し具体的にまとめてください。',
      answer: '',
      context: '',
      attachmentFiles: [
        {
          id: 'file-001',
          name: 'Q3_実績データ.xlsx',
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 1024000,
          url: '/files/Q3_実績データ.xlsx',
        },
      ],
      referenceFilePaths: [],
      isRated: false,
    },
  },
];
