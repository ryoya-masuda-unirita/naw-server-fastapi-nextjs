import { describe, expect, test } from 'vitest';
import { CHAT_ATTACHMENT_ACCEPT, isAllowedChatAttachment } from './chat-attachment';

describe('isAllowedChatAttachment', () => {
  test('画像ファイルを許可すること', () => {
    const file = new File([''], 'photo.png', { type: 'image/png' });
    expect(isAllowedChatAttachment(file)).toBe(true);
  });

  test('PDFを許可すること', () => {
    const file = new File([''], 'document.pdf', { type: 'application/pdf' });
    expect(isAllowedChatAttachment(file)).toBe(true);
  });

  test.each([
    ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['notes.txt', 'text/plain'],
    ['readme.md', 'text/markdown'],
    ['export.csv', 'text/csv'],
    ['config.xml', 'text/xml'],
    ['page.html', 'text/html'],
  ])('%s を許可すること', (name, type) => {
    const file = new File([''], name, { type });
    expect(isAllowedChatAttachment(file)).toBe(true);
  });

  test('MIMEタイプが空でも拡張子で判定すること', () => {
    const file = new File([''], 'notes.TXT', { type: '' });
    expect(isAllowedChatAttachment(file)).toBe(true);
  });

  test('許可されていないファイルを拒否すること', () => {
    const file = new File([''], 'archive.zip', { type: 'application/zip' });
    expect(isAllowedChatAttachment(file)).toBe(false);
  });
});

describe('CHAT_ATTACHMENT_ACCEPT', () => {
  test('許可した拡張子・MIME・画像を含むこと', () => {
    for (const expected of [
      '.docx',
      '.xlsx',
      '.pptx',
      '.txt',
      '.md',
      '.csv',
      '.xml',
      '.html',
      'image/*',
      'application/pdf',
    ]) {
      expect(CHAT_ATTACHMENT_ACCEPT).toContain(expected);
    }
  });
});
