/**
 * Pagination Component - Reusable pagination control
 * Following Figma design specifications
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, TranslateModule, SvgIconComponent],
  templateUrl: './pagination.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex items-center gap-1',
  },
})
export class PaginationComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Inputs
  readonly totalPages = input.required<number>();
  readonly maxVisiblePages = input<number>(5);
  readonly pageSizeOptions = input<number[]>([10, 20, 50]);
  readonly showPageSize = input<boolean>(true);
  readonly showPageSizeLabel = input<boolean>(true); // Control if label is shown
  readonly showPageNumbers = input<boolean>(true);
  readonly showFirstLast = input<boolean>(true);
  readonly countDisplay = input<string>('');
  readonly useQueryParams = input<boolean>(true);
  readonly currentPageOverride = input<number | null>(null);
  readonly pageSizeOverride = input<number | null>(null);
  readonly pageParamName = input<string>('page');
  readonly pageSizeParamName = input<string>('pageSize');
  readonly defaultPageSize = input<number>(10);

  // Outputs
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  // Query params signal
  private readonly queryParams = toSignal(this.route.queryParams, { initialValue: {} as Params });

  // Current page from query params or default
  readonly currentPage = computed(() => {
    if (this.useQueryParams()) {
      const params = this.queryParams();
      const page = parseInt(params[this.pageParamName()] as string, 10);
      return isNaN(page) || page < 1 ? 1 : page;
    }

    const override = this.currentPageOverride();
    return override && override > 0 ? override : 1;
  });

  // Page size from query params or default
  readonly pageSize = computed(() => {
    if (this.useQueryParams()) {
      const params = this.queryParams();
      const size = parseInt(params[this.pageSizeParamName()] as string, 10);
      return isNaN(size) ? this.defaultPageSize() : size;
    }

    const override = this.pageSizeOverride();
    return override && override > 0 ? override : this.defaultPageSize();
  });

  // Computed: Generate visible page numbers
  readonly visiblePages = computed(() => {
    const current = this.currentPage();
    const total = this.totalPages();
    const maxVisible = this.maxVisiblePages();

    if (total <= maxVisible) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];
    const half = Math.floor(maxVisible / 2);

    // Always show first page
    pages.push(1);

    // Calculate start and end of visible range
    let start = Math.max(2, current - half + 1);
    let end = Math.min(total - 1, current + half - 1);

    // Adjust if near the beginning
    if (current <= half + 1) {
      end = maxVisible - 1;
    }

    // Adjust if near the end
    if (current >= total - half) {
      start = total - maxVisible + 2;
    }

    // Add ellipsis before if needed
    if (start > 2) {
      pages.push('…');
    }

    // Add middle pages
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    // Add ellipsis after if needed
    if (end < total - 1) {
      pages.push('…');
    }

    // Always show last page
    if (total > 1) {
      pages.push(total);
    }

    return pages;
  });

  // Computed: Check if can go to previous/next
  readonly canGoPrev = computed(() => this.currentPage() > 1);
  readonly canGoNext = computed(() => this.currentPage() < this.totalPages());

  // Methods
  goToFirstPage(): void {
    if (this.canGoPrev()) {
      this.navigateToPage(1);
    }
  }

  goToPrevPage(): void {
    if (this.canGoPrev()) {
      this.navigateToPage(this.currentPage() - 1);
    }
  }

  goToNextPage(): void {
    if (this.canGoNext()) {
      this.navigateToPage(this.currentPage() + 1);
    }
  }

  goToLastPage(): void {
    if (this.canGoNext()) {
      this.navigateToPage(this.totalPages());
    }
  }

  goToPage(page: number | string): void {
    if (typeof page === 'number' && page !== this.currentPage()) {
      this.navigateToPage(page);
    }
  }

  isNumber(value: number | string): value is number {
    return typeof value === 'number';
  }

  onPageSizeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newSize = parseInt(select.value, 10);
    this.navigateToPageSize(newSize);
  }

  private navigateToPage(page: number): void {
    if (this.useQueryParams()) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { [this.pageParamName()]: page },
        queryParamsHandling: 'merge',
      });
    }
    this.pageChange.emit(page);
  }

  private navigateToPageSize(size: number): void {
    if (this.useQueryParams()) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          [this.pageSizeParamName()]: size,
          [this.pageParamName()]: 1, // Reset to page 1 when changing page size
        },
        queryParamsHandling: 'merge',
      });
    }
    this.pageSizeChange.emit(size);
  }
}
