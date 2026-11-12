import type { FeedbackItem, SatisfactionFeedbackItem } from '@app-types/admin/feedback.types';

export function buildAccuracyAdditionalLearningContent(item: FeedbackItem): File {
  const markdown = [
    '# 追加学習',
    '',
    `- フィードバックID: ${item.id}`,
    '',
    '## 質問',
    item.questionSummary || '-',
    '',
    '## 回答',
    item.answerSummary || '-',
    '',
  ].join('\n');

  return new File([markdown], `追加学習_${item.id}.md`, { type: 'text/markdown' });
}

export function buildSatisfactionAdditionalLearningContent(item: SatisfactionFeedbackItem): File {
  const roomId = requireRoomId(item);
  const markdown = [
    '# 追加学習',
    '',
    `- フィードバックID: ${item.id}`,
    `- ルームID: ${roomId}`,
    `- ルーム名: ${item.roomName}`,
    `- ユーザー: ${item.userName}`,
    `- 評価: ${item.satisfaction}`,
    item.updatedAt ? `- 更新日時: ${item.updatedAt}` : undefined,
    '',
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');

  return new File([markdown], `追加学習_ルーム_${roomId}.md`, { type: 'text/markdown' });
}

function requireRoomId(item: SatisfactionFeedbackItem): string {
  if (!item.roomId) {
    throw new Error('Satisfaction feedback item requires roomId for additional learning.');
  }
  return item.roomId;
}
