export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data?: string;
  url?: string;
  previewUrl?: string;
}
