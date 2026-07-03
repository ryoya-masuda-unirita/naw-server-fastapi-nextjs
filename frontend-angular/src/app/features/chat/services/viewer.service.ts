import { inject, Injectable, signal } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import {
  ViewerContentResponse,
  ViewerListItem,
} from '@core/constants/mock-data/viewer-content.mock';

@Injectable({ providedIn: 'root' })
export class ViewerService {
  readonly markdownContent = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  readonly viewers = signal<ViewerListItem[]>([]);
  readonly isLoadingList = signal<boolean>(false);
  readonly listLoadError = signal<boolean>(false);
  readonly contentLoadError = signal<boolean>(false);

  /** ビューワーに表示中のライブラリ（選択状態の単一ソース） */
  readonly activeLibrary = signal<ViewerListItem | null>(null);

  /** createLibrary 送信中の SSE ストリーミング状態 */
  readonly isLibraryStreaming = signal<boolean>(false);
  readonly streamingLibraryTitle = signal<string>('');
  readonly streamingRoomId = signal<string | null>(null);

  /**
   * 表示中コンテンツの世代トークン。begin/detach/select のたびに進み、
   * 古いストリームの append/end や滞留中の GET 応答を無効化する。
   */
  private libraryStreamToken = 0;

  /** loadList の世代カウンター。連続ルーム切替時の古いリスト応答を破棄する */
  private listRequestToken = 0;

  private readonly api = inject(ApiClientService);

  beginLibraryStream(roomId: string | null): number {
    this.libraryStreamToken += 1;
    this.streamingRoomId.set(roomId);
    this.isLibraryStreaming.set(true);
    this.streamingLibraryTitle.set('');
    this.markdownContent.set('');
    return this.libraryStreamToken;
  }

  appendLibraryTitleDelta(token: number, text: string): void {
    if (token !== this.libraryStreamToken) return;
    this.streamingLibraryTitle.update((title) => title + text);
  }

  appendLibraryContentDelta(token: number, text: string): void {
    if (token !== this.libraryStreamToken) return;
    this.markdownContent.update((content) => content + text);
  }

  async endLibraryStream(token: number, roomId?: string): Promise<void> {
    if (token !== this.libraryStreamToken) return;
    // await 前にキャプチャ: 待機中に beginLibraryStream が呼ばれても上書きされない
    // サーバーは永続化時にタイトルを strip するが、ストリーム差分には末尾改行が残るためトリムして照合する
    const title = this.streamingLibraryTitle().trim();
    this.isLibraryStreaming.set(false);
    this.streamingRoomId.set(null);
    if (roomId) {
      // ストリーム済み内容を上書きしないよう自動選択は抑止し、タイトル照合で選択状態のみ同期する
      await this.loadList(roomId, { autoSelect: false });
    }
    // roomId の有無に関わらずタイトル照合で選択状態を同期する（null は設定しない）
    const match = this.viewers().find((v) => v.title.trim() === title);
    if (match) {
      this.activeLibrary.set(match);
    }
  }

  /** ストリーム失敗時: 表示の所有権を放棄し、選択中ライブラリのサーバー上の内容へ復元する */
  async abortLibraryStream(token: number): Promise<void> {
    if (token !== this.libraryStreamToken) return;
    this.detachLibraryStream();
    await this.loadContent(this.activeLibrary()?.id);
  }

  /** ストリームから表示の所有権を剥奪する（以降の append/end は無効になる） */
  private detachLibraryStream(): void {
    this.libraryStreamToken += 1;
    this.isLibraryStreaming.set(false);
    this.streamingRoomId.set(null);
  }

  /** ライブラリを選択してコンテンツを表示する */
  selectLibrary(item: ViewerListItem): void {
    if (this.isLibraryStreaming()) {
      // ユーザーの明示的な選択が表示の所有権を取る。
      // detachLibraryStream はトークンを +1 するため、ここでは追加インクリメント不要
      this.detachLibraryStream();
    } else if (this.activeLibrary()?.id === item.id) {
      return;
    } else {
      // 非ストリーミング時のみここでトークンを進める（stale-GET ガード）
      this.libraryStreamToken += 1;
    }
    this.activeLibrary.set(item);
    void this.loadContent(item.id);
  }

