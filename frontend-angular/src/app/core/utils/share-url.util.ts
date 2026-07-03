export function parseShareIdFromShareUrl(shareUrl: string | null | undefined): string | null {
  if (!shareUrl) {
    return null;
  }

  const match = shareUrl.match(/\/chat\/share\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function buildShareUrl(shareId: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/chat/share/${shareId}`;
}
