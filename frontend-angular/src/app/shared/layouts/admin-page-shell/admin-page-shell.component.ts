import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { TabItem } from '@app-types/tab.type';

/**
 * Common admin page shell — mirrors the Astro `#layout-main → header →
 * .term-main` structure (see `lime0422/src/pages/history-chat.astro`).
 *
 * Slots:
 *   - default — main page content rendered inside `<main class="term-main md:pb-0">`
 *   - `[shellHeader]` — replace the default `<app-page-header>` if a page needs a
 *     fully custom header
 *
 * Inputs forward to the default `<app-page-header>` so most pages just set
 * `titleKey` and project content.
 */
@Component({
  selector: 'app-admin-page-shell',
  standalone: true,
  imports: [CommonModule, TranslateModule, PageHeaderComponent],
  templateUrl: './admin-page-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full' },
})
export class AdminPageShellComponent {
  readonly title = input<string>('');
  readonly titleKey = input<string>();
  readonly showSidebarToggle = input<boolean>(true);
  readonly showActions = input<boolean>(false);
  readonly showLanguageToggle = input<boolean>(true);
  readonly tabs = input<TabItem[] | undefined>();
  readonly activeTabId = input<string | undefined>('');
  readonly tabChange = output<TabItem>();
  readonly editClick = output<void>();
  readonly showTitleEdit = input<boolean>(false);
  /**
   * Whether to show the mobile back button. Defaults to `false` to match the
   * Astro `admin-page` variant — top-level admin pages omit it. Sub-screens
   * (e.g. team detail, learning-data detail) can opt-in.
   */
  readonly showBackButton = input<boolean>(false);
  /** Set true to render only the projected `[shellHeader]` content (no default page-header). */
  readonly customHeader = input<boolean>(false);
  /** Extra CSS classes applied to the `<main>` element. */
  readonly mainClass = input<string>('');
}
