import { pick, type Rng } from './rng.ts';

/**
 * 入力欄に入れる境界値・異常値。
 * どれも「正しい値」ではない。正しい値での操作は人が書く E2E テストの役目で、
 * このハーネスは異常な入力で画面やサーバーが壊れないかを見る。
 */

export const INPUT_KINDS = [
  'empty',
  'whitespace',
  'max',
  'maxPlus1',
  'symbols',
  'markup',
  'emoji',
  'negative',
  'long',
  'mixed',
] as const;

export type InputKind = (typeof INPUT_KINDS)[number];

export const INPUT_KIND_LABELS: Record<InputKind, string> = {
  empty: '空',
  whitespace: '空白だけ',
  max: '最大文字数',
  maxPlus1: '最大文字数+1',
  symbols: '記号',
  markup: 'HTML 断片',
  emoji: '絵文字',
  negative: '負の数',
  long: '長い文字列',
  mixed: '種から決まる混合',
};

const SYMBOLS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const MARKUP = '<script>alert("e2e")</script><b>"&\'</b>';
const EMOJI = '😀👨‍👩‍👧‍👦🍣🇯🇵';
const LONG_CHAR = 'あ';
const FILL_CHAR = 'a';
/** 32 bit 符号付き整数の最大値。DB の integer 列の境界を突くため。 */
const INT32_MAX = 2147483647;

/** 文字で値を入れられる入力欄の種類。 */
const TEXT_LIKE_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'textarea', '']);

export interface FieldInfo {
  /** input の type（textarea・select はタグ名）。 */
  inputType: string;
  /** maxlength 属性。ないときは null。 */
  maxLength: number | null;
  /** select の選択肢の value。 */
  options?: string[];
}

export interface InputOptions {
  defaultMaxLength: number;
  longLength: number;
}

export function isInputKind(value: string): value is InputKind {
  return (INPUT_KINDS as readonly string[]).includes(value);
}

/**
 * 種類と入力欄から値を作る。入れられない組み合わせ（日付欄に文字など）は null。
 * mixed は欄ごとに rng で他の種類を選ぶ。
 */
export function valueFor(kind: InputKind, field: FieldInfo, options: InputOptions, rng: Rng): string | null {
  if (kind === 'mixed') {
    const concrete = INPUT_KINDS.filter((k) => k !== 'mixed');
    return valueFor(pick(concrete, rng), field, options, rng);
  }
  if (field.inputType === 'select') return selectValue(kind, field.options ?? [], rng);
  if (field.inputType === 'number') return numberValue(kind);
  if (!TEXT_LIKE_TYPES.has(field.inputType)) return kind === 'empty' ? '' : null;

  const max = field.maxLength ?? options.defaultMaxLength;
  switch (kind) {
    case 'empty':
      return '';
    case 'whitespace':
      return '   ';
    case 'max':
      return FILL_CHAR.repeat(max);
    case 'maxPlus1':
      return FILL_CHAR.repeat(max + 1);
    case 'symbols':
      return SYMBOLS;
    case 'markup':
      return MARKUP;
    case 'emoji':
      return EMOJI;
    case 'negative':
      return '-1';
    case 'long':
      return LONG_CHAR.repeat(options.longLength);
  }
}

/** number の欄は数として解釈できる文字列しか受け付けないため、種類ごとに数の境界値に置き換える。 */
function numberValue(kind: Exclude<InputKind, 'mixed'>): string {
  switch (kind) {
    case 'empty':
    case 'whitespace':
      return '';
    case 'max':
      return String(INT32_MAX);
    case 'maxPlus1':
      return String(INT32_MAX + 1);
    case 'symbols':
      // 指数表記。数の欄が受け付ける記号の組み合わせ（範囲外の 1e309 はブラウザが入力を拒む）
      return '1e3';
    case 'markup':
      return '0.000001';
    case 'emoji':
      return '0';
    case 'negative':
      return '-1';
    case 'long':
      return `1${'0'.repeat(40)}`;
  }
}

function selectValue(kind: Exclude<InputKind, 'mixed'>, options: string[], rng: Rng): string | null {
  if (options.length === 0) return null;
  if (kind === 'empty') return options[0];
  if (kind === 'max' || kind === 'maxPlus1' || kind === 'long') return options[options.length - 1];
  return pick(options, rng);
}
