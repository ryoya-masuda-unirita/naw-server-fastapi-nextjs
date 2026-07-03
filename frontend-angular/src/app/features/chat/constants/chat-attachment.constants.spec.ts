import { describe, expect, test } from 'vitest';
import { CHAT_ATTACHMENT_ACCEPT, isAllowedChatAttachment } from './chat-attachment.constants';

describe('chat-attachment.constants', () => {
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
      const file = new File([''], 'notes.txt', { type: '' });
      expect(isAllowedChatAttachment(file)).toBe(true);
    });

    test('許可されていないファイルを拒否すること', () => {
      const file = new File([''], 'archive.zip', { type: 'application/zip' });
      expect(isAllowedChatAttachment(file)).toBe(false);
    });
  });

  describe('CHAT_ATTACHMENT_ACCEPT', () => {
    test('追加した拡張子を含むこと', () => {
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('.docx');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('.xlsx');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('.pptx');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('.txt');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('.md');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('.csv');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('.xml');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('.html');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('image/*');
      expect(CHAT_ATTACHMENT_ACCEPT).toContain('application/pdf');
    });
  });
});
