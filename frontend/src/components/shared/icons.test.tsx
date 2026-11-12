import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AppMatIcon, MatIcon } from './mat-icon';
import { SvgIcon } from './svg-icon';
import { ICON_PATHS } from './svg-icon-paths';

describe('MatIcon', () => {
  test('material-symbols-outlined のリガチャとしてアイコン名を描画すること', () => {
    const { container } = render(<MatIcon icon="close" className="icon-20" />);
    const icon = container.firstElementChild as HTMLElement;
    expect(icon).toHaveClass('mat-icon', 'material-symbols-outlined', 'icon-20');
    expect(icon).toHaveTextContent('close');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  test('AppMatIcon は外側の要素にクラスを付けること', () => {
    const { container } = render(<AppMatIcon icon="check" className="text-[22px]!" />);
    const host = container.firstElementChild as HTMLElement;
    expect(host).toHaveClass('app-mat-icon', 'inline-flex', 'text-[22px]!');
    expect(host.querySelector('.mat-icon')).toHaveTextContent('check');
  });
});

describe('SvgIcon', () => {
  test('登録済みのパスを描画すること', () => {
    const { container } = render(<SvgIcon name="close" className="w-3 h-3" />);
    expect(container.firstElementChild).toHaveClass('w-3', 'h-3');
    expect(container.querySelector('path')).toHaveAttribute('d', ICON_PATHS.close);
  });

  test('複数パスのアイコンはすべてのパスを描画すること', () => {
    const { container } = render(<SvgIcon name="radioOn" />);
    const expected = ICON_PATHS.radioOn;
    expect(Array.isArray(expected)).toBe(true);
    expect(container.querySelectorAll('path')).toHaveLength((expected as string[]).length);
  });
});
