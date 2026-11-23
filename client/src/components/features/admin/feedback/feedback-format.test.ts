import { describe, expect, test } from 'vitest';
import {
  buildPageRange,
  formatUpdatedAt,
  getSatisfactionLabel,
  resolveAssistantName,
  toFilterParam,
  toPlainTableCellText,
  toRoomFeedbackRating,
  toSatisfactionValue,
} from './feedback-format';
import {
  buildAccuracyAdditionalLearningContent,
  buildSatisfactionAdditionalLearningContent,
} from './additional-learning-content';

describe('resolveAssistantName', () => {
  test('アシスタント名があればそのまま返すこと', () => {
    expect(resolveAssistantName('テストアシスタント', '不明なアシスタント')).toBe(
      'テストアシスタント',
    );
  });

  test('アシスタント名が null・undefined なら不明ラベルを返すこと', () => {
    expect(resolveAssistantName(null, '不明なアシスタント')).toBe('不明なアシスタント');
    expect(resolveAssistantName(undefined, '不明なアシスタント')).toBe('不明なアシスタント');
  });
});

describe('toFilterParam', () => {
  test('all・null・空はフィルターなしにすること', () => {
    expect(toFilterParam('all')).toBeUndefined();
    expect(toFilterParam(null)).toBeUndefined();
    expect(toFilterParam('')).toBeUndefined();
    expect(toFilterParam('a1')).toBe('a1');
  });
});

describe('満足度の変換', () => {
  test('選択値を API の rating にすること', () => {
    expect(toRoomFeedbackRating('star5')).toBe('EXCELLENT');
    expect(toRoomFeedbackRating('star1')).toBe('POOR');
    expect(toRoomFeedbackRating(null)).toBeUndefined();
  });

  test('API の rating を一覧の満足度にし、未評価も扱うこと', () => {
    expect(toSatisfactionValue('VERY_GOOD')).toBe('star4');
    expect(toSatisfactionValue(undefined)).toBe('unrated');
    expect(getSatisfactionLabel('star3', '未評価')).toBe('★★★☆☆');
    expect(getSatisfactionLabel('unrated', '未評価')).toBe('未評価');
  });
});

describe('toPlainTableCellText', () => {
  test('HTML タグ・Markdown の記号・実体参照を取り除いて 1 行にすること', () => {
    expect(toPlainTableCellText('# 見出し\n**太字**と<b>タグ</b> &amp; [リンク](http://x)')).toBe(
      '見出し 太字 と タグ & リンク',
    );
  });
});

describe('formatUpdatedAt', () => {
  test('ローカルの yyyy/MM/dd HH:mm にし、値がなければ - にすること', () => {
    expect(formatUpdatedAt('2026-11-01T09:05:00')).toBe('2026/11/01 09:05');
    expect(formatUpdatedAt(undefined)).toBe('-');
    expect(formatUpdatedAt('invalid')).toBe('-');
  });
});

describe('buildPageRange', () => {
  test('表示中の範囲を計算し、0 件なら 0 にすること', () => {
    expect(
      buildPageRange({ totalElements: 12, number: 1, size: 5, numberOfElements: 5 }, 5),
    ).toEqual({ from: 6, to: 10, total: 12 });
    expect(buildPageRange(undefined, 5)).toEqual({ from: 0, to: -1, total: 0 });
  });
});

describe('追加学習のファイル', () => {
  test('回答精度のファイルに質問と回答を書くこと', async () => {
    const file = buildAccuracyAdditionalLearningContent({
      id: 'fb1',
      accuracy: 'accurate',
      assistantName: 'a',
      learningFolder: '-',
      questionSummary: '質問',
      answerSummary: '',
    });

    expect(file.name).toBe('追加学習_fb1.md');
    expect(file.type).toBe('text/markdown');
    expect(await file.text()).toBe(
      '# 追加学習\n\n- フィードバックID: fb1\n\n## 質問\n質問\n\n## 回答\n-\n',
    );
  });

  test('満足度のファイルにルームの情報を書き、roomId がなければ失敗すること', async () => {
    const item = {
      id: 'rf1',
      userName: '山田',
      satisfaction: 'star4' as const,
      roomName: '相談',
      roomId: 'room1',
      learningFolder: '-',
      updatedAt: '2026-11-02T10:00:00',
    };
    const file = buildSatisfactionAdditionalLearningContent(item);

    expect(file.name).toBe('追加学習_ルーム_room1.md');
    expect(await file.text()).toContain('- ルーム名: 相談');
    expect(() =>
      buildSatisfactionAdditionalLearningContent({
        ...item,
        roomId: undefined,
      }),
    ).toThrow();
  });
});
