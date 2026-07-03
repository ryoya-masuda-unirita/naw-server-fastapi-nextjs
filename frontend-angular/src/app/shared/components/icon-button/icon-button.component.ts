import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export type IconButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'primary-gray'
  | 'secondary-gray'
  | 'tertiary-gray';
export type IconButtonSize = 'default' | 'thin' | 'large' | 'largePc';
export type IconButtonType = 'button' | 'submit' | 'file' | 'icon';

const SIZE_CLASS: Record<IconButtonSize, string> = {
  default: 'w-7 h-7',
  thin: 'w-5 h-5',
  large: 'w-9 h-9',
  largePc: 'w-7 h-7 md:w-9 md:h-9',
};

@Component({
  selector: 'app-icon-button',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <ng-template #content><ng-content /></ng-template>

    @if (type() === 'file') {
      <label
        [class]="hostClass()"
        [class.pointer-events-none]="disabled()"
        [class.opacity-50]="disabled()"
      >
        <input
          type="file"
          class="sr-only"
          [disabled]="disabled()"
          [multiple]="multiple()"
          (change)="onFileChange($event)"
        />
        <span
          class="pointer-events-none flex items-center justify-center w-full h-full"
          aria-hidden="true"
        >
          <ng-container *ngTemplateOutlet="content" />
        </span>
      </label>
    } @else if (link()) {
      <a
        [routerLink]="link()"
        [class]="hostClass()"
        [class.pointer-events-none]="disabled()"
        [class.opacity-50]="disabled()"
        [attr.aria-label]="ariaLabel() || null"
        (click)="onClick($event)"
      >
        <ng-container *ngTemplateOutlet="content" />
      </a>
    } @else if (type() === 'icon') {
      <div [class]="hostClass()" (click)="onClick($event)">
        <ng-container *ngTemplateOutlet="content" />
      </div>
    } @else {
      <button
        [type]="type() === 'submit' ? 'submit' : 'button'"
        [class]="hostClass()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel() || null"
        (click)="onClick($event)"
      >
        <ng-container *ngTemplateOutlet="content" />
      </button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
})
export class IconButtonComponent {
  readonly variant = input<IconButtonVariant>('primary');
  readonly size = input<IconButtonSize>('default');
  readonly type = input<IconButtonType>('button');
  readonly disabled = input<boolean>(false);
  readonly multiple = input<boolean>(false);
  readonly link = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly classProps = input<string>('');

  readonly fileChange = output<FileList>();
  readonly buttonClick = output<MouseEvent>();

  readonly hostClass = computed(
    () =>
      `icon-button icon-button-${this.variant()} ${SIZE_CLASS[this.size()]} ${this.classProps()}`,
  );

  onClick(event: MouseEvent): void {
    if (!this.disabled()) {
      this.buttonClick.emit(event);
    }
  }

  onFileChange(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files?.length) {
      this.fileChange.emit(files);
    }
  }
}
