// 移植元 features/chat/constants/chat-attachment.constants.ts

export const CHAT_ATTACHMENT_EXTENSIONS = [
  'docx',
  'xlsx',
  'pptx',
  'txt',
  'md',
  'csv',
  'xml',
  'html',
] as const;

const CHAT_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/csv',
  'text/xml',
  'application/xml',
  'text/html',
] as const;

const ALLOWED_EXTENSIONS = new Set<string>(CHAT_ATTACHMENT_EXTENSIONS);
const ALLOWED_MIME_TYPES = new Set<string>(CHAT_ATTACHMENT_MIME_TYPES);

/** `<input type="file" accept>` に渡す値 */
export const CHAT_ATTACHMENT_ACCEPT = [
  'image/*',
  ...CHAT_ATTACHMENT_MIME_TYPES,
  ...CHAT_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

/** チャットに添付してよいファイルか。画像は常に許可、それ以外は MIME か拡張子で判定する */
export function isAllowedChatAttachment(file: File): boolean {
  if (file.type.startsWith('image/')) {
    return true;
  }

  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) {
    return true;
  }

  return ALLOWED_EXTENSIONS.has(getFileExtension(file.name));
}
