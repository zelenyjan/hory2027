/** D1 stores `datetime('now')` as "YYYY-MM-DD HH:MM:SS" in UTC, without a zone marker. */
export function parseSqlDate(value: string): Date {
  return new Date(/[TZ]/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
}

const price = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const time = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('cs-CZ', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

export const formatPrice = (czk: number) => `${price.format(czk)} Kč`;
export const formatTime = (value: string) => time.format(parseSqlDate(value));

export function formatDay(value: string): string {
  const date = parseSqlDate(value);
  const today = new Date();
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return 'Dnes';
  if (days === 1) return 'Včera';
  return dayLabel.format(date);
}

export function formatRelative(value: string | null): string {
  if (!value) return 'nikdy';
  const diff = Date.now() - parseSqlDate(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'právě teď';
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'včera';
  return `před ${days} dny`;
}

export function splitLinks(text: string): { text: string; href?: string }[] {
  return text
    .split(/(https?:\/\/[^\s<]+)/g)
    .filter((part) => part.length > 0)
    .map((part) => (/^https?:\/\//.test(part) ? { text: part, href: part } : { text: part }));
}
