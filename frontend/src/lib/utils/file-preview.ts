import type { FileAttachment } from '@/types/chat/file-attachment.type';

/** 添付ファイルのプレビュー用 URL（移植元 core/utils/file.helpers.ts の getFilePreviewUrl） */
export function getFilePreviewUrl(file: FileAttachment | File): string {
  if (file instanceof File) {
    return file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
  }
  if (file.data) {
    return file.data.startsWith('data:') ? file.data : `data:${file.type};base64,${file.data}`;
  }
  return file.url ?? file.previewUrl ?? '';
}
