/**
 * Button Component - Reusable button control
 * Following Figma design specifications
 *
 * Variants:
 * - solid: Filled background (default)
 * - outline: Border only, transparent background
 *
 * Sizes:
 * - sm: Small button
 * - md: Medium button (default)
 * - lg: Large button
 *
 * Optional `heightPx` overrides the height from `size` (e.g. login submit 54px).
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type ButtonVariant = 'solid' | 'outline' | 'text' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'largePcDefault';
export type ButtonType = 'button' | 'submit' | 'reset';
export type ButtonIntent = 'default' | 'cancel' | 'delete';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-block',
  },
})
export class ButtonComponent {
  // Inputs
  readonly variant = input<ButtonVariant>('solid');
  readonly size = input<ButtonSize>('md');
  readonly type = input<ButtonType>('button');
  readonly intent = input<ButtonIntent>('default');
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly iconPosition = input<'left' | 'right'>('right');
  readonly fullWidth = input<boolean>(false);
  readonly heightPx = input<number | undefined>(undefined);
  readonly classProps = input<string | undefined>('');

  // Outputs
  readonly buttonClick = output<MouseEvent>();

  /** Tailwind utility classes for the native button (replaces former SCSS). */
  readonly buttonClass = computed(() => {
    const base =
      'relative inline-flex justify-center items-center gap-1 rounded-full border border-solid font-sans font-medium leading-[1.4] whitespace-nowrap no-underline transition-all duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

    const size = this.size();

    const classProps = this.classProps();

    const sizeClasses =
      size === 'sm'
        ? 'h-8 px-3 py-1.5 text-[13px]'
        : size === 'md'
          ? 'h-10 px-4 py-2 text-base'
          : size === 'largePcDefault'
            ? 'h-[54px] px-8 text-btn-large md:min-w-16 md:h-9 md:px-3'
            : 'h-[54px] px-8 text-btn-large';

    const cursorClass = this.loading()
      ? 'cursor-wait'
      : this.disabled()
        ? 'cursor-not-allowed!'
        : 'cursor-pointer';

    const widthClass = this.fullWidth() ? 'w-full' : '';

    if (this.disabled()) {
      return [
        base,
        sizeClasses,
        cursorClass,
        widthClass,
        'bg-text-disabled text-white text-slate-300 border border-border-weak',
      ]
        .filter(Boolean)
        .join(' ');
    }

    const variant = this.variant();
    const intent = this.intent();
    const variantClasses = this.getVariantClasses(variant, intent);

    return [classProps, base, sizeClasses, cursorClass, widthClass, variantClasses]
      .filter(Boolean)
      .join(' ');
  });

  private getVariantClasses(variant: ButtonVariant, intent: ButtonIntent): string {
    if (variant === 'solid') {
      if (intent === 'cancel') {
        return 'bg-bg-button-gray border-bg-button-gray text-text-medium hover:bg-bg-button-gray-hover hover:border-bg-button-gray-hover active:bg-border-strong active:border-border-strong';
      }
      if (intent === 'delete') {
        return 'bg-status-error border-status-error text-white hover:bg-[color-mix(in_srgb,var(--color-status-error)_90%,black)] hover:border-[color-mix(in_srgb,var(--color-status-error)_90%,black)] active:bg-[color-mix(in_srgb,var(--color-status-error)_80%,black)] focus-visible:outline-status-error';
      }
      return 'bg-brand-primary border-brand-primary text-surface-white hover:opacity-90';
    }

    if (variant === 'outline') {
      if (intent === 'cancel') {
        return 'bg-surface-white border-border-strong text-text-medium hover:bg-bg-secondary active:bg-border-strong/20';
      }
      if (intent === 'delete') {
        return 'bg-surface-white border-status-error text-status-error hover:bg-bg-error active:bg-bg-error';
      }
      return 'bg-bg-primary border-border-brand text-brand-primary hover:bg-bg-brand-weak hover:border-brand-secondary hover:text-brand-secondary active:bg-bg-brand-weak/80 disabled:border-border-weak disabled:text-text-disabled';
    }

    if (variant === 'danger') {
      return 'bg-status-error border-status-error text-white hover:bg-[color-mix(in_srgb,var(--color-status-error)_90%,black)] hover:border-[color-mix(in_srgb,var(--color-status-error)_90%,black)] active:bg-[color-mix(in_srgb,var(--color-status-error)_80%,black)] focus-visible:outline-status-error';
    }

    // text variant
    if (intent === 'cancel') {
      return 'border-transparent bg-transparent text-text-medium hover:bg-bg-secondary active:bg-border-strong/20';
    }
    if (intent === 'delete') {
      return 'border-transparent bg-transparent text-status-error hover:bg-bg-error active:bg-bg-error';
    }
    return 'border-transparent bg-transparent text-primary hover:bg-primary/5 active:bg-[rgba(41,115,143,0.1)]';
  }

  onClick(event: MouseEvent): void {
    if (!this.disabled() && !this.loading()) {
      this.buttonClick.emit(event);
    }
  }
}
