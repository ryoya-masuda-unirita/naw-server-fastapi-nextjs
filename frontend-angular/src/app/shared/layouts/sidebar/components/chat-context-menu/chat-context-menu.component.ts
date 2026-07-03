import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-chat-context-menu',
  standalone: true,
  imports: [MatIconModule, TranslateModule],
  templateUrl: './chat-context-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'contents',
  },
})
export class ChatContextMenuComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly desktopBreakpointPx = 768;
  private readonly menuEstimatedHeightPx = 124;
  private readonly triggerEstimatedHeightPx = 28;
  private readonly viewportMarginPx = 8;
  private readonly triggerGapPx = 4;
  private readonly onResize = () => this.checkViewport();

  readonly isOpen = input.required<boolean>();
  readonly chatMenuTopPx = input<number>(0);
  readonly visible = signal(false);
  readonly isDesktop = signal(false);
  readonly viewportHeight = signal(0);

  readonly hostClasses = computed(() => {
    const open = this.isOpen();
    const vis = this.visible();
    const desktop = this.isDesktop();
    return {
      'animate-slide-up': open && !desktop,
      'animate-slide-down': !open && vis && !desktop,
      hidden: !vis && !open,
    };
  });

  readonly sort = output<void>();
  readonly deleteSelected = output<void>();
  readonly closeMenu = output<void>();

  readonly menuTopPx = computed(() => {
    const belowTop = this.chatMenuTopPx();
    const aboveTop =
      belowTop - this.triggerEstimatedHeightPx - this.menuEstimatedHeightPx - this.triggerGapPx * 2;
    const hasRoomBelow =
      belowTop + this.menuEstimatedHeightPx <= this.viewportHeight() - this.viewportMarginPx;
    const preferredTop = hasRoomBelow ? belowTop : aboveTop;
    return Math.max(preferredTop, this.viewportMarginPx);
  });

  readonly desktopMaxHeightPx = computed(() =>
    Math.max(0, this.viewportHeight() - this.viewportMarginPx * 2),
  );

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.checkViewport();
      window.addEventListener('resize', this.onResize);
      this.destroyRef.onDestroy(() => window.removeEventListener('resize', this.onResize));
    }

    effect(() => {
      if (this.isOpen()) {
        this.visible.set(true);
      } else if (this.isDesktop()) {
        this.visible.set(false);
      }
      // Mobile: visible stays true until animationend fires
    });
  }

  private checkViewport(): void {
    this.isDesktop.set(window.innerWidth >= this.desktopBreakpointPx);
    this.viewportHeight.set(window.innerHeight);
  }

  onAnimationEnd(): void {
    if (!this.isOpen()) {
      this.visible.set(false);
    }
  }

  onSort(): void {
    this.sort.emit();
  }

  onDeleteSelected(): void {
    this.deleteSelected.emit();
  }
}
