import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AppMatIcon } from './app-mat-icon';

describe('AppMatIcon', () => {
  test('外側の要素にクラスを付け、中に material-symbols のアイコン名を描画すること', () => {
    const { container } = render(<AppMatIcon icon="check" className="text-[22px]!" />);
    const host = container.firstElementChild as HTMLElement;
    expect(host).toHaveClass('app-mat-icon', 'inline-flex', 'text-[22px]!');
    const icon = host.querySelector('.mat-icon') as HTMLElement;
    expect(icon).toHaveClass('material-symbols-outlined');
    expect(icon).toHaveTextContent('check');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
