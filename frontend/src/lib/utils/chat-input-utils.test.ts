import { beforeEach, describe, expect, test } from 'vitest';
import { takePendingMessage, setPendingMessage } from '@/lib/chat/pending-message';
import type { Assistant } from '@/types/chat/assistant.type';
import { getFilePreviewUrl } from './file-preview';
import { isValidRoomName, normalizeRoomName } from './room-name';
import { resolveInitialAssistant } from './resolve-initial-assistant';

function buildAssistant(id: string, overrides: Partial<Assistant> = {}): Assistant {
  return { id, name: id, description: '', category: '', model: '', ...overrides };
}

describe('resolveInitialAssistant', () => {
  const assistants = [buildAssistant('a1'), buildAssistant('a2', { isDefault: true }), buildAssistant('a3')];

  test('一覧が空なら null になること', () => {
    expect(resolveInitialAssistant([], 'a1')).toBeNull();
  });

  test('ルームの既定アシスタントがあればそれを選ぶこと', () => {
    expect(resolveInitialAssistant(assistants, 'a3')?.id).toBe('a3');
  });

  test('ルームの既定が一覧になければ、一覧の既定を選ぶこと', () => {
    expect(resolveInitialAssistant(assistants, 'missing')?.id).toBe('a2');
  });

  test('既定がどこにもなければ先頭を選ぶこと', () => {
    expect(resolveInitialAssistant([buildAssistant('a1'), buildAssistant('a2')], null)?.id).toBe('a1');
  });
});

describe('room-name', () => {
  test('前後の空白を取り除くこと', () => {
    expect(normalizeRoomName('  名前 ')).toBe('名前');
  });

  test('空白だけの名前は無効、それ以外は有効なこと', () => {
    expect(isValidRoomName('   ')).toBe(false);
    expect(isValidRoomName(' a ')).toBe(true);
  });
});

describe('getFilePreviewUrl', () => {
  test('data があれば data URL を返すこと', () => {
    expect(getFilePreviewUrl({ id: '1', name: 'a.png', type: 'image/png', size: 1, data: 'AAA' })).toBe(
      'data:image/png;base64,AAA',
    );
    expect(getFilePreviewUrl({ id: '1', name: 'a.png', type: 'image/png', size: 1, data: 'data:x' })).toBe('data:x');
  });

  test('data がなければ url、なければ previewUrl を返すこと', () => {
    expect(getFilePreviewUrl({ id: '1', name: 'a', type: 'x', size: 1, url: 'u', previewUrl: 'p' })).toBe('u');
    expect(getFilePreviewUrl({ id: '1', name: 'a', type: 'x', size: 1, previewUrl: 'p' })).toBe('p');
    expect(getFilePreviewUrl({ id: '1', name: 'a', type: 'x', size: 1 })).toBe('');
  });

  test('画像以外の File は空文字を返すこと', () => {
    expect(getFilePreviewUrl(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBe('');
  });
});

describe('pending-message', () => {
  beforeEach(() => {
    takePendingMessage('r1');
    takePendingMessage('r2');
  });

  test('預けた内容はルームごとに 1 回だけ取り出せること', () => {
    setPendingMessage('r1', { content: 'hello', files: [], options: { assistantId: 'a1' } });

    expect(takePendingMessage('r2')).toBeNull();
    expect(takePendingMessage('r1')?.content).toBe('hello');
    expect(takePendingMessage('r1')).toBeNull();
  });
});
