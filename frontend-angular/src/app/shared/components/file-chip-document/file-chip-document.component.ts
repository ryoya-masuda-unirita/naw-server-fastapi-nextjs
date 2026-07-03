import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-file-chip-document',
  standalone: true,
  templateUrl: './file-chip-document.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'file-chip file-chip--document' },
})
export class FileChipDocumentComponent {
  readonly name = input.required<string>();
  readonly ext = computed(() => this.name().split('.').pop()?.toUpperCase() ?? 'FILE');
}
