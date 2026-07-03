import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-circular-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './circular-progress.component.html',
  styleUrl: './circular-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex items-center justify-center',
  },
})
export class CircularProgressComponent {
  readonly current = input.required<number>();
  readonly limit = input.required<number>();
  readonly label = input<string>('今月の使用量');

  readonly percentage = computed(() => {
    const curr = this.current();
    const lim = this.limit();
    return lim > 0 ? Math.min((curr / lim) * 100, 100) : 0;
  });

  readonly strokeDasharray = computed(() => {
    const pct = this.percentage();
    const circumference = 2 * Math.PI * 50;
    return `${(pct / 100) * circumference} ${circumference}`;
  });

  readonly formattedCurrent = computed(() => {
    return this.formatNumber(this.current());
  });

  readonly formattedLimit = computed(() => {
    return this.formatNumber(this.limit());
  });

  private formatNumber(num: number): string {
    return num.toLocaleString('ja-JP');
  }
}
