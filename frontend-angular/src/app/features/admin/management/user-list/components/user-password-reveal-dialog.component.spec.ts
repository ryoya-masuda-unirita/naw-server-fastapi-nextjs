import { Component, input, Pipe, PipeTransform } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { UserPasswordRevealDialogComponent } from './user-password-reveal-dialog.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-button', standalone: true, template: '<ng-content></ng-content>' })
class ButtonStub {
  variant = input<string>('solid');
  size = input<string>('md');
  type = input<string>('button');
}

const FIXTURE_PASSWORD = 'TestPass123!';
const FIXTURE_EXPIRED_AT = '2025-03-01T09:00:00.000Z';

describe('UserPasswordRevealDialogComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<UserPasswordRevealDialogComponent>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserPasswordRevealDialogComponent, NoopAnimationsModule],
    })
      .overrideComponent(UserPasswordRevealDialogComponent, {
        set: { imports: [FakeTranslatePipe, ButtonStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UserPasswordRevealDialogComponent);
    fixture.componentRef.setInput('initialPassword', FIXTURE_PASSWORD);
    fixture.componentRef.setInput('passwordExpiredAt', FIXTURE_EXPIRED_AT);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('初期表示', () => {
    test('初期パスワードが表示されること', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain(FIXTURE_PASSWORD);
    });

    test('有効期限が年月日時分の形式で表示されること', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).not.toContain(FIXTURE_EXPIRED_AT);
      expect(compiled.textContent).toContain('2025');
    });

    test('警告メッセージが表示されること', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_WARNING');
    });

    test('パスワードをコピーするボタンが表示されること', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('app-button')).toBeTruthy();
    });
  });

  describe('コピー操作', () => {
    test('パスワードをコピーするとコピー済みの状態が表示されること', async () => {
      vi.stubGlobal('navigator', {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });

      const component = fixture.componentInstance;
      await component.copyPassword();
      fixture.detectChanges();

      expect(component.copied()).toBe(true);
    });
  });
});
