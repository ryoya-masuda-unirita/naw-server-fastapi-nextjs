import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonComponent } from '../../button/button.component';
import { SvgIconComponent } from '../../icons/svg-icon.component';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonComponent, SvgIconComponent],
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileUploadComponent {
  readonly id = input<string>('file-upload');
  readonly variant = input<'simple' | 'full'>('simple');
  readonly filesSelected = output<File[]>();

  readonly isDragging = signal<boolean>(false);

  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  readonly folderInput = viewChild<ElementRef<HTMLInputElement>>('folderInput');

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFiles(Array.from(input.files));
      input.value = '';
    }
  }

  private handleFiles(files: File[]): void {
    this.filesSelected.emit(files);
  }

  triggerFileSelect(): void {
    this.fileInput()?.nativeElement.click();
  }

  triggerFolderSelect(): void {
    this.folderInput()?.nativeElement.click();
  }
}
