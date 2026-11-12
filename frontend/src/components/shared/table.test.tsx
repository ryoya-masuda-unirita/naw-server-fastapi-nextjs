import { describe, test, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table } from './table';
import type { TableColumn } from './types';

interface Row {
  id: string;
  name: string;
  group: { name: string };
}

const FIXTURE_ROWS: Row[] = [
  { id: '1', name: '山田', group: { name: '営業' } },
  { id: '2', name: '佐藤', group: { name: '開発' } },
];

const FIXTURE_COLUMNS: TableColumn<Row>[] = [
  { field: 'name', header: 'ADMIN.NAME', sortable: true },
  { field: 'group.name', header: 'ADMIN.GROUP', width: 'w-40' },
];

const desktop = () => within(screen.getByTestId('table-desktop'));

describe('Table', () => {
  describe('表示', () => {
    test('見出しを翻訳キーで、セルをドット区切りの field で表示すること', () => {
      render(<Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} />);
      expect(desktop().getByText('ADMIN.NAME')).toBeInTheDocument();
      expect(desktop().getByText('営業')).toBeInTheDocument();
      expect(desktop().getAllByRole('row')).toHaveLength(2);
    });

    test('幅を指定した列は shrink-0 と幅クラス、指定しない列は flex-1 になること', () => {
      render(<Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} />);
      const headers = desktop().getAllByRole('columnheader');
      expect(headers[0]).toHaveClass('flex-1');
      expect(headers[1]).toHaveClass('shrink-0', 'w-40');
    });

    test('render と renderActions でセルと操作列を描画できること', () => {
      render(
        <Table
          data={FIXTURE_ROWS}
          columns={[{ field: 'name', header: 'H', render: (row) => <strong>{row.name}さん</strong> }]}
          renderActions={(row) => <button type="button">{`編集-${row.id}`}</button>}
        />,
      );
      expect(desktop().getByText('山田さん')).toBeInTheDocument();
      expect(desktop().getByRole('button', { name: '編集-2' })).toBeInTheDocument();
    });

    test('データがないときは空のメッセージを表示すること', () => {
      render(<Table data={[]} columns={FIXTURE_COLUMNS} />);
      expect(desktop().getByText('COMMON.NO_DATA')).toBeInTheDocument();
    });

    test('読み込み中は空のメッセージを出さず Loading を表示すること', () => {
      render(<Table data={[]} columns={FIXTURE_COLUMNS} isLoading />);
      expect(screen.queryByText('COMMON.NO_DATA')).not.toBeInTheDocument();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('並べ替え', () => {
    test('見出しのクリックで 昇順 → 降順 → 解除 の順に切り替わること', async () => {
      const onSortChange = vi.fn();
      render(<Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} sortable onSortChange={onSortChange} />);
      const header = desktop().getByText('ADMIN.NAME');
      await userEvent.click(header);
      await userEvent.click(header);
      await userEvent.click(header);
      expect(onSortChange.mock.calls.map((c) => c[0])).toEqual([
        { field: 'name', direction: 'asc' },
        { field: 'name', direction: 'desc' },
        { field: '', direction: '' },
      ]);
    });

    test('sortable でない列はクリックしても並べ替えないこと', async () => {
      const onSortChange = vi.fn();
      render(<Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} sortable onSortChange={onSortChange} />);
      await userEvent.click(desktop().getByText('ADMIN.GROUP'));
      expect(onSortChange).not.toHaveBeenCalled();
    });
  });

  describe('選択', () => {
    test('行のチェックで選択でき、行クリックは発火しないこと', async () => {
      const onSelectionChange = vi.fn();
      const onRowClick = vi.fn();
      render(
        <Table
          data={FIXTURE_ROWS}
          columns={FIXTURE_COLUMNS}
          selectable
          onSelectionChange={onSelectionChange}
          onRowClick={onRowClick}
        />,
      );
      const checkboxes = desktop().getAllByRole('checkbox');
      await userEvent.click(checkboxes[1]);
      expect(onSelectionChange).toHaveBeenLastCalledWith([FIXTURE_ROWS[0]]);
      expect(onRowClick).not.toHaveBeenCalled();
      expect(checkboxes[0]).toHaveAttribute('aria-checked', 'mixed');
    });

    test('ヘッダーのチェックで全選択・全解除できること', async () => {
      const onSelectionChange = vi.fn();
      render(
        <Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} selectable onSelectionChange={onSelectionChange} />,
      );
      const header = desktop().getAllByRole('checkbox')[0];
      await userEvent.click(header);
      expect(onSelectionChange).toHaveBeenLastCalledWith(FIXTURE_ROWS);
      await userEvent.click(header);
      expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    });

    test('データが変わると選択をクリアすること', async () => {
      const onSelectionChange = vi.fn();
      const { rerender } = render(
        <Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} selectable onSelectionChange={onSelectionChange} />,
      );
      await userEvent.click(desktop().getAllByRole('checkbox')[1]);
      const nextRows: Row[] = [{ id: '3', name: '鈴木', group: { name: '総務' } }, ...FIXTURE_ROWS];
      rerender(
        <Table data={nextRows} columns={FIXTURE_COLUMNS} selectable onSelectionChange={onSelectionChange} />,
      );
      expect(onSelectionChange).toHaveBeenLastCalledWith([]);
      expect(desktop().getAllByRole('checkbox')[2]).toHaveAttribute('aria-checked', 'false');
    });

    test('中身が同じ新しい配列を渡しても選択を保ち、クリアを通知しないこと', async () => {
      const onSelectionChange = vi.fn();
      const { rerender } = render(
        <Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} selectable onSelectionChange={onSelectionChange} />,
      );
      await userEvent.click(desktop().getAllByRole('checkbox')[1]);
      onSelectionChange.mockClear();
      rerender(
        <Table data={[...FIXTURE_ROWS]} columns={FIXTURE_COLUMNS} selectable onSelectionChange={onSelectionChange} />,
      );
      expect(onSelectionChange).not.toHaveBeenCalled();
      expect(desktop().getAllByRole('checkbox')[1]).toHaveAttribute('aria-checked', 'true');
    });

    test('親が選択の通知で再レンダーし毎回新しい空配列を渡しても、通知が繰り返されないこと', () => {
      const onSelectionChange = vi.fn();
      function Parent() {
        const [, setSelected] = useState<Row[]>([]);
        const empty: Row[] = [];
        return (
          <Table
            data={empty}
            columns={FIXTURE_COLUMNS}
            selectable
            onSelectionChange={(rows) => {
              onSelectionChange(rows);
              setSelected(rows);
            }}
          />
        );
      }
      render(<Parent />);
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
    });

    test('選択した行に selectedClass が付くこと', async () => {
      render(<Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} selectable />);
      await userEvent.click(desktop().getAllByRole('checkbox')[1]);
      expect(desktop().getAllByRole('row')[0]).toHaveClass('bg-secondary', 'hover:bg-bg-brand-weak');
    });
  });

  test('行クリックで onRowClick が呼ばれること', async () => {
    const onRowClick = vi.fn();
    render(<Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} onRowClick={onRowClick} />);
    await userEvent.click(desktop().getByText('佐藤'));
    expect(onRowClick).toHaveBeenCalledWith(FIXTURE_ROWS[1]);
  });

  test('モバイル表示は renderMobileRow で行の中身を差し替えられること', () => {
    render(
      <Table data={FIXTURE_ROWS} columns={FIXTURE_COLUMNS} renderMobileRow={(row) => <span>{`M-${row.name}`}</span>} />,
    );
    expect(within(screen.getByTestId('table-mobile')).getByText('M-山田')).toBeInTheDocument();
  });
});
