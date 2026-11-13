import { describe, expect, test } from 'vitest';
import {
  validatePasswordField,
  validateRequiredField,
  validateUsername,
} from './auth-validation';

// 翻訳キーと引数をそのまま返す翻訳関数
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key;

describe('validateRequiredField', () => {
  test('空文字は必須エラーになること', () => {
    expect(validateRequiredField('', t)).toBe('VALIDATION.REQUIRED');
  });

  test('空白のみは移植元と同じく必須エラーにしないこと', () => {
    expect(validateRequiredField('  ', t)).toBe('');
  });
});

describe('validateUsername', () => {
  test('未入力は必須エラーになること', () => {
    expect(validateUsername('', t)).toBe('VALIDATION.REQUIRED');
  });

  test('2文字は最小文字数エラーになること', () => {
    expect(validateUsername('ab', t)).toBe('VALIDATION.MIN_LENGTH:{"min":3}');
  });

  test('3文字と50文字は通ること', () => {
    expect(validateUsername('abc', t)).toBe('');
    expect(validateUsername('a'.repeat(50), t)).toBe('');
  });

  test('51文字は最大文字数エラーになること', () => {
    expect(validateUsername('a'.repeat(51), t)).toBe('VALIDATION.MAX_LENGTH:{"max":50}');
  });
});

describe('validatePasswordField', () => {
  test('未入力は必須エラーになること', () => {
    expect(validatePasswordField('', t)).toBe('VALIDATION.REQUIRED');
  });

  test('テナントの最小文字数より短くても通ること', () => {
    expect(validatePasswordField('ab12', t)).toBe('');
  });

  test('64文字は通り、65文字は最大文字数エラーになること', () => {
    expect(validatePasswordField('a'.repeat(64), t)).toBe('');
    expect(validatePasswordField('a'.repeat(65), t)).toBe('VALIDATION.MAX_LENGTH:{"max":64}');
  });

  test('全角文字を含むと半角のみエラーになること', () => {
    expect(validatePasswordField('あAbcd1234!', t)).toBe('VALIDATION.PASSWORD_ASCII_ONLY');
  });
});
