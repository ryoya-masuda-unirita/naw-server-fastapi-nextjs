import { afterEach, describe, expect, test, vi } from 'vitest';
import { PASSWORD_ASCII_PATTERN } from '@/lib/constants/validation';
import { buildTokenUsageDateRange, formatApiDateTimeUtc, formatUtcDate } from './api-datetime';
import { formatLocalDate } from './display-date';
import { resolveControlError } from './form-errors';
import { scrollToFirstFormError } from './scroll-to-error';
import { resolveTabQueryParam, shouldNormalizeTabQueryParam } from './tab-query-param';
import { validate, validateEmail, validateRequired } from './validation';

// 翻訳の代わりに、キーと埋め込み値をそのまま文字列にする
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key;

describe('api-datetime', () => {
  test('API 用の日時はミリ秒なしの UTC になること', () => {
    expect(formatApiDateTimeUtc(new Date('2025-05-28T15:04:05.123Z'))).toBe('2025-05-28T15:04:05Z');
  });

  test('本日分の範囲は UTC の日の始まりから現在までになること', () => {
    const now = new Date('2025-05-28T10:30:00.000Z');
    expect(buildTokenUsageDateRange('today', now)).toEqual({
      from: '2025-05-28T00:00:00Z',
      to: '2025-05-28T10:30:00Z',
    });
  });

  test('今月分の範囲は UTC の月初から現在までになること', () => {
    const now = new Date('2025-05-28T10:30:00.000Z');
    expect(buildTokenUsageDateRange('month', now).from).toBe('2025-05-01T00:00:00Z');
  });

  test('請求期間の表示は UTC の日付になり、日付でなければ空になること', () => {
    expect(formatUtcDate('2025-05-31T23:00:00Z')).toBe('2025/05/31');
    expect(formatUtcDate(undefined)).toBe('');
    expect(formatUtcDate('not-a-date')).toBe('');
  });
});

describe('display-date', () => {
  test('Date・日付文字列を yyyy/mm/dd（ローカル時刻）にすること', () => {
    expect(formatLocalDate(new Date(2026, 0, 2))).toBe('2026/01/02');
    // 実行環境のタイムゾーンに左右されないよう、ローカル時刻で作った日時の文字列を渡す
    expect(formatLocalDate(new Date(2026, 4, 22, 12).toISOString())).toBe('2026/05/22');
  });

  test('日付が無い・読み取れないときは空にすること', () => {
    expect(formatLocalDate(undefined)).toBe('');
    expect(formatLocalDate(null)).toBe('');
    expect(formatLocalDate('')).toBe('');
    expect(formatLocalDate('not-a-date')).toBe('');
  });
});

describe('validation', () => {
  test('必須の項目が空白だけならエラーになること', () => {
    expect(validate('  ', {}, t)).toEqual({ isValid: false, error: 'VALIDATION.REQUIRED' });
    expect(validateRequired('', t).isValid).toBe(false);
  });

  test('任意の項目が空なら他のルールを見ずに通ること', () => {
    expect(validate('', { required: false, minLength: 3 }, t).isValid).toBe(true);
  });

  test('文字数・形式のルールで文言に上限・下限を埋め込むこと', () => {
    expect(validate('ab', { minLength: 3 }, t).error).toBe('VALIDATION.MIN_LENGTH:{"min":3}');
    expect(validate('abcd', { maxLength: 3 }, t).error).toBe('VALIDATION.MAX_LENGTH:{"max":3}');
    expect(validate('abc', { pattern: /^\d+$/ }, t).error).toBe('VALIDATION.PATTERN');
    expect(validate('123', { pattern: /^\d+$/ }, t)).toEqual({ isValid: true, error: '' });
  });

  test('メールアドレスの形式を確かめること', () => {
    expect(validateEmail('a@example.com', t).isValid).toBe(true);
    expect(validateEmail('invalid', t).error).toBe('VALIDATION.EMAIL');
    expect(validateEmail('', t, false).isValid).toBe(true);
  });

  test('パスワードは印字可能な半角 ASCII だけを許すこと', () => {
    expect(PASSWORD_ASCII_PATTERN.test('Pass word!1')).toBe(true);
    expect(PASSWORD_ASCII_PATTERN.test('パスワード')).toBe(false);
  });
});

describe('form-errors', () => {
  test('触れていない項目はエラーを出さないこと', () => {
    expect(resolveControlError({ touched: false, errors: { required: true } }, t)).toBe('');
  });

  test('最初に解決できたエラーの文言を返すこと', () => {
    expect(
      resolveControlError(
        { touched: true, errors: { custom: true, minlength: { requiredLength: 8 } } },
        t
      )
    ).toBe('VALIDATION.MIN_LENGTH:{"min":8}');
    expect(resolveControlError({ touched: true, errors: { passwordAscii: true } }, t)).toBe(
      'VALIDATION.PASSWORD_ASCII_ONLY'
    );
  });

  test('エラーが無ければ空にすること', () => {
    expect(resolveControlError({ touched: true, errors: null }, t)).toBe('');
  });
});

describe('scroll-to-error', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('ダイアログ内で、指定した順で最初の不正な項目までスクロールすること', () => {
    document.body.innerHTML = `
      <div role="dialog"><input id="name-input" /><input id="email-input" /></div>
    `;
    const nameEl = document.getElementById('name-input') as HTMLElement;
    const emailEl = document.getElementById('email-input') as HTMLElement;
    nameEl.scrollIntoView = vi.fn();
    emailEl.scrollIntoView = vi.fn();

    scrollToFirstFormError(
      (name) => name === 'email',
      [
        { controlName: 'name', elementId: 'name-input' },
        { controlName: 'email', elementId: 'email-input' },
      ]
    );

    expect(nameEl.scrollIntoView).not.toHaveBeenCalled();
    expect(emailEl.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
  });

  test('数字で始まる id でも例外にならずスクロールすること', () => {
    document.body.innerHTML = '<div role="dialog"><input id="1-name" /></div>';
    const el = document.getElementById('1-name') as HTMLElement;
    el.scrollIntoView = vi.fn();

    scrollToFirstFormError(() => true, [{ controlName: 'name', elementId: '1-name' }]);

    expect(el.scrollIntoView).toHaveBeenCalled();
  });
});

describe('tab-query-param', () => {
  const tabs = ['terms', 'tags'] as const;

  test('有効なタブだけを受け付け、それ以外は既定のタブにすること', () => {
    expect(resolveTabQueryParam('tags', tabs, 'terms')).toBe('tags');
    expect(resolveTabQueryParam(undefined, tabs, 'terms')).toBe('terms');
    expect(resolveTabQueryParam('invalid', tabs, 'terms')).toBe('terms');
    expect(resolveTabQueryParam(123, tabs, 'terms')).toBe('terms');
  });

  test('URL の値と選んだタブが違うときだけ URL を直すこと', () => {
    expect(shouldNormalizeTabQueryParam(null, 'terms')).toBe(true);
    expect(shouldNormalizeTabQueryParam('tags', 'tags')).toBe(false);
  });
});
