import { describe, expect, test } from 'vitest';
import type { SatisfactionFeedbackItem } from '@/types/admin/feedback.types';
import type { MessageContentApiItem } from '@/types/chat/message-api.type';
import { buildSatisfactionAdditionalLearningContent } from './additional-learning-content';

const ITEM: SatisfactionFeedbackItem = {
  id: 'fb-1',
  userName: '山田',
  satisfaction: 'star5',
  roomName: '相談',
  roomId: 'room-1',
  learningFolder: '',
  updatedAt: '2026-11-23',
};

function content(question: string | null, answer: string | null): MessageContentApiItem {
  return {
    id: 'c',
    messageId: 'm',
    status: 'OK',
    question,
    answer,
    context: null,
    isRated: false,
  } as MessageContentApiItem;
}

/** jsdom の File は text() を持たないため、FileReader で読む */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

describe('buildSatisfactionAdditionalLearningContent', () => {
  test('questions and answers are listed after the room information', async () => {
    const file = buildSatisfactionAdditionalLearningContent(ITEM, [
      content('Q1', 'A1'),
      content('Q2', 'A2'),
    ]);

    const text = await readText(file);
    expect(file.name).toBe('追加学習_ルーム_room-1.md');
    expect(text).toContain('- ルーム名: 相談');
    expect(text.indexOf('## 質問\nQ1\n\n## 回答\nA1')).toBeGreaterThan(text.indexOf('- 更新日時'));
    expect(text).toContain('## 質問\nQ2\n\n## 回答\nA2');
  });

  test('empty question and answer are written as a hyphen', async () => {
    const text = await readText(
      buildSatisfactionAdditionalLearningContent(ITEM, [content(null, '')]),
    );

    expect(text).toContain('## 質問\n-\n\n## 回答\n-');
  });

  test('missing room id throws', () => {
    expect(() =>
      buildSatisfactionAdditionalLearningContent({ ...ITEM, roomId: undefined }, []),
    ).toThrow();
  });
});
