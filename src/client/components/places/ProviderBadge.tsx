import type { Provider } from '@shared/types';

const STYLES: Record<Provider, { label: string; className: string }> = {
  booking: { label: 'B.', className: 'bg-[#003b95] text-white' },
  airbnb: { label: 'A', className: 'bg-[#ff385c] text-white' },
  other: { label: '↗', className: 'bg-surface border border-line text-ink-soft' },
};

const NAMES: Record<Provider, string> = {
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  other: 'Externí odkaz',
};

export function ProviderBadge({ provider, url }: { provider: Provider; url: string }) {
  const style = STYLES[provider];
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={`Otevřít na ${NAMES[provider]}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${style.className}`}
    >
      {style.label}
    </a>
  );
}
