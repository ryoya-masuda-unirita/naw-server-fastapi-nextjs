import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DropdownService } from '@core/services/dropdown.service';
import { Assistant } from '@app-types/chat/assistant.type';
import { NgClass } from '@angular/common';

type AssistantPanelStyle = {
  bottom: string;
  left: string;
  width: string;
  maxHeight: string;
};

@Component({
  selector: 'app-chat-assistant-selector',
  standalone: true,
  imports: [NgClass],
  templateUrl: './chat-assistant-selector.component.html',
  styleUrl: './chat-assistant-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex min-w-0 max-w-full justify-end items-center ml-auto relative [&>*]:min-w-0 [&>*]:max-w-full',
  },
})
export class ChatAssistantSelectorComponent {
  private readonly dropdownService = inject(DropdownService);

  private static readonly PANEL_WIDTH = 320;
  private static readonly PANEL_PAD = 8;
  private static readonly PANEL_MAX_HEIGHT = 320;
  private static readonly PANEL_MIN_HEIGHT = 120;

  readonly assistants = input.required<Assistant[]>();
  readonly selectedAssistant = input<Assistant | null>(null);
  readonly assistantSelect = output<Assistant>();

  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  readonly isAssistantOpen = signal<boolean>(false);
  readonly panelStyle = signal<AssistantPanelStyle>({
    bottom: '0px',
    left: '0px',
    width: `${ChatAssistantSelectorComponent.PANEL_WIDTH}px`,
    maxHeight: `${ChatAssistantSelectorComponent.PANEL_MAX_HEIGHT}px`,
  });

  toggleAssistantMenu(): void {
    if (this.isAssistantOpen()) {
      this.isAssistantOpen.set(false);
      this.dropdownService.notifyClosed();
      return;
    }

    this.updatePanelPosition();
    this.isAssistantOpen.set(true);
    this.dropdownService.open(() => this.closeAssistantMenu());
  }

  closeAssistantMenu(): void {
    this.isAssistantOpen.set(false);
  }

  selectAssistant(assistant: Assistant): void {
    this.assistantSelect.emit(assistant);
    this.isAssistantOpen.set(false);
    this.dropdownService.notifyClosed();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.isAssistantOpen()) {
      const target = event.target as HTMLElement;
      if (!target.closest('app-chat-assistant-selector')) {
        this.closeAssistantMenu();
      }
    }
  }

  private updatePanelPosition(): void {
    const button = this.trigger()?.nativeElement;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const panelWidth = Math.min(
      ChatAssistantSelectorComponent.PANEL_WIDTH,
      window.innerWidth - ChatAssistantSelectorComponent.PANEL_PAD * 2,
    );
    const maxHeight = Math.max(
      Math.min(
        rect.top - ChatAssistantSelectorComponent.PANEL_PAD,
        ChatAssistantSelectorComponent.PANEL_MAX_HEIGHT,
      ),
      ChatAssistantSelectorComponent.PANEL_MIN_HEIGHT,
    );

    this.panelStyle.set({
      bottom: `${window.innerHeight - rect.top + 4}px`,
      left: `${this.clampPanelLeft(rect.right - panelWidth, panelWidth)}px`,
      width: `${panelWidth}px`,
      maxHeight: `${maxHeight}px`,
    });
  }

  private clampPanelLeft(left: number, width: number): number {
    const pad = ChatAssistantSelectorComponent.PANEL_PAD;
    return Math.min(Math.max(pad, left), window.innerWidth - width - pad);
  }
}
