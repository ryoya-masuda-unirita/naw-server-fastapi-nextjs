import type { ComponentProps } from 'react';
import { addAttachedFiles } from '@/lib/utils/chat-attachment';
import { ChatAttachmentChips, ChatAttachmentDropzone } from './chat-attachments';
import type { ChatInput } from './chat-input';

type AttachmentSlots = Pick<
  ComponentProps<typeof ChatInput>,
  'renderDropzone' | 'renderAttachments' | 'onDropFiles'
>;

/** `ChatInput` の添付の口にまとめて渡す（`ChatWindow` が既定で使う） */
export const chatAttachmentSlots: AttachmentSlots = {
  renderDropzone: (controls) => <ChatAttachmentDropzone controls={controls} />,
  renderAttachments: (controls) => <ChatAttachmentChips controls={controls} />,
  onDropFiles: addAttachedFiles,
};
