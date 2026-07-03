import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-optional-label',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './optional-label.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
})
export class OptionalLabelComponent {}