  /**
   * 単一ライブラリを指定してその内容をビューワーに表示する。
   * ライブラリ詳細画面（/library/:id）のように、ルームではなく
   * 個別ライブラリ ID から直接コンテンツを取得する用途で使う。
   */
  async showLibrary(library: ViewerListItem): Promise<void> {
    // 進行中のストリームや滞留中の GET があれば表示の所有権を剥奪する
    this.detachLibraryStream();
    this.viewers.set([library]);
    this.activeLibrary.set(library);
    await this.loadContent(library.id);
  }

  async loadList(roomId: string, opts: { autoSelect?: boolean } = {}): Promise<void> {
    // 別ルームへの遷移: 旧ルームのストリームは表示の所有権を失う
    if (this.isLibraryStreaming() && this.streamingRoomId() !== roomId) {
      this.detachLibraryStream();
    }

    this.listRequestToken += 1;
    const tokenAtStart = this.listRequestToken;
    this.isLoadingList.set(true);
    this.listLoadError.set(false);
    this.contentLoadError.set(false);
    try {
      const response = await this.api.get<{ data: ViewerListItem[] }>(
        API_PATHS.VIEWER.DETAIL_LIST(roomId),
      );
      if (this.listRequestToken !== tokenAtStart) return;
      this.viewers.set(response.data);
    } catch {
      if (this.listRequestToken !== tokenAtStart) return;
      this.viewers.set([]);
      this.listLoadError.set(true);
    } finally {
      if (this.listRequestToken === tokenAtStart) {
        this.isLoadingList.set(false);
      }
    }

    if (opts.autoSelect === false || this.isLibraryStreaming()) return;

    const list = this.viewers();
    const active = this.activeLibrary();
    if (active && list.some((v) => v.id === active.id)) return;

    if (list.length === 0) {
      this.activeLibrary.set(null);
      this.libraryStreamToken += 1;
      this.markdownContent.set('');
      return;
    }
    // デフォルトは最新（サーバーは作成日時の昇順で返すため末尾）のライブラリ
    const latest = list[list.length - 1];
    this.libraryStreamToken += 1;
    this.activeLibrary.set(latest);
    void this.loadContent(latest.id);
  }

  private async loadContent(libraryId: string | undefined): Promise<void> {
    if (!libraryId) {
      this.markdownContent.set('');
      return;
    }

    const tokenAtStart = this.libraryStreamToken;
    this.isLoading.set(true);
    this.contentLoadError.set(false);
    try {
      const response = await this.api.get<ViewerContentResponse>(
        API_PATHS.VIEWER.CONTENT(libraryId),
      );
      // GET 滞留中に新しいストリームや選択が始まった場合は古い応答を破棄する
      if (this.libraryStreamToken !== tokenAtStart) return;
      this.markdownContent.set(response.data);
      this.applyTitleFromContentResponse(libraryId, response.title);
    } catch {
      if (this.libraryStreamToken === tokenAtStart) {
        this.markdownContent.set('');
        this.contentLoadError.set(true);
      }
    } finally {
      if (this.libraryStreamToken === tokenAtStart) {
        this.isLoading.set(false);
      }
    }
  }

  updateLibraryTitle(libraryId: string, title: string): void {
    this.viewers.update((list) => list.map((v) => (v.id === libraryId ? { ...v, title } : v)));
    const active = this.activeLibrary();
    if (active?.id === libraryId) {
      this.activeLibrary.set({ ...active, title });
    }
  }

  private applyTitleFromContentResponse(libraryId: string, title: string | undefined): void {
    const resolvedTitle = title ?? '';
    this.viewers.update((list) =>
      list.map((v) => (v.id === libraryId ? { ...v, title: resolvedTitle } : v)),
    );
    const active = this.activeLibrary();
    if (active?.id === libraryId) {
      this.activeLibrary.set({ ...active, title: resolvedTitle });
    }
  }
}
