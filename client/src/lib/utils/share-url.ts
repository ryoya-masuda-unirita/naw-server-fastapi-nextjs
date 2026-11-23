/** 共有 URL（`.../chat/share/{shareId}`）から shareId を取り出す（移植元 core/utils/share-url.util.ts） */
export function parseShareIdFromShareUrl(shareUrl: string | null | undefined): string | null {
  if (!shareUrl) {
    return null;
  }

  const match = shareUrl.match(/\/chat\/share\/([^/?#]+)/);
  return match?.[1] ?? null;
}

/** 共有 URL（`{origin}/chat/share/{shareId}`）を作る（移植元 core/utils/share-url.util.ts） */
export function buildShareUrl(shareId: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/chat/share/${shareId}`;
}
