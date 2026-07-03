import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';

export interface Question {
  text: string;
  options: string[];
  multi?: boolean;
}

export interface Answer {
  selectedIndex: number | null;
  selectedIndices: number[];
  otherText: string;
}

@Component({
  selector: 'app-chat-claude',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    TranslateModule,
    ButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './chat-claude.component.html',
  styleUrl: './chat-claude.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatClaudeComponent {
  // Input: array of questions (default 3 questions as per Astro)
  readonly questions = input<Question[]>([
    {
      text: '質問のテキストテキストがここの部分に入ります',
      options: ['選択肢A', '選択肢B', '選択肢C'],
    },
    {
      text: '2番目の質問テキストがここに入ります（複数選択）',
      options: ['選択肢A', '選択肢B', '選択肢C'],
      multi: true,
    },
    { text: '最後の質問テキストがここに入ります', options: ['選択肢A', '選択肢B', '選択肢C'] },
  ]);

  // Outputs
  readonly closed = output<void>();
  readonly skipped = output<void>();
  readonly submitted = output<Answer[]>();

  // Current question index (0-based)
  readonly currentQuestionIndex = signal<number>(0);

  // Answers for each question
  readonly answers = signal<Answer[]>([]);

  // Computed: current question
  readonly currentQuestion = computed(() => {
    const qs = this.questions();
    const idx = this.currentQuestionIndex();
    return qs[idx] || { text: '', options: [], multi: false };
  });

  // Computed: display index (1-based)
  readonly displayIndex = computed(() => this.currentQuestionIndex() + 1);

  // Computed: total count
  readonly totalCount = computed(() => this.questions().length);

  // Computed: is multi-select mode for current question
  readonly isMulti = computed(() => this.currentQuestion().multi ?? false);

  // Computed: is last question
  readonly isLastQuestion = computed(
    () => this.currentQuestionIndex() === this.questions().length - 1,
  );

  // Computed: current options
  readonly currentOptions = computed(() => this.currentQuestion().options);

  // Computed: current answer
  readonly currentAnswer = computed(() => {
    const idx = this.currentQuestionIndex();
    const ans = this.answers();
    return ans[idx] || { selectedIndex: null, selectedIndices: [], otherText: '' };
  });

  // Computed: selected index for current question
  readonly selectedIndex = computed(() => this.currentAnswer().selectedIndex);

  // Computed: selected indices for current question (multi-select)
  readonly selectedIndices = computed(() => this.currentAnswer().selectedIndices);

  // Computed: other text for current question
  readonly otherText = computed(() => this.currentAnswer().otherText);

  // Computed: is other selected (single-select mode)
  readonly isOtherSelected = computed(() => {
    const ans = this.currentAnswer();
    return !this.isMulti() && ans.selectedIndex === null && ans.otherText.length > 0;
  });

  // Computed: check if all options are selected (for multi-select)
  readonly isAllSelected = computed(() => {
    const indices = this.selectedIndices();
    const optionCount = this.currentOptions().length;
    return optionCount > 0 && indices.length === optionCount;
  });

  constructor() {
    // Initialize answers array when questions change
    effect(
      () => {
        const qs = this.questions();
        const currentAnswers = this.answers();
        if (currentAnswers.length !== qs.length) {
          this.answers.set(
            qs.map(() => ({ selectedIndex: null, selectedIndices: [], otherText: '' })),
          );
        }
      },
      { allowSignalWrites: true },
    );
  }

  onClose(): void {
    this.closed.emit();
  }

  onSkip(): void {
    // Clear current answer and move to next
    this.updateCurrentAnswer({ selectedIndex: null, selectedIndices: [], otherText: '' });
    this.advance();
  }

  onAdvance(): void {
    this.advance();
  }

  private advance(): void {
    if (this.isLastQuestion()) {
      // Submit all answers
      this.submitted.emit(this.answers());
    } else {
      // Move to next question
      this.currentQuestionIndex.update((idx) => idx + 1);
    }
  }

  onPrev(): void {
    const idx = this.currentQuestionIndex();
    if (idx > 0) {
      this.currentQuestionIndex.set(idx - 1);
    }
  }

  onNext(): void {
    const idx = this.currentQuestionIndex();
    if (idx < this.questions().length - 1) {
      this.currentQuestionIndex.set(idx + 1);
    }
  }

  selectOption(index: number): void {
    const current = this.currentAnswer();
    if (this.isMulti()) {
      // Multi-select mode: toggle selection
      const indices = [...current.selectedIndices];
      const pos = indices.indexOf(index);
      if (pos === -1) {
        indices.push(index);
      } else {
        indices.splice(pos, 1);
      }
      this.updateCurrentAnswer({ ...current, selectedIndices: indices });
    } else {
      // Single-select mode: toggle or select
      const newIndex = current.selectedIndex === index ? null : index;
      this.updateCurrentAnswer({
        ...current,
        selectedIndex: newIndex,
        otherText: newIndex !== null ? '' : current.otherText,
      });
    }
  }

  isOptionSelected(index: number): boolean {
    if (this.isMulti()) {
      return this.selectedIndices().includes(index);
    }
    return this.selectedIndex() === index;
  }

  toggleSelectAll(): void {
    const current = this.currentAnswer();
    if (this.isAllSelected()) {
      this.updateCurrentAnswer({ ...current, selectedIndices: [] });
    } else {
      this.updateCurrentAnswer({
        ...current,
        selectedIndices: this.currentOptions().map((_, i) => i),
      });
    }
  }

  onOtherFocus(): void {
    const current = this.currentAnswer();
    if (this.isMulti()) {
      // In multi-select mode, focusing marks the checkbox as selected
      if (!current.otherText) {
        this.updateCurrentAnswer({ ...current, otherText: ' ' });
      }
    } else {
      // In single-select mode, clear option selection and set space marker to show check icon
      if (!current.otherText) {
        this.updateCurrentAnswer({ ...current, selectedIndex: null, otherText: ' ' });
      } else {
        this.updateCurrentAnswer({ ...current, selectedIndex: null });
      }
    }
  }

  onOtherInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const current = this.currentAnswer();
    if (this.isMulti()) {
      // Ensure checkbox stays checked when typing
      this.updateCurrentAnswer({ ...current, otherText: value || ' ' });
    } else {
      this.updateCurrentAnswer({ ...current, selectedIndex: null, otherText: value });
    }
  }

  // Toggle the "other" checkbox in multi-select mode
  toggleOtherCheckbox(): void {
    if (!this.isMulti()) return;
    const current = this.currentAnswer();
    // Toggle: if has otherText (checked), clear it (uncheck); otherwise mark as checked
    if (current.otherText.trim()) {
      // Has real text, clear everything
      this.updateCurrentAnswer({ ...current, otherText: '' });
    } else if (current.otherText) {
      // Has space marker but no real text, uncheck
      this.updateCurrentAnswer({ ...current, otherText: '' });
    } else {
      // Empty/unchecked, mark as checked with space marker
      this.updateCurrentAnswer({ ...current, otherText: ' ' });
    }
  }

  // Check if other checkbox is selected in multi-select mode
  isOtherCheckedInMulti(): boolean {
    return this.isMulti() && this.otherText().length > 0;
  }

  // Get display value for other text input (hide space marker)
  getOtherDisplayValue(): string {
    const text = this.otherText();
    return text.trim() ? text : '';
  }

  private updateCurrentAnswer(answer: Answer): void {
    const idx = this.currentQuestionIndex();
    this.answers.update((ans) => {
      const newAns = [...ans];
      newAns[idx] = answer;
      return newAns;
    });
  }
}
