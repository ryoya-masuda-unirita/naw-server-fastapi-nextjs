import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Template } from '../template-selector/template-selector.component';
import { MatIcon } from '@angular/material/icon';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-active-features-widget',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatIcon, SvgIconComponent],
  templateUrl: './active-features-widget.component.html',
  styleUrl: './active-features-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'contents',
  },
})
export class ActiveFeaturesWidgetComponent {
  private readonly platformId = inject(PLATFORM_ID);

  // ViewChild for button
  readonly multiPanelButton = viewChild<ElementRef<HTMLButtonElement>>('multiPanelButton');

  // Inputs
  readonly webSearchActive = input<boolean>(false);
  readonly templateActive = input<Template | null>(null);
  readonly createLibraryActive = input<boolean>(false);
  readonly activeCount = input<number>(0);

  // Outputs
  readonly clearWebSearch = output<void>();
  readonly clearTemplate = output<void>();
  readonly clearCreateLibrary = output<void>();
  readonly clearFeature = output<'web' | 'template' | 'library'>();

  // Internal state
  readonly isMultiPanelOpen = signal<boolean>(false);
  readonly panelStyle = signal<{ bottom: string; right: string } | null>(null);

  constructor() {
    // Update panel position when it opens
    effect(() => {
      if (this.isMultiPanelOpen() && isPlatformBrowser(this.platformId)) {
        this.updatePanelPosition();
      }
    });
  }

  private updatePanelPosition(): void {
    const button = this.multiPanelButton()?.nativeElement;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Position panel above the button
    this.panelStyle.set({
      bottom: `${viewportHeight - rect.top + 8}px`,
      right: `${window.innerWidth - rect.right}px`,
    });
  }

  onClearWebSearch(): void {
    this.clearWebSearch.emit();
  }

  onClearTemplate(): void {
    this.clearTemplate.emit();
  }

  onClearCreateLibrary(): void {
    this.clearCreateLibrary.emit();
  }

  onClearFeature(feature: 'web' | 'template' | 'library'): void {
    this.clearFeature.emit(feature);
  }

  toggleMultiPanel(): void {
    this.isMultiPanelOpen.update((v) => !v);
  }

  closeMultiPanel(): void {
    this.isMultiPanelOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.isMultiPanelOpen()) {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-chat-multi-wrap]')) {
        this.closeMultiPanel();
      }
    }
  }
}
