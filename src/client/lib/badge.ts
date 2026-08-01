/** Keep the installed-app icon badge in sync with unread chat messages. */
export function setAppBadge(count: number): void {
  const next = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if ('setAppBadge' in navigator) {
    const nav = navigator as Navigator & {
      setAppBadge: (n?: number) => Promise<void>;
      clearAppBadge: () => Promise<void>;
    };
    void (next > 0 ? nav.setAppBadge(next) : nav.clearAppBadge()).catch(() => {});
  }
  void navigator.serviceWorker?.ready
    .then((reg) => reg.active?.postMessage({ type: 'badge', count: next }))
    .catch(() => {});
}

export function clearAppBadge(): void {
  setAppBadge(0);
}
