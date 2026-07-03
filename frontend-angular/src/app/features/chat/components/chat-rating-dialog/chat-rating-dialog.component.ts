import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import {
  FormRadioComponent,
  FormRadioOption,
} from '@shared/components/form/form-radio/form-radio.component';

export interface ChatRatingDialogActionBridge {
  runCancel: () => void;
  runSubmit: () => void;
  selectedRating: WritableSignal<number | null>;
  isLoading: Signal<boolean>;
}

@Component({
  selector: 'app-chat-rating-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormRadioComponent],
  templateUrl: './chat-rating-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class ChatRatingDialogComponent {
  readonly actionBridge = input.required<ChatRatingDialogActionBridge>();
  readonly initialRating = input<number | null>(null);

  readonly selectedRating = signal<number | null>(null);

  readonly ratingOptions: FormRadioOption[] = [
    { value: 5, label: '★★★★★' },
    { value: 4, label: '★★★★☆' },
    { value: 3, label: '★★★☆☆' },
    { value: 2, label: '★★☆☆☆' },
    { value: 1, label: '★☆☆☆☆' },
  ];

  constructor() {
    // Pre-select the room's existing rating when the dialog opens
    effect(() => {
      const initial = this.initialRating();
      if (initial !== null) {
        this.selectedRating.set(initial);
        this.actionBridge().selectedRating.set(initial);
      }
    });
  }

  selectRating(value: number): void {
    this.selectedRating.set(value);
    this.actionBridge().selectedRating.set(value);
  }
}
