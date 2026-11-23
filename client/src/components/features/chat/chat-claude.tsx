import { useState } from 'react';
import './chat-claude.css';
import { Button } from '@/components/shared/button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';

export interface ChatClaudeQuestion {
  text: string;
  options: string[];
  multi?: boolean;
}

export interface ChatClaudeAnswer {
  selectedIndex: number | null;
  selectedIndices: number[];
  otherText: string;
}

/** 移植元の既定の質問（デモ用の文言。移植元もこの 3 問を既定値にしている） */
const DEFAULT_QUESTIONS: ChatClaudeQuestion[] = [
  { text: '質問のテキストテキストがここの部分に入ります', options: ['選択肢A', '選択肢B', '選択肢C'] },
  {
    text: '2番目の質問テキストがここに入ります（複数選択）',
    options: ['選択肢A', '選択肢B', '選択肢C'],
    multi: true,
  },
  { text: '最後の質問テキストがここに入ります', options: ['選択肢A', '選択肢B', '選択肢C'] },
];

const EMPTY_ANSWER: ChatClaudeAnswer = { selectedIndex: null, selectedIndices: [], otherText: '' };

interface ChatClaudeProps {
  questions?: ChatClaudeQuestion[];
  onClose?: () => void;
  onSubmit?: (answers: ChatClaudeAnswer[]) => void;
}

