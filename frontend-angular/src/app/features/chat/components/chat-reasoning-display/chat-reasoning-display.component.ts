import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  viewChildren,
} from '@angular/core';
import { MessageReasoning } from '@app-types/chat/message.type';

@Component({
  selector: 'app-chat-reasoning-display',
  standalone: true,
  templateUrl: './chat-reasoning-display.component.html',
  styleUrl: './chat-reasoning-display.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full max-w-full min-w-0 mb-1',
  },
})
export class ChatReasoningDisplayComponent {
  private readonly injector = inject(Injector);

  readonly reasoning = input.required<MessageReasoning>();

  private readonly detailScrollContainers =
    viewChildren<ElementRef<HTMLElement>>('detailScrollContainer');

  constructor() {
    effect(() => {
      const sections = this.reasoning().sections;
      const lastDetail = sections.at(-1)?.detail;
      if (!lastDetail) {
        return;
      }

      afterNextRender(
        () => {
          requestAnimationFrame(() => {
            const lastContainer = this.detailScrollContainers().at(-1)?.nativeElement;
            this.scrollToBottom(lastContainer);
          });
        },
        { injector: this.injector },
      );
    });
  }

  private scrollToBottom(container: HTMLElement | undefined): void {
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }
}
