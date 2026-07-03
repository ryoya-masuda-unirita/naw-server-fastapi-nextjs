import { FileAttachment } from '@app-types/chat';

export function getFilePreviewUrl(file: FileAttachment | File): string {
  if (file instanceof File) {
    return file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
  }
  if (file.data) {
    return file.data.startsWith('data:') ? file.data : `data:${file.type};base64,${file.data}`;
  }
  return file.url ?? file.previewUrl ?? '';
}
