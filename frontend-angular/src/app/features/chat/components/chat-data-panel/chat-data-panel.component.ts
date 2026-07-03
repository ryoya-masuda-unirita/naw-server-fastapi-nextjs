import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DropdownService } from '@core/services/dropdown.service';
import { TranslateModule } from '@ngx-translate/core';
import { ChatSummaryComponent } from '@shared/components/features/chat/chat-summary/chat-summary.component';
import { ViewerService } from '@features/chat/services/viewer.service';

export const VIEWER_WIDTH_EXPANDED = 400;
export const VIEWER_WIDTH_COLLAPSED = 52;
export const VIEWER_WIDTH_MIN = 280;
export const VIEWER_WIDTH_MAX = 1018;

@Component({
  selector: 'app-chat-data-panel',
  standalone: true,
  imports: [TranslateModule, ChatSummaryComponent],
  templateUrl: './chat-data-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'hidden md:flex flex-col shrink-0 relative bg-white border-l border-t border-b border-border-weak rounded-tl-2xl rounded-bl-2xl duration-300 h-screen',
    '[style.box-shadow]': '"var(--shadow-viewer)"',
    'aria-label': 'ビューワー',
    role: 'complementary',
  },
})
export class ChatDataPanelComponent {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly dropdownService = inject(DropdownService);
  private readonly viewerService = inject(ViewerService);

  readonly roomId = input<string | null>(null);
  readonly isReadOnly = input<boolean>(false);

  readonly isCollapsed = signal<boolean>(false);
  readonly panelWidth = signal<number>(VIEWER_WIDTH_EXPANDED);
  readonly VIEWER_WIDTH_COLLAPSED = VIEWER_WIDTH_COLLAPSED;
  readonly headerOptions = computed(() => this.viewerService.viewers());

  private resizeStartX = 0;
  private resizeStartWidth = 0;

  readonly collapseChange = output<boolean>();
  readonly openNewTab = output<void>();
  readonly saveLibrary = output<void>();
  readonly savePdf = output<void>();

  constructor() {
    effect(() => {
      this.el.nativeElement.style.width = this.isCollapsed()
        ? `${VIEWER_WIDTH_COLLAPSED}px`
        : `${this.panelWidth()}px`;
    });

    effect(() => {
      const roomId = this.roomId();
      if (roomId) {
        // untracked 必須: loadList の同期部分が読む isLibraryStreaming 等を
        // この effect の依存として追跡させない（ストリーム終了のたびに再実行されてしまう）
        untracked(() => void this.viewerService.loadList(roomId));
      }
    });
  }

  onCollapseChange(collapsed: boolean): void {
    this.isCollapsed.set(collapsed);
    this.collapseChange.emit(collapsed);
  }

  startResize(event: MouseEvent): void {
    event.preventDefault();
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.el.nativeElement.getBoundingClientRect().width;
    this.el.nativeElement.classList.add('!transition-none');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      const dx = this.resizeStartX - e.clientX;
      const newWidth = Math.min(
        VIEWER_WIDTH_MAX,
        Math.max(VIEWER_WIDTH_MIN, this.resizeStartWidth + dx),
      );
      this.panelWidth.set(newWidth);
    };

    const onMouseUp = () => {
      this.el.nativeElement.classList.remove('!transition-none');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
}
