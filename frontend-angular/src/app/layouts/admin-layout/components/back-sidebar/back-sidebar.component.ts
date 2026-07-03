import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import { UiStore } from '@core/stores/ui.store';

@Component({
  selector: 'app-back-sidebar',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule],
  templateUrl: './back-sidebar.component.html',
})
export class BackSidebarComponent {
  readonly uiStore = inject(UiStore);

  readonly goToBack = output<void>();

  onGoToBack(): void {
    this.goToBack.emit();
  }
}
