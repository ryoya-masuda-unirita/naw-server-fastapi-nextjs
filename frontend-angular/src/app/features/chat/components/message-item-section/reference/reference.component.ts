import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReferenceFilePaths } from '@app-types/chat/message.type';

@Component({
  selector: 'app-reference',
  standalone: true,
  imports: [],
  templateUrl: './reference.component.html',
  styleUrl: './reference.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class ReferenceComponent {
  readonly referenceFilePaths = input.required<ReferenceFilePaths[]>();
}