/** 移植元 `<app-chat-claude>`。入力欄の上に出す選択式の質問フロー（移植元では isClaude が常に false のため表示されない） */
export function ChatClaude({ questions = DEFAULT_QUESTIONS, onClose, onSubmit }: ChatClaudeProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<ChatClaudeAnswer[]>(() => questions.map(() => EMPTY_ANSWER));

  const question = questions[index] ?? { text: '', options: [], multi: false };
  const isMulti = question.multi ?? false;
  const isLastQuestion = index === questions.length - 1;
  const answer = answers[index] ?? EMPTY_ANSWER;
  const displayIndex = index + 1;
  const totalCount = questions.length;
  const isAllSelected = question.options.length > 0 && answer.selectedIndices.length === question.options.length;
  const isOtherSelected = !isMulti && answer.selectedIndex === null && answer.otherText.length > 0;

  const updateAnswer = (next: ChatClaudeAnswer) => {
    setAnswers((current) => current.map((a, i) => (i === index ? next : a)));
  };

  const advance = (finalAnswers: ChatClaudeAnswer[]) => {
    if (isLastQuestion) {
      onSubmit?.(finalAnswers);
    } else {
      setIndex((current) => current + 1);
    }
  };

  const handleSkip = () => {
    const cleared = answers.map((a, i) => (i === index ? EMPTY_ANSWER : a));
    setAnswers(cleared);
    advance(cleared);
  };

  const selectOption = (optionIndex: number) => {
    if (isMulti) {
      const indices = answer.selectedIndices.includes(optionIndex)
        ? answer.selectedIndices.filter((i) => i !== optionIndex)
        : [...answer.selectedIndices, optionIndex];
      updateAnswer({ ...answer, selectedIndices: indices });
      return;
    }
    const newIndex = answer.selectedIndex === optionIndex ? null : optionIndex;
    updateAnswer({
      ...answer,
      selectedIndex: newIndex,
      otherText: newIndex !== null ? '' : answer.otherText,
    });
  };

  const isOptionSelected = (optionIndex: number) =>
    isMulti ? answer.selectedIndices.includes(optionIndex) : answer.selectedIndex === optionIndex;

  const toggleSelectAll = () => {
    updateAnswer({
      ...answer,
      selectedIndices: isAllSelected ? [] : question.options.map((_, i) => i),
    });
  };

  // 「その他」は、複数選択ではチェック済みの印として空白 1 文字を入れておく（移植元と同じ）
  const handleOtherFocus = () => {
    if (isMulti) {
      if (!answer.otherText) updateAnswer({ ...answer, otherText: ' ' });
    } else if (!answer.otherText) {
      updateAnswer({ ...answer, selectedIndex: null, otherText: ' ' });
    } else {
      updateAnswer({ ...answer, selectedIndex: null });
    }
  };

  const handleOtherInput = (value: string) => {
    if (isMulti) {
      updateAnswer({ ...answer, otherText: value || ' ' });
    } else {
      updateAnswer({ ...answer, selectedIndex: null, otherText: value });
    }
  };

  const toggleOtherCheckbox = () => {
    if (!isMulti) return;
    updateAnswer({ ...answer, otherText: answer.otherText ? '' : ' ' });
  };

  const otherDisplayValue = answer.otherText.trim() ? answer.otherText : '';

  const checkbox = (checked: boolean) => (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
      <span className={`input-checkbox-icon${checked ? ' input-checkbox-icon-checked' : ''}`}>
        <SvgIcon
          name={checked ? 'selectedTrue' : 'selectedFlase'}
          className={`input-checkbox-icon-svg${checked ? ' text-brand-primary' : ''}`}
        />
      </span>
    </span>
  );

  const checkIcon = (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      className="shrink-0 w-5 h-5 text-brand-secondary check-icon"
    >
      <path
        d="M7.33021 13.2307L3.85521 9.75573L2.67188 10.9307L7.33021 15.5891L17.3302 5.58906L16.1552 4.41406L7.33021 13.2307Z"
        fill="currentColor"
      />
    </svg>
  );

  return (
    <div
      id="chat-assist-flow"
      className="absolute bottom-0 left-0 z-10000 flex-1 flex flex-col justify-end w-full bg-bg-primary overflow-y-auto"
    >
      <div className="relative flex flex-col items-center">
        <div className="absolute top-0 left-0 right-0 h-8 from-white to-transparent pointer-events-none z-10" />

        <div className="flex flex-col gap-2 items-center pb-4 px-4 pt-6 w-full md:p-0">
          <div
            id="assist-card"
            className="bg-white border border-border-weak flex flex-col gap-3 items-start max-w-180 p-4 rounded-16 w-full"
            style={{ boxShadow: '0px 0px 1px 0px rgba(0, 0, 0, 0.3), 0px 4px 4px 0px rgba(0, 0, 0, 0.02)' }}
          >
            <div className="flex gap-3 items-start w-full">
              <div className="flex flex-1 flex-col md:flex-row md:items-center flex-wrap gap-2 min-w-0">
                <p id="assist-question" className="flex-1 text-h5">
                  {question.text}
                </p>
                <div className="flex gap-1 items-center shrink-0">
                  <button
                    type="button"
                    className={`flex items-center justify-center p-1 rounded-full hover:bg-bg-secondary ${
                      displayIndex > 1 ? 'text-text-weak' : 'text-text-disabled pointer-events-none'
                    }`}
                    onClick={() => setIndex((current) => Math.max(0, current - 1))}
                    aria-label="前の質問"
                  >
                    <SvgIcon name="arrowLeft" className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-0.5 font-medium text-text-medium whitespace-nowrap text-label-large">
                    <span id="assist-current">{displayIndex}</span>
                    <span>/</span>
                    <span id="assist-total">{totalCount}</span>
                    <span className="text-label">件</span>
                  </div>
                  <button
                    type="button"
                    className={`flex items-center justify-center p-1 rounded-full hover:bg-bg-secondary ${
                      displayIndex < totalCount ? 'text-text-weak' : 'text-text-disabled pointer-events-none'
                    }`}
                    onClick={() => setIndex((current) => Math.min(questions.length - 1, current + 1))}
                    aria-label="次の質問へ"
                  >
                    <SvgIcon name="arrowRight" className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="flex items-center justify-center bg-text-strong p-1 rounded-full shrink-0"
                onClick={() => onClose?.()}
                aria-label="閉じる"
              >
                <SvgIcon name="close" className="w-5 h-5 text-white" />
              </button>
            </div>

            <div
              id="assist-options"
              className={`flex flex-col w-full${isMulti ? ' gap-2' : ''}`}
              role="listbox"
              aria-label="選択肢"
            >
              {isMulti && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  aria-selected={isAllSelected}
                  className="assist-option flex items-center gap-2 w-full py-1 px-4 rounded h-7.5 text-left"
                >
                  {checkbox(isAllSelected)}
                  <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-label-x-large assist-opt-text">
                    すべて選択
                  </span>
                </button>
              )}

              {question.options.map((option, optionIndex) => {
                const selected = isOptionSelected(optionIndex);
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    role="option"
                    onClick={() => selectOption(optionIndex)}
                    aria-selected={selected}
                    className={`assist-option flex items-center gap-2 w-full px-4 rounded text-left ${
                      isMulti ? 'py-1 h-7' : 'py-2 h-9'
                    }`}
                  >
                    {isMulti ? checkbox(selected) : checkIcon}
                    <span
                      className={`flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap assist-opt-text ${
                        isMulti ? 'text-label-large' : 'text-note'
                      }${selected && !isMulti ? ' text-brand-secondary' : ''}`}
                    >
                      {option}
                    </span>
                  </button>
                );
              })}

              <div
                className={`assist-option other-row flex flex-wrap items-center gap-2 w-full px-4 rounded${isMulti ? '' : ' py-2'}`}
                aria-selected={isOtherSelected || (isMulti && !!answer.otherText)}
              >
                {isMulti ? (
                  <span
                    className="relative flex h-5 w-5 shrink-0 items-center justify-center cursor-pointer"
                    aria-hidden="true"
                    onClick={toggleOtherCheckbox}
                  >
                    <span className={`input-checkbox-icon${answer.otherText ? ' input-checkbox-icon-checked' : ''}`}>
                      <SvgIcon
                        name={answer.otherText ? 'selectedTrue' : 'selectedFlase'}
                        className={`input-checkbox-icon-svg${answer.otherText ? ' text-brand-primary' : ''}`}
                      />
                    </span>
                  </span>
                ) : (
                  checkIcon
                )}
                <input
                  type="text"
                  placeholder="その他を入力"
                  className="input-parts-field flex-1 h-9"
                  value={otherDisplayValue}
                  onFocus={handleOtherFocus}
                  onChange={(event) => handleOtherInput(event.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 items-center justify-end w-full">
              <Button variant="outline" intent="cancel" onClick={handleSkip}>
                スキップ
              </Button>
              <Button variant={isLastQuestion ? 'solid' : 'outline'} onClick={() => advance(answers)}>
                {isLastQuestion ? '送信' : '次へ'}
              </Button>
            </div>
          </div>

          <p className="text-note text-text-medium text-center">
            回答は必ずしも正しいとは限りません。重要な情報は確認するようにしてください。
          </p>
        </div>
      </div>
    </div>
  );
}
