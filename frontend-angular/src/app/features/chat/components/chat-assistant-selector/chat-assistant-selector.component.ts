import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DropdownService } from '@core/services/dropdown.service';
import { Assistant } from '@app-types/chat/assistant.type';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-chat-assistant-selector',
  standalone: true,
  imports: [NgClass],
  templateUrl: './chat-assistant-selector.component.html',
  styleUrl: './chat-assistant-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-w-0 justify-end items-center ml-auto relative [&>*]:min-w-0 [&>*]:flex-1',
  },
})
export class ChatAssistantSelectorComponent {
  private readonly dropdownService = inject(DropdownService);

  readonly assistants = input.required<Assistant[]>();
  readonly selectedAssistant = input<Assistant | null>(null);
  readonly assistantSelect = output<Assistant>();

  readonly isAssistantOpen = signal<boolean>(false);

  toggleAssistantMenu(): void {
    if (this.isAssistantOpen()) {
      this.isAssistantOpen.set(false);
      this.dropdownService.notifyClosed();
      return;
    }
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
}
