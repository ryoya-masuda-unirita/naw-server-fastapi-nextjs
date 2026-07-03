import { Component, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { UsageDialogComponent } from './usage-dialog.component';
import { UserService } from '@core/services/user.service';
import { CreditUsageService } from '@core/services/credit-usage.service';
import { TranslateService } from '@ngx-translate/core';
import type { CreditUsageResponse } from '@app-types/credit-usage.type';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string, _params?: unknown): string {
    return value;
  }
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {}

const profileData = signal<
  | { subscription?: { plan?: { maxCreditsPerDay?: number; dailyAlertPercentage?: number } } }
  | undefined
>(undefined);
const meUsageData = signal<CreditUsageResponse | undefined>(undefined);
const workspaceUsageData = signal<CreditUsageResponse | undefined>(undefined);
const mePending = signal(false);
const workspacePending = signal(false);

const mockUserService = {
  profileQuery: { data: profileData },
};

const mockCreditUsageService = {
  meQuery: {
    data: meUsageData,
    isPending: () => mePending(),
  },
  workspaceQuery: {
    data: workspaceUsageData,
    isPending: () => workspacePending(),
  },
  fetchUsage: vi.fn(),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const DONUT_RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

describe('UsageDialogComponent', () => {
  let fixture: ComponentFixture<UsageDialogComponent>;
  let component: UsageDialogComponent;

  beforeEach(async () => {
    profileData.set(undefined);
    meUsageData.set(undefined);
    workspaceUsageData.set(undefined);
    mePending.set(false);
    workspacePending.set(false);

    await TestBed.configureTestingModule({
      imports: [UsageDialogComponent],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: CreditUsageService, useValue: mockCreditUsageService },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    })
      .overrideComponent(UsageDialogComponent, {
        set: { imports: [FakeTranslatePipe, SvgIconStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UsageDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('ngOnInitでfetchUsageが呼ばれること', () => {
      expect(mockCreditUsageService.fetchUsage).toHaveBeenCalled();
    });

    test('alertDismissedの初期値がfalseであること', () => {
      expect(component.alertDismissed()).toBe(false);
    });

    test('データなし時のpersonalUsedが0であること', () => {
      expect(component.personalUsed()).toBe(0);
    });

    test('データなし時のpersonalLimitが0であること', () => {
      expect(component.personalLimit()).toBe(0);
    });

    test('データなし時のpersonalAlertPctが0であること', () => {
      expect(component.personalAlertPct()).toBe(0);
    });

    test('データなし時のworkspaceUsedが0であること', () => {
      expect(component.workspaceUsed()).toBe(0);
    });

    test('データなし時のworkspaceLimitが0であること', () => {
      expect(component.workspaceLimit()).toBe(0);
    });

    test('hasPersonalUsageがtotalCredits未設定時にfalseであること', () => {
      meUsageData.set({});
      fixture.detectChanges();
      expect(component.hasPersonalUsage()).toBe(false);
    });

    test('hasWorkspaceUsageがcreditLimit付きデータでtrueであること', () => {
      workspaceUsageData.set({ totalCredits: 5, creditLimit: 1000 });
      fixture.detectChanges();
      expect(component.hasWorkspaceUsage()).toBe(true);
    });

    test('personalRatioがlimitが0の場合に0を返すこと', () => {
      expect(component.personalRatio()).toBe(0);
    });

    test('personalRatioが正確に計算されること', () => {
      profileData.set({ subscription: { plan: { maxCreditsPerDay: 200 } } });
      meUsageData.set({ totalCredits: 100 });
      fixture.detectChanges();
      expect(component.personalRatio()).toBe(0.5);
    });

    test('personalRatioが使用量が上限を超えた場合に1に制限されること', () => {
      profileData.set({ subscription: { plan: { maxCreditsPerDay: 100 } } });
      meUsageData.set({ totalCredits: 150 });
      fixture.detectChanges();
      expect(component.personalRatio()).toBe(1);
    });

    test('showAlertが初期状態でfalseであること', () => {
      expect(component.showAlert()).toBe(false);
    });

    test('showAlertがtrueになること（使用量がアラートしきい値以上の場合）', () => {
      profileData.set({
        subscription: { plan: { maxCreditsPerDay: 100, dailyAlertPercentage: 80 } },
      });
      meUsageData.set({ totalCredits: 85 });
      fixture.detectChanges();
      expect(component.showAlert()).toBe(true);
    });

    test('showAlertが使用量が100%の場合はfalseになること', () => {
      profileData.set({
        subscription: { plan: { maxCreditsPerDay: 100, dailyAlertPercentage: 80 } },
      });
      meUsageData.set({ totalCredits: 100 });
      fixture.detectChanges();
      expect(component.showAlert()).toBe(false);
    });

    test('showAlertがalertDismissed=trueの場合はfalseになること', () => {
      profileData.set({
        subscription: { plan: { maxCreditsPerDay: 100, dailyAlertPercentage: 80 } },
      });
      meUsageData.set({ totalCredits: 85 });
      fixture.detectChanges();
      component.dismissAlert();
      expect(component.showAlert()).toBe(false);
    });

    test('showErrorが初期状態でfalseであること', () => {
      expect(component.showError()).toBe(false);
    });

    test('showErrorがtrueになること（使用量が上限以上の場合）', () => {
      profileData.set({ subscription: { plan: { maxCreditsPerDay: 100 } } });
      meUsageData.set({ totalCredits: 100 });
      fixture.detectChanges();
      expect(component.showError()).toBe(true);
    });

    test('circumferenceが正しい値であること', () => {
      expect(component.circumference).toBeCloseTo(CIRCUMFERENCE);
    });

    test('personalDashoffsetが初期状態でcircumferenceと等しいこと', () => {
      expect(component.personalDashoffset()).toBeCloseTo(CIRCUMFERENCE);
    });

    test('personalDashoffsetが正しく計算されること', () => {
      profileData.set({ subscription: { plan: { maxCreditsPerDay: 200 } } });
      meUsageData.set({ totalCredits: 100 });
      fixture.detectChanges();
      expect(component.personalDashoffset()).toBeCloseTo(CIRCUMFERENCE * 0.5);
    });

    test('workspaceDashoffsetがlimit=0の場合にcircumferenceを返すこと', () => {
      expect(component.workspaceDashoffset()).toBeCloseTo(CIRCUMFERENCE);
    });

    test('workspaceDashoffsetが正しく計算されること', () => {
      workspaceUsageData.set({ totalCredits: 500, creditLimit: 1000 });
      fixture.detectChanges();
      expect(component.workspaceDashoffset()).toBeCloseTo(CIRCUMFERENCE * 0.5);
    });

    test('formatNumberが日本語ロケールでフォーマットすること', () => {
      expect(component.formatNumber(1000)).toBe('1,000');
    });

    test('formatNumber(0)が"0"を返すこと', () => {
      expect(component.formatNumber(0)).toBe('0');
    });

    test('formatPeriodDateがUTC日付をフォーマットすること', () => {
      expect(component.formatPeriodDate('2026-06-01T00:00:00Z')).toBe('2026/06/01');
    });

    test('formatBillingPeriodEndがnextBillingResetAtの前日を返すこと', () => {
      expect(component.formatBillingPeriodEnd('2026-07-01T00:00:00Z')).toBe('2026/06/30');
    });

    test('formatBillingPeriodEndが未設定の場合に空文字を返すこと', () => {
      expect(component.formatBillingPeriodEnd(undefined)).toBe('');
    });
  });

  describe('DOM要素表示', () => {
    test('初期状態でアラートバナーが表示されないこと', () => {
      const alerts = fixture.debugElement.queryAll(By.css('[role="alert"]'));
      expect(alerts.length).toBe(0);
    });

    test('showAlertがtrueの場合にアラートバナーが1つ表示されること', () => {
      profileData.set({
        subscription: { plan: { maxCreditsPerDay: 100, dailyAlertPercentage: 80 } },
      });
      meUsageData.set({ totalCredits: 85 });
      fixture.detectChanges();
      const alerts = fixture.debugElement.queryAll(By.css('[role="alert"]'));
      expect(alerts.length).toBe(1);
    });

    test('showErrorがtrueの場合にエラーバナーが1つ表示されること', () => {
      profileData.set({ subscription: { plan: { maxCreditsPerDay: 100 } } });
      meUsageData.set({ totalCredits: 100 });
      fixture.detectChanges();
      const alerts = fixture.debugElement.queryAll(By.css('[role="alert"]'));
      expect(alerts.length).toBe(1);
    });

    test('alertとerrorが同時に表示されないこと（errorの場合はalertは非表示）', () => {
      profileData.set({
        subscription: { plan: { maxCreditsPerDay: 100, dailyAlertPercentage: 80 } },
      });
      meUsageData.set({ totalCredits: 105 });
      fixture.detectChanges();
      expect(component.showError()).toBe(true);
      expect(component.showAlert()).toBe(false);
    });

    test('personalUsedの値がテンプレートに表示されること', () => {
      profileData.set({ subscription: { plan: { maxCreditsPerDay: 1000 } } });
      meUsageData.set({ totalCredits: 500 });
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent;
      expect(text).toContain('500');
    });

    test('workspaceUsedの値が日本語ロケールでテンプレートに表示されること', () => {
      workspaceUsageData.set({ totalCredits: 2500, creditLimit: 5000 });
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent;
      expect(text).toContain('2,500');
    });

    test('personalDashoffsetがSVGのstroke-dashoffset属性に反映されること', () => {
      profileData.set({ subscription: { plan: { maxCreditsPerDay: 200 } } });
      meUsageData.set({ totalCredits: 100 });
      fixture.detectChanges();
      const circles = fixture.debugElement.queryAll(By.css('circle[stroke-linecap="round"]'));
      const personalCircle = circles[0];
      const dashoffset = parseFloat(personalCircle.nativeElement.getAttribute('stroke-dashoffset'));
      expect(dashoffset).toBeCloseTo(CIRCUMFERENCE * 0.5, 1);
    });

    test('subscriptionなしの場合にNO_SUBSCRIPTIONメッセージが表示されること', () => {
      const text = fixture.nativeElement.textContent;
      expect(text).toContain('USAGE_DIALOG.NO_SUBSCRIPTION');
    });
  });

  describe('DOM要素イベント', () => {
    test('dismissAlert()でalertDismissedがtrueになること', () => {
      component.dismissAlert();
      expect(component.alertDismissed()).toBe(true);
    });

    test('閉じるボタンクリックでアラートバナーが非表示になること', () => {
      profileData.set({
        subscription: { plan: { maxCreditsPerDay: 100, dailyAlertPercentage: 80 } },
      });
      meUsageData.set({ totalCredits: 85 });
      fixture.detectChanges();

      const dismissBtn = fixture.debugElement.query(By.css('button[type="button"]'));
      expect(dismissBtn).not.toBeNull();

      dismissBtn.nativeElement.click();
      fixture.detectChanges();

      const alerts = fixture.debugElement.queryAll(By.css('[role="alert"]'));
      expect(alerts.length).toBe(0);
    });
  });
});
