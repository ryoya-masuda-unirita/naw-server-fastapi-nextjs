import { describe, expect, test, vi } from 'vitest';
import { notifyLoginKeyError, type TranslatorLike } from './login-key-error';

const LOGIN_KEY_ERROR_MESSAGE = '不正なログインキーです';

const createTranslator = (isInitialized: boolean): TranslatorLike & { initialize: () => void } => {
  const listeners: Array<() => void> = [];
  const translator = {
    isInitialized,
    on: (_event: 'initialized', callback: () => void) => {
      listeners.push(callback);
    },
    t: (key: string) => (translator.isInitialized ? LOGIN_KEY_ERROR_MESSAGE : key),
    initialize: () => {
      translator.isInitialized = true;
      listeners.forEach((listener) => listener());
    },
  };
  return translator;
};

describe('notifyLoginKeyError', () => {
  test('翻訳の初期化が済んでいれば、すぐに翻訳済みの文言でエラートーストを出すこと', async () => {
    const showErrorToast = vi.fn();

    await notifyLoginKeyError(createTranslator(true), showErrorToast);

    expect(showErrorToast).toHaveBeenCalledWith(LOGIN_KEY_ERROR_MESSAGE);
  });

  test('翻訳の初期化が終わるまで待ち、キーのままの文言を出さないこと', async () => {
    const translator = createTranslator(false);
    const showErrorToast = vi.fn();

    const pending = notifyLoginKeyError(translator, showErrorToast);
    await Promise.resolve();
    expect(showErrorToast).not.toHaveBeenCalled();

    translator.initialize();
    await pending;

    expect(showErrorToast).toHaveBeenCalledTimes(1);
    expect(showErrorToast).toHaveBeenCalledWith(LOGIN_KEY_ERROR_MESSAGE);
  });
});
