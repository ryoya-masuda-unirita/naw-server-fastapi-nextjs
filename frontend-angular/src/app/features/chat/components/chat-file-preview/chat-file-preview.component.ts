import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { FileAttachment } from '../../../../../types/chat/file-attachment.type';

@Component({
  selector: 'app-chat-file-preview',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatIconModule],
  templateUrl: './chat-file-preview.component.html',
  styleUrl: './chat-file-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full bg-white border-l border-gray-200',
  },
})
export class ChatFilePreviewComponent {
  // Inputs
  readonly files = input.required<FileAttachment[]>();

  // Outputs
  readonly handleClose = output<void>();
  readonly handleDownload = output<FileAttachment>();
  readonly handleRemove = output<FileAttachment>();

  // Methods
  handleCloseEvent(): void {
    this.handleClose.emit();
  }

  handleDownloadEvent(file: FileAttachment): void {
    this.handleDownload.emit(file);
  }

  handleRemoveEvent(file: FileAttachment): void {
    this.handleRemove.emit(file);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  isImage(file: FileAttachment): boolean {
    return file.type.startsWith('image/');
  }

  isPdf(file: FileAttachment): boolean {
    return file.type === 'application/pdf';
  }

  getFileIcon(file: FileAttachment): string {
    const type = file.type.split('/')[0];
    switch (type) {
      case 'image':
        return 'image';
      case 'video':
        return 'videocam';
      case 'audio':
        return 'audiotrack';
      case 'application':
        if (file.type.includes('pdf')) return 'picture_as_pdf';
        return 'description';
      default:
        return 'attach_file';
    }
  }
}
