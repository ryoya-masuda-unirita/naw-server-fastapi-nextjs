import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import type { TabItem } from '@app-types/tab.type';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-tab',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatIconModule, RouterModule],
  templateUrl: './tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full',
  },
})
export class TabComponent implements OnInit {
  // Inputs
  readonly tabs = input.required<TabItem[]>();
  readonly activeTabId = input<string>('');
  readonly variant = input<'default' | 'underline' | 'pills'>('default');
  readonly fullWidth = input<boolean>(false);
  readonly containerClass = input<string>('');

  // Outputs
  readonly tabChange = output<TabItem>();

  // Internal state
  private readonly _activeId = signal<string>('');

  // Computed
  readonly currentActiveId = computed(() => {
    return this.activeTabId() || this._activeId();
  });

  readonly tabClasses = computed(() => {
    const fullWidth = this.fullWidth();

    const baseClasses = 'flex px-2 md:px-6';
    const widthClass = fullWidth ? 'w-full' : '';

    return `${baseClasses} ${widthClass} ${this.containerClass()}`;
  });

  ngOnInit() {
    // Set first tab as active if no active tab is provided
    const tabs = this.tabs();
    if (!this.activeTabId() && tabs.length > 0 && !tabs[0].disabled) {
      this._activeId.set(tabs[0].id);
    } else if (this.activeTabId()) {
      this._activeId.set(this.activeTabId());
    }
  }

  onTabClick(tab: TabItem): void {
    if (tab.disabled) {
      return;
    }

    this._activeId.set(tab.id);
    this.tabChange.emit(tab);
  }

  isActive(tabId: string): boolean {
    return this.currentActiveId() === tabId;
  }

  getTabItemClasses(tab: TabItem): string {
    const isActive = this.isActive(tab.id);
    const fullWidth = this.fullWidth();

    // Base classes
    let classes =
      'p-3 md:px-6 md:py-4 text-label-x-large text-text-medium block relative font-medium';

    // Disabled state
    if (tab.disabled) {
      classes += ' opacity-40 cursor-not-allowed';
    }

    // Width
    if (fullWidth) {
      classes += ' flex-1 justify-center';
    }

    // Active/Inactive state
    if (isActive) {
      classes += ' text-brand-primary! ';
    }

    return classes;
  }
}
