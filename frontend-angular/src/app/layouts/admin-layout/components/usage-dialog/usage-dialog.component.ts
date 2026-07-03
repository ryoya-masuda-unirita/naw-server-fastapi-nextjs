import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { UserService } from '@core/services/user.service';
import { CreditUsageService } from '@core/services/credit-usage.service';
import { getBillingPeriodEndFromResetAt, hasCreditUsageData } from '@app-types/credit-usage.type';

const DONUT_RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

@Component({
  selector: 'app-usage-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule, SvgIconComponent],
  templateUrl: './usage-dialog.component.html',
})
export class UsageDialogComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly creditUsageService = inject(CreditUsageService);

  readonly alertDismissed = signal(false);

  readonly isLoading = computed(
    () =>
      this.creditUsageService.meQuery.isPending() ||
      this.creditUsageService.workspaceQuery.isPending(),
  );

  readonly meUsage = computed(() => this.creditUsageService.meQuery.data());
  readonly workspaceUsage = computed(() => this.creditUsageService.workspaceQuery.data());

  readonly hasPersonalUsage = computed(() => hasCreditUsageData(this.meUsage()));
  readonly hasWorkspaceUsage = computed(() => hasCreditUsageData(this.workspaceUsage()));

  private readonly plan = computed(() => this.userService.profileQuery.data()?.subscription?.plan);

  readonly personalUsed = computed(() => this.meUsage()?.totalCredits ?? 0);
  readonly personalLimit = computed(() => this.plan()?.maxCreditsPerDay ?? 0);
  readonly personalAlertPct = computed(() => this.plan()?.dailyAlertPercentage ?? 0);

  readonly workspaceUsed = computed(() => this.workspaceUsage()?.totalCredits ?? 0);
  readonly workspaceLimit = computed(() => this.workspaceUsage()?.creditLimit ?? 0);

  readonly personalRatio = computed(() =>
    this.personalLimit() > 0 ? Math.min(this.personalUsed() / this.personalLimit(), 1) : 0,
  );
  readonly showAlert = computed(
    () =>
      this.hasPersonalUsage() &&
      !this.alertDismissed() &&
      this.personalAlertPct() > 0 &&
      this.personalRatio() * 100 >= this.personalAlertPct() &&
      this.personalRatio() < 1,
  );
  readonly showError = computed(
    () => this.hasPersonalUsage() && this.personalLimit() > 0 && this.personalRatio() >= 1,
  );

  readonly personalDashoffset = computed(() => CIRCUMFERENCE * (1 - this.personalRatio()));
  readonly workspaceDashoffset = computed(() => {
    const limit = this.workspaceLimit();
    if (limit === 0) return CIRCUMFERENCE;
    const ratio = Math.min(this.workspaceUsed() / limit, 1);
    return CIRCUMFERENCE * (1 - ratio);
  });

  readonly circumference = CIRCUMFERENCE;

  ngOnInit(): void {
    this.creditUsageService.fetchUsage();
  }

  dismissAlert(): void {
    this.alertDismissed.set(true);
  }

  formatNumber(n: number): string {
    return n.toLocaleString('ja-JP');
  }

  formatPeriodDate(iso?: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC',
    });
  }

  formatBillingPeriodEnd(nextBillingResetAt?: string): string {
    return this.formatPeriodDate(getBillingPeriodEndFromResetAt(nextBillingResetAt));
  }
}
