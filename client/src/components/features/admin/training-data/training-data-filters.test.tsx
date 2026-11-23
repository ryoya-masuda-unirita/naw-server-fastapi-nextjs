import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { TrainingDataFilters } from './training-data-filters';

const SORT_TESTID_PREFIX = 'training-data-file-sort';

function renderFilters() {
  return render(
    <MemoryRouter>
      <TrainingDataFilters
        query=""
        periodOptions={[]}
        selectedPeriod={null}
        filterPeriodRange={null}
        countDisplay="1-10 / 25"
        totalPages={3}
        currentPage={1}
        onSearchQuery={vi.fn()}
        onPeriodChange={vi.fn()}
        onPageChange={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('TrainingDataFilters', () => {
  test('does not render a sort input', () => {
    /** 並べ替えの操作を出さない（NAW-1427。効かない操作を利用者に見せない） */
    const { container } = renderFilters();

    expect(container.querySelector(`[data-testid^="${SORT_TESTID_PREFIX}"]`)).toBeNull();
    expect(screen.queryByText(/SORT_LABEL|並べ替え/)).toBeNull();
  });

  test('does not render a user filter', () => {
    /** 更新者の絞り込みを出さない（NAW-1424。ローカルでは効かず、選択肢のために全ユーザーを取っていた） */
    const { container } = renderFilters();

    expect(container.querySelector('[data-testid^="training-data-file-user"]')).toBeNull();
    expect(screen.queryByText(/ALL_USERS|全てのユーザー/)).toBeNull();
  });

  test('keeps the search input and the pagination', () => {
    /** 並べ替えを外しても、検索とページ送りは残る */
    renderFilters();

    expect(screen.getByTestId('training-data-file-search-input')).toBeDefined();
    expect(screen.getByText('1-10 / 25')).toBeDefined();
  });
});
