import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminPageShell } from './admin-page-shell';

describe('AdminPageShell', () => {
  test('ヘッダーと本文が表示され、本文の領域に term-main と指定したクラスが付くこと', () => {
    render(
      <AdminPageShell header={<h1>HEADER</h1>} mainClass="extra-class">
        <p>BODY</p>
      </AdminPageShell>
    );

    expect(screen.getByRole('heading', { name: 'HEADER' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('BODY');
    expect(main).toHaveClass('term-main', 'extra-class');
  });

  test('画面独自のヘッダーのときは本文の領域が term-main--full になること', () => {
    render(
      <AdminPageShell header={<div>CUSTOM</div>} customHeader>
        <p>BODY</p>
      </AdminPageShell>
    );

    expect(screen.getByRole('main')).toHaveClass('term-main--full');
    expect(screen.getByRole('main')).not.toHaveClass('term-main');
  });
});
