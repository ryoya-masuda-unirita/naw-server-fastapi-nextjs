import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { SelectWithSearchComponent } from '@shared/components/select-with-search/select.component';
import { PeriodFilterComponent } from '@shared/components/filter/period-filter/period-filter.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { FormSortInputComponent } from '@shared/components/form/form-sort-input/form-sort-input.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';

@Component({
  selector: 'app-training-data-filters',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SearchInputComponent,
    SelectWithSearchComponent,
    PeriodFilterComponent,
    SelectComponent,
    FormSortInputComponent,
    PaginationComponent,
  ],
  templateUrl: './training-data-filters.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class TrainingDataFiltersComponent {
  readonly query = input.required<string>();
  readonly userOptions = input.required<any[]>();
  readonly selectedUser = input.required<string | null>();
  readonly periodOptions = input.required<any[]>();
  readonly selectedPeriod = input.required<string | null>();
  readonly filterPeriodRange = input.required<any>();
  readonly statusOptions = input.required<any[]>();
  readonly selectedStatus = input.required<string | null>();
  readonly sortOptions = input.required<any[]>();

  readonly sortField = input.required<string | null>();
  readonly sortOrder = input.required<string | null>();

  readonly countDisplay = input.required<string>();
  readonly totalPages = input.required<number>();
  readonly currentPage = input.required<number>();

  readonly searchQuery = output<string>();
  readonly userChange = output<string | null>();
  readonly periodChange = output<any>();
  readonly statusChange = output<string | null>();
  readonly sortFieldChange = output<string | null>();
  readonly sortOrderChange = output<string | null>();
  readonly pageChange = output<number>();
}
