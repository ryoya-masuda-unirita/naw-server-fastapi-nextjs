/** 共有 URL（`.../chat/share/{shareId}`）から shareId を取り出す（移植元 core/utils/share-url.util.ts） */
export function parseShareIdFromShareUrl(shareUrl: string | null | undefined): string | null {
  if (!shareUrl) {
    return null;
  }

  const match = shareUrl.match(/\/chat\/share\/([^/?#]+)/);
  return match?.[1] ?? null;
}
