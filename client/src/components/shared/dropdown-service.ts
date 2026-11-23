/**
 * 移植元 core/services/dropdown.service.ts。
 * 開いているドロップダウンを 1 つに保ち、画面のどこかをクリックしたら閉じる（見える backdrop は置かない）。
 *
 * 使い方: 開くときに `dropdownService.open(閉じる関数)`、自分で閉じたときに `notifyClosed()`。
 * トグルボタンは `event.stopPropagation()` を呼ぶこと（呼ばないと document の click で直後に閉じる）。
 */

/** 移植元と同じく md ブレークポイント未満でだけ背面の暗幕（#dropdown-backdrop）を出す */
const BACKDROP_MAX_WIDTH = 768;
export const BACKDROP_ID = 'dropdown-backdrop';

class DropdownService {
  private closeCallback: (() => void) | null = null;
  private listening = false;

  /**
   * 移植元はルートのサービス生成時に document の click を購読する。
   * React ではモジュール読み込み時に document がない場合（テストの環境切り替え等）があるので、最初の open で購読する。
   */
  private ensureListener(): void {
    if (this.listening || typeof document === 'undefined') return;
    document.addEventListener('click', () => this.closeAll());
    this.listening = true;
  }

  private showBackdrop(): void {
    if (window.innerWidth < BACKDROP_MAX_WIDTH) {
      document.getElementById(BACKDROP_ID)?.classList.add('is-visible');
    }
  }

  private hideBackdrop(): void {
    document.getElementById(BACKDROP_ID)?.classList.remove('is-visible');
  }

  /** ドロップダウンが開いたことを通知する。前に開いていたものは閉じる */
  open(closeCallback: () => void): void {
    this.ensureListener();
    if (this.closeCallback) {
      this.closeCallback();
    }
    this.closeCallback = closeCallback;
    this.showBackdrop();
  }

  /** 開いているドロップダウンを閉じる */
  closeAll(): void {
    if (this.closeCallback) {
      this.closeCallback();
      this.closeCallback = null;
    }
    this.hideBackdrop();
  }

  /** 部品が自分で閉じたとき（項目クリックなど）に呼ぶ */
  notifyClosed(): void {
    this.closeCallback = null;
    this.hideBackdrop();
  }
}

export const dropdownService = new DropdownService();
