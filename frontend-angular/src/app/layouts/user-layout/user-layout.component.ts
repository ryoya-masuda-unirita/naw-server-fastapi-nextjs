import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SidebarComponent } from '@app/shared/layouts/sidebar/sidebar.component';
import { USER_LAYOUT_CONFIG } from '@shared/layouts/layout.config';

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [SidebarComponent],
  template: `<app-sidebar [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserLayoutComponent {
  readonly config = USER_LAYOUT_CONFIG;
}
