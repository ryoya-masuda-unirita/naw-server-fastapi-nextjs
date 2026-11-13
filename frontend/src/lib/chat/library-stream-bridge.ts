/**
 * チャットの送信・再生成・編集でライブラリ（Markdown のまとめ）を生成するとき、ストリームの途中経過をビューワーへ流すための窓口。
 * 移植元は messages.service が ViewerService を直接呼ぶ。React ではビューワー（#288）の store が未移植のため、
 * 呼び出し側の store がここへ登録する。未登録のうちは途中経過を捨てる。
 */
export interface LibraryStreamBridge {
  /** ストリームを開始し、このストリームを識別するトークンを返す */
  beginLibraryStream: (roomId: string | null) => number;
  appendLibraryTitleDelta: (token: number, text: string) => void;
  appendLibraryContentDelta: (token: number, text: string) => void;
  /** 途中で失敗したとき。表示をサーバー上の内容へ戻す */
  abortLibraryStream: (token: number) => Promise<void> | void;
  endLibraryStream: (token: number, roomId?: string) => Promise<void> | void;
}

let currentBridge: LibraryStreamBridge | null = null;

export function setLibraryStreamBridge(bridge: LibraryStreamBridge | null): void {
  currentBridge = bridge;
}

export function getLibraryStreamBridge(): LibraryStreamBridge | null {
  return currentBridge;
}
