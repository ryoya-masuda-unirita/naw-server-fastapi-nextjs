import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ICON_PATHS } from './svg-icon-paths';
import { MatIcon } from './mat-icon';
import { SvgIcon } from './svg-icon';

describe('SvgIcon', () => {
  test('名前に対応するパスの svg を描画し、外側にクラスを足すこと', () => {
    const { container } = render(<SvgIcon name="close" className="text-white" />);

    expect(container.querySelector('path')).toHaveAttribute('d', ICON_PATHS.close);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 20 20');
    expect(container.firstChild).toHaveClass('h-5', 'w-5', 'text-white');
  });
});

describe('MatIcon', () => {
  test('Material Symbols のアイコン名を既定 20px で描画すること', () => {
    const { container } = render(<MatIcon name="lock" />);
    const icon = container.firstChild as HTMLElement;

    expect(icon).toHaveTextContent('lock');
    expect(icon).toHaveClass('material-symbols-outlined');
    expect(icon).toHaveStyle({ fontSize: '20px', width: '20px', height: '20px' });
  });
});
