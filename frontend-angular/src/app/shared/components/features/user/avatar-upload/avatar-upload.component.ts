import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-avatar-upload',
  standalone: true,
  imports: [TranslateModule, SvgIconComponent],
  templateUrl: './avatar-upload.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AvatarUploadComponent {
  readonly label = input<string>('アイコン');
  readonly supportText = input<string>('');
  readonly errorMessage = input<string>('');
  readonly loading = input<boolean>(false);
  readonly avatarPreview = input<string | null>(null);
  readonly shape = input<'circle' | 'square'>('circle');
  readonly inputId = input<string>('avatar-upload');

  readonly avatarChange = output<string | null>();
  readonly fileChange = output<File | null>();

  readonly fileName = signal<string>('');

  readonly previewClass = computed(() =>
    [
      'avatar-upload__preview',
      this.shape() === 'square' ? 'avatar-upload__preview--square' : '',
      this.loading() ? 'border border-border-strong' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fileName.set(file.name);
    this.fileChange.emit(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      this.avatarChange.emit(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  removeAvatar(): void {
    this.fileName.set('');
    this.fileChange.emit(null);
    this.avatarChange.emit(null);
  }
}
