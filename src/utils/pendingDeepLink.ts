let pending: string | null = null;

export function setPendingDeepLink(pathname: string): void {
  pending = pathname;
}

export function consumePendingDeepLink(): string | null {
  const href = pending;
  pending = null;
  return href;
}
