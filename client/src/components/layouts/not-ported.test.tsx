import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useUiStore } from '@/store/ui-store';
import { NotPortedDialog, NotPortedPage } from './not-ported';

describe('NotPortedPage', () => {
  test('移植元のコンポーネント名と担当 Issue を表示し、子ルートも表示すること', () => {
    render(
      <MemoryRouter initialEntries={['/parent/child']}>
        <Routes>
          <Route path="/parent" element={<NotPortedPage name="ParentComponent" issue={128} />}>
            <Route path="child" element={<NotPortedPage name="ChildComponent" issue={128} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('未移植: ParentComponent（#128）')).toBeInTheDocument();
    expect(screen.getByText('未移植: ChildComponent（#128）')).toBeInTheDocument();
  });

  test('ページヘッダーを 1 つだけ出し、モバイルのサイドバー開閉ボタンから開けること', async () => {
    useUiStore.setState({ sidebarMobileOpen: false });
    render(
      <MemoryRouter initialEntries={['/parent/child']}>
        <Routes>
          <Route path="/parent" element={<NotPortedPage name="ParentComponent" issue={128} />}>
            <Route path="child" element={<NotPortedPage name="ChildComponent" issue={128} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const user = userEvent.setup();

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    await user.click(screen.getByTitle('HEADER.SIDEBAR_TOGGLE'));

    expect(useUiStore.getState().sidebarMobileOpen).toBe(true);
  });
});

describe('NotPortedDialog', () => {
  test('閉じているときは何も出さないこと', () => {
    const { container } = render(<NotPortedDialog name="XDialog" open={false} onClose={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  test('開いているときは担当未定と表示し、閉じるボタンで onClose が呼ばれること', async () => {
    const onClose = vi.fn();
    render(<NotPortedDialog name="XDialog" open onClose={onClose} />);
    const user = userEvent.setup();

    expect(screen.getByRole('dialog', { name: 'XDialog' })).toHaveTextContent('担当 Issue 未定');
    await user.click(screen.getByRole('button', { name: 'COMMON.CLOSE' }));

    expect(onClose).toHaveBeenCalled();
  });
});
