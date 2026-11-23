import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Pagination } from './pagination';
import { getVisiblePages } from './pagination-utils';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

function renderWithRouter(ui: React.ReactElement, initialEntry = '/admin/users') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      {ui}
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('getVisiblePages', () => {
  test('総ページ数が表示数以下なら全ページを返すこと', () => {
    expect(getVisiblePages(1, 4, 5)).toEqual([1, 2, 3, 4]);
  });

  test('先頭付近・中央・末尾付近で省略記号の位置が変わること', () => {
    expect(getVisiblePages(1, 10, 5)).toEqual([1, 2, 3, 4, '…', 10]);
    expect(getVisiblePages(5, 10, 5)).toEqual([1, '…', 4, 5, 6, '…', 10]);
    expect(getVisiblePages(10, 10, 5)).toEqual([1, '…', 7, 8, 9, 10]);
  });
});

describe('Pagination', () => {
  describe('クエリパラメータで持つ場合', () => {
    test('URL の page を現在ページとして表示すること', () => {
      renderWithRouter(<Pagination totalPages={3} />, '/admin/users?page=2');
      expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('button', { name: '2' })).toHaveClass('bg-bg-brand-weak', 'h-7', 'w-7');
    });

    test('ページを押すと他のパラメータを残したまま page を更新すること', async () => {
      const onPageChange = vi.fn();
      renderWithRouter(<Pagination totalPages={3} onPageChange={onPageChange} />, '/admin/users?q=abc');
      await userEvent.click(screen.getByRole('button', { name: '3' }));
      expect(onPageChange).toHaveBeenCalledWith(3);
      expect(screen.getByTestId('search')).toHaveTextContent('?q=abc&page=3');
    });

    test('件数を変えると 1 ページ目に戻すこと', async () => {
      const onPageSizeChange = vi.fn();
      renderWithRouter(<Pagination totalPages={3} onPageSizeChange={onPageSizeChange} />, '/admin/users?page=3');
      await userEvent.selectOptions(screen.getByLabelText('COMMON.PAGE_SIZE_LABEL'), '20');
      expect(onPageSizeChange).toHaveBeenCalledWith(20);
      expect(screen.getByTestId('search')).toHaveTextContent('?page=1&pageSize=20');
    });
  });

  describe('クエリパラメータを使わない場合', () => {
    test('currentPageOverride を現在ページにし、URL は変えないこと', async () => {
      const onPageChange = vi.fn();
      renderWithRouter(
        <Pagination totalPages={5} useQueryParams={false} currentPageOverride={2} onPageChange={onPageChange} />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
      expect(onPageChange).toHaveBeenCalledWith(3);
      expect(screen.getByTestId('search')).toBeEmptyDOMElement();
    });

    test('先頭ページでは前へ・最初へが押せず、最後のページでは次へ・最後へが押せないこと', () => {
      const { rerender } = renderWithRouter(
        <Pagination totalPages={5} useQueryParams={false} currentPageOverride={1} />,
      );
      expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
      rerender(
        <MemoryRouter>
          <Pagination totalPages={5} useQueryParams={false} currentPageOverride={5} />
        </MemoryRouter>,
      );
      expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    });
  });

  test('件数表示と表示切り替えの props が効くこと', () => {
    renderWithRouter(
      <Pagination totalPages={3} countDisplay="1-10 / 25" showPageSize={false} showFirstLast={false} />,
    );
    expect(screen.getByText('1-10 / 25')).toBeInTheDocument();
    expect(screen.queryByLabelText('COMMON.PAGE_SIZE_LABEL')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'First page' })).not.toBeInTheDocument();
  });
});
