import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { UiStore } from '@core/stores/ui.store';
import { MultiSelectComponent } from './multi-select.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class AppMatIconStub {
  readonly icon = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

@Component({ selector: 'app-button', standalone: true, template: '<ng-content />' })
class ButtonStub {
  readonly variant = input<string>('');
  readonly size = input<string>('');
  readonly heightPx = input<number | undefined>(undefined);
  readonly buttonClick = output<MouseEvent>();
}

@Component({ selector: 'app-checkbox', standalone: true, template: '' })
class CheckboxStub {
  readonly checked = input<boolean>(false);
  readonly indeterminate = input<boolean>(false);
  readonly isHeader = input<boolean>(false);
  readonly size = input<string>('');
}

describe('MultiSelectComponent', () => {
  let fixture: ComponentFixture<MultiSelectComponent<string>>;
  let component: MultiSelectComponent<string>;
  // コンポーネントは requestAnimationFrame（多重スケジュールを含む）でレイアウト更新を行うため、
  // 実時間を待たず登録されたコールバックを手動でフラッシュする（CIのCPU負荷でタイムアウトしないように）
  let rafCallbacks: FrameRequestCallback[];

  function flushRaf(): void {
    while (rafCallbacks.length > 0) {
      const callbacks = rafCallbacks;
      rafCallbacks = [];
      callbacks.forEach((cb) => cb(0));
    }
  }

  const options = Array.from({ length: 20 }, (_, i) => ({
    label: `User ${i + 1}`,
    value: `user-${i + 1}`,
  }));

  beforeEach(async () => {
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }) as typeof requestAnimationFrame);

    await TestBed.configureTestingModule({
      imports: [MultiSelectComponent],
      providers: [
        {
          provide: UiStore,
          useValue: { isMobile: signal(false).asReadonly() },
        },
      ],
    })
      .overrideComponent(MultiSelectComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            AppMatIconStub,
            SvgIconStub,
            ButtonStub,
            CheckboxStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(MultiSelectComponent<string>);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', options);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('toggleAll後にドロップダウンのmax-heightが再計算されること', () => {
    let triggerBottom = 220;
    vi.spyOn(component['elementRef'].nativeElement, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: 180,
          bottom: triggerBottom,
          left: 0,
          right: 400,
          width: 400,
          height: triggerBottom - 180,
          x: 0,
          y: 180,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    vi.spyOn(
      component as never as { getClippingAncestorBounds: () => { top: number; bottom: number } },
      'getClippingAncestorBounds',
    ).mockReturnValue({
      top: 0,
      bottom: 600,
    });

    component.open();
    flushRaf();
    fixture.detectChanges();

    const initialMaxHeight = Number.parseInt(component.dropdownMaxHeight(), 10);
    expect(initialMaxHeight).toBeGreaterThan(160);

    triggerBottom = 480;
    component.toggleAll();
    flushRaf();
    fixture.detectChanges();

    const updatedMaxHeight = Number.parseInt(component.dropdownMaxHeight(), 10);
    expect(updatedMaxHeight).toBeLessThan(initialMaxHeight);
  });

  test('デスクトップドロップダウンのフッターがshrink-0であること', () => {
    component.open();
    flushRaf();
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector(
      '.absolute.left-0.right-0 .border-t.border-border',
    ) as HTMLElement | null;
    expect(footer?.classList.contains('shrink-0')).toBe(true);
  });
});
