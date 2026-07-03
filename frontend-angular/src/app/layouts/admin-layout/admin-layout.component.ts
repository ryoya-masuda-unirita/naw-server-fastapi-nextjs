import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SidebarComponent } from '@app/shared/layouts/sidebar/sidebar.component';
import { ADMIN_LAYOUT_CONFIG } from '@shared/layouts/layout.config';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [SidebarComponent],
  template: `<app-sidebar [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {
  readonly config = ADMIN_LAYOUT_CONFIG;
}
