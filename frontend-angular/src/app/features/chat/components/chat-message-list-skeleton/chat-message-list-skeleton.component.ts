import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SkeletonComponent } from '@shared/components/skeleton/skeleton.component';

@Component({
  selector: 'app-chat-message-list-skeleton',
  standalone: true,
  imports: [SkeletonComponent],
  templateUrl: './chat-message-list-skeleton.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'display: contents',
  },
})
export class ChatMessageListSkeletonComponent {}
