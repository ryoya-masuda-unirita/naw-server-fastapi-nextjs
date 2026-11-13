import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { cx } from './class-names';
import { getVisiblePages } from './pagination-utils';
import { SvgIcon } from './icons/svg-icon';

interface PaginationProps {
  totalPages: number;
  maxVisiblePages?: number;
  pageSizeOptions?: number[];
  showPageSize?: boolean;
  showPageSizeLabel?: boolean;
  showPageNumbers?: boolean;
  showFirstLast?: boolean;
  /** 件数表示（例: '1-10 / 120'） */
  countDisplay?: string;
  /** true（既定）ならページ・件数を URL のクエリパラメータで持つ */
  useQueryParams?: boolean;
  /** useQueryParams=false のときの現在ページ（1 始まり） */
  currentPageOverride?: number | null;
  /** useQueryParams=false のときの件数 */
  pageSizeOverride?: number | null;
  pageParamName?: string;
  pageSizeParamName?: string;
  defaultPageSize?: number;
  className?: string;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const NAV_BUTTON_CLASS =
  'flex items-center justify-center w-7 h-7 text-text-medium rounded-full border border-border-weak bg-white cursor-pointer hover:bg-bg-brand-weak disabled:opacity-30 disabled:cursor-not-allowed';

/** 移植元 `<app-pagination>`（shared/components/pagination） */
export function Pagination({
  totalPages,
  maxVisiblePages = 5,
  pageSizeOptions = [10, 20, 50],
  showPageSize = true,
  showPageSizeLabel = true,
  showPageNumbers = true,
  showFirstLast = true,
  countDisplay = '',
  useQueryParams = true,
  currentPageOverride = null,
  pageSizeOverride = null,
  pageParamName = 'page',
  pageSizeParamName = 'pageSize',
  defaultPageSize = 10,
  className,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  let currentPage: number;
  let pageSize: number;
  if (useQueryParams) {
    const page = parseInt(searchParams.get(pageParamName) ?? '', 10);
    currentPage = isNaN(page) || page < 1 ? 1 : page;
    const size = parseInt(searchParams.get(pageSizeParamName) ?? '', 10);
    pageSize = isNaN(size) ? defaultPageSize : size;
  } else {
    currentPage = currentPageOverride && currentPageOverride > 0 ? currentPageOverride : 1;
    pageSize = pageSizeOverride && pageSizeOverride > 0 ? pageSizeOverride : defaultPageSize;
  }

  const visiblePages = getVisiblePages(currentPage, totalPages, maxVisiblePages);
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  // 移植元の queryParamsHandling: 'merge' と同じく、他のクエリパラメータは残す
  const mergeParams = (values: Record<string, number>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(values)) next.set(key, String(value));
      return next;
    });
  };

  const navigateToPage = (page: number) => {
    if (useQueryParams) mergeParams({ [pageParamName]: page });
    onPageChange?.(page);
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const size = parseInt(event.target.value, 10);
    // 件数を変えたら 1 ページ目に戻す
    if (useQueryParams) mergeParams({ [pageSizeParamName]: size, [pageParamName]: 1 });
    onPageSizeChange?.(size);
  };

  return (
    <div className={cx('app-pagination flex items-center gap-1', className)}>
      {showPageSize && (
        <div className="relative md:flex hidden items-center gap-2 mr-3">
          {showPageSizeLabel && (
            <label
              htmlFor="page-size-select"
              className="absolute -top-6.5 left-0 text-sm font-medium text-text-muted"
            >
              {t('COMMON.PAGE_SIZE_LABEL')}
            </label>
          )}
          <div className="relative flex items-center">
            <select
              id="page-size-select"
              className="appearance-none w-24 px-4 py-2 pr-9 text-sm font-medium text-text-default bg-white border border-border rounded-lg cursor-pointer min-w-20 min-h-12 hover:border-text-default focus:outline-none focus:border-primary"
              value={pageSize}
              onChange={handlePageSizeChange}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-2 pointer-events-none text-text-muted"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M5.83333 7.91667L10 12.0833L14.1667 7.91667"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      )}

      {countDisplay && (
        <span className="text-label font-medium text-text-medium whitespace-nowrap mr-2">{countDisplay}</span>
      )}

      <div className="flex items-center gap-1 mr-2">
        {showFirstLast && (
          <button
            type="button"
            className={NAV_BUTTON_CLASS}
            disabled={!canGoPrev}
            onClick={() => canGoPrev && navigateToPage(1)}
            aria-label="First page"
          >
            <SvgIcon name="firstPage" className="w-5 h-5 text-text-weak" />
          </button>
        )}
        <button
          type="button"
          className={NAV_BUTTON_CLASS}
          disabled={!canGoPrev}
          onClick={() => canGoPrev && navigateToPage(currentPage - 1)}
          aria-label="Previous page"
        >
          <SvgIcon name="arrowLeft" className="w-5 h-5 text-text-weak" />
        </button>
      </div>

      {showPageNumbers && (
        <div className="flex items-center gap-1 mr-2">
          {visiblePages.map((page, index) =>
            typeof page === 'number' ? (
              <button
                key={index}
                type="button"
                className={cx(
                  'h-7 w-7 cursor-pointer border border-border-weak text-label-large font-(--text-label-large--font-weight) rounded-full flex justify-center items-center',
                  page === currentPage
                    ? 'pointer-events-none bg-bg-brand-weak text-brand-secondary!'
                    : 'text-text-medium',
                )}
                onClick={() => page !== currentPage && navigateToPage(page)}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            ) : (
              <span
                key={index}
                className="flex justify-center items-center w-7 h-7 border border-border-weak rounded-full text-label-large text-text-medium font-medium"
              >
                {page}
              </span>
            ),
          )}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={NAV_BUTTON_CLASS}
          disabled={!canGoNext}
          onClick={() => canGoNext && navigateToPage(currentPage + 1)}
          aria-label="Next page"
        >
          <SvgIcon name="arrowRight" className="w-5 h-5 text-text-weak" />
        </button>
        {showFirstLast && (
          <button
            type="button"
            className={NAV_BUTTON_CLASS}
            disabled={!canGoNext}
            onClick={() => canGoNext && navigateToPage(totalPages)}
            aria-label="Last page"
          >
            <SvgIcon name="lastPage" className="w-5 h-5 text-text-weak" />
          </button>
        )}
      </div>
    </div>
  );
}
