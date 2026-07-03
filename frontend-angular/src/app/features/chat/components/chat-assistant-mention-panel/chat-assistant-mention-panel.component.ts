import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Assistant } from '@app-types/chat/assistant.type';

@Component({
  selector: 'app-chat-assistant-mention-panel',
  standalone: true,
  imports: [NgClass, TranslateModule],
  templateUrl: './chat-assistant-mention-panel.component.html',
  styleUrl: './chat-assistant-mention-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block absolute left-0 right-0 bottom-full mb-1 z-100',
  },
})
export class ChatAssistantMentionPanelComponent {
  readonly assistants = input.required<Assistant[]>();
  readonly activeIndex = input<number>(0);
  readonly isEmpty = input<boolean>(false);
  readonly selectedAssistantId = input<string | null>(null);

  readonly select = output<Assistant>();
  readonly hoverIndex = output<number>();

  onSelect(assistant: Assistant): void {
    this.select.emit(assistant);
  }

  onHover(index: number): void {
    this.hoverIndex.emit(index);
  }
}
