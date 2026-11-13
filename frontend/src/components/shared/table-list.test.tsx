import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableList, TableListItem } from './table-list';

describe('TableList / TableListItem', () => {
  test('ヘッダー行とデータ行をクラスで区別し、中身と操作を所定の場所に置くこと', () => {
    const { container } = render(
      <TableList>
        <TableListItem isHeader>見出し</TableListItem>
        <TableListItem actions={<button type="button">編集</button>} dataTestid="row-1">
          行1
        </TableListItem>
      </TableList>,
    );
    expect(container.firstElementChild).toHaveClass('table-list');
    expect(container.querySelector('.table-list-row--header')).toHaveTextContent('見出し');
    const row = screen.getByTestId('row-1');
    expect(row).toHaveClass('table-list-row', 'table-list-row--data');
    expect(row.querySelector('.table-list-row-content')).toHaveTextContent('行1');
    expect(row.querySelector('.table-list-actions')).toHaveTextContent('編集');
  });

  test('hasActions が false なら操作欄を出さないこと', () => {
    render(
      <TableListItem hasActions={false} dataTestid="row">
        行
      </TableListItem>,
    );
    expect(screen.getByTestId('row').querySelector('.table-list-actions')).toBeNull();
  });

  test('チェックボックス付きのデータ行は行クリックでも選択を切り替えること', async () => {
    const onCheckedChange = vi.fn();
    render(
      <TableListItem showCheckbox checked={false} onCheckedChange={onCheckedChange}>
        行
      </TableListItem>,
    );
    await userEvent.click(screen.getByText('行'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  test('ヘッダー行は行クリックで選択を切り替えないこと', async () => {
    const onCheckedChange = vi.fn();
    render(
      <TableListItem isHeader showCheckbox onCheckedChange={onCheckedChange}>
        見出し
      </TableListItem>,
    );
    await userEvent.click(screen.getByText('見出し'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
