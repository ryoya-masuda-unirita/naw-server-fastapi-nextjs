import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkOverlayOrigin, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { UiStore } from '@core/stores/ui.store';
import { SvgIconComponent } from '../icons/svg-icon.component';

/**
 * ContextMenuComponent - A reusable context menu with desktop dropdown and mobile drawer
 *
 * @example
 * // Use with default button trigger:
 * <app-context-menu [menuTpl]="menuTemplate" [triggerIcon]="'more_vert'" />
 *
 * @example
 * // Use with custom button trigger:
 * <ng-template #customButton>
 *   <button class="custom-btn">Open Menu</button>
 * </ng-template>
 * <app-context-menu [menuTpl]="menuTemplate" [customTrigger]="customButton" />
 *
 * @example
 * // Custom overlay positions (bottom-left):
 * <app-context-menu
 *   [menuTpl]="menuTemplate"
 *   [overlayPositions]="[
 *     { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 }
 *   ]"
 * />
 *
 * @example
 * // Trigger programmatically from parent component:
 * @ViewChild(ContextMenuComponent) menu!: ContextMenuComponent;
 * openMenu() {
 *   this.menu.toggle(new Event('click'));
 * }
 */
@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [CommonModule, OverlayModule, AppMatIconComponent, SvgIconComponent],
  templateUrl: './context-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ContextMenuComponent {
  @ViewChild('triggerOrigin', { static: false }) triggerOrigin!: CdkOverlayOrigin;

  /** Template for menu content */
  readonly menuTpl = input.required<TemplateRef<any>>();
  /** Optional custom trigger button template. If provided, will replace default trigger */
  readonly customTrigger = input<TemplateRef<any> | null>(null);
  /** Icon for default trigger button (only used when customTrigger is null) */
  readonly triggerIcon = input<string>();
  /** Minimum width CSS class for menu */
  readonly menuMinWidth = input<string>('min-w-60');
  /**
   * Custom panel class string applied to the menu container.
   * Default keeps current styling; pages can pass Astro-equivalent classes
   * like `dropdown-menu dropdown-menu--bordered w-70`.
   */
  readonly panelClass = input<string>(
    'bg-bg-primary flex flex-col gap-1 p-4 rounded-lg shadow-default text-xs font-medium',
  );
  /** Close menu when clicking inside the content (typical for action menus). */
  readonly closeOnContentClick = input<boolean>(true);
  /** Custom overlay positions. Default: bottom-right and top-right */
  readonly overlayPositions = input<ConnectedPosition[]>([
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
  ]);

  private readonly uiStore = inject(UiStore);
  readonly hasPaddingButton = input<boolean>(true);
  readonly isMobile = this.uiStore.isMobile;

  /** Controls DOM presence (slightly delayed on close for leave transition) */
  readonly isVisible = signal(false);
  /** Controls CSS open/closed state */
  readonly isOpen = signal(false);

  onContentClick(event: Event): void {
    event.stopPropagation();
    if (this.closeOnContentClick()) {
      this.close();
    }
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    this.isVisible.set(true);
    // Allow element to mount before triggering transition
    requestAnimationFrame(() => this.isOpen.set(true));
  }

  close(): void {
    this.isOpen.set(false);
    // Remove from DOM after transition completes (300ms max)
    setTimeout(() => this.isVisible.set(false), 300);
  }
}
