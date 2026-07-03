import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

export interface Template {
  value: string;
  label: string;
  desc: string;
  systemPrompt?: string;
}

@Component({
  selector: 'app-template-selector',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './template-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class TemplateSelectorComponent {
  // Inputs
  readonly templates = input.required<Template[]>();
  readonly activeTemplate = input<Template | null>(null);
  readonly showBackButton = input<boolean>(false);
  readonly showPreviewImage = input<boolean>(false);

  // Outputs
  readonly templateSelect = output<Template>();
  readonly back = output<void>();

  onSelectTemplate(tpl: Template): void {
    this.templateSelect.emit(tpl);
  }

  onBack(): void {
    this.back.emit();
  }
}
