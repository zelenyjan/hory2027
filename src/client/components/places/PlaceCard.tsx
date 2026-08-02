import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Accommodation } from '@shared/types';
import { api } from '../../lib/api';
import { formatPrice, formatRelative } from '../../lib/format';
import { placeHeading, placeImageUrl } from '../../lib/places';
import { useSession } from '../../lib/session';
import { ConfirmButton } from '../ui';
import { ProviderBadge } from './ProviderBadge';

export function PlaceCard({
  place,
  compact = false,
  hideImage = false,
}: {
  place: Accommodation;
  /** Hide the Detail link when already on the detail page. */
  compact?: boolean;
  hideImage?: boolean;
}) {
  const me = useSession();
  const queryClient = useQueryClient();
  const canDelete = place.userId === me.id || me.role === 'admin';
  const heading = placeHeading(place);
  const imageUrl = hideImage ? null : placeImageUrl(place);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['accommodations'] });
    void queryClient.invalidateQueries({ queryKey: ['accommodation'] });
    void queryClient.invalidateQueries({ queryKey: ['locations'] });
  };

  const rate = useMutation({
    mutationFn: (value: 1 | -1 | 0) => api.rate(place.id, value),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAccommodation(place.id),
    onSuccess: invalidate,
  });

  const toggle = (value: 1 | -1) => rate.mutate(place.myRating === value ? 0 : value);

  return (
    <article className="card overflow-hidden transition-shadow hover:shadow-lg">
      {imageUrl && (
        <Link to={`/places/${place.id}`} className="block aspect-[16/9] overflow-hidden bg-surface-2">
          <img
            src={imageUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        </Link>
      )}

      <div className="p-4">
        <header className="flex items-start gap-3">
          <ProviderBadge provider={place.provider} url={place.url} />
          <div className="min-w-0 flex-1">
            <h3 className="leading-tight font-semibold wrap-anywhere">
              <Link
                to={`/places/${place.id}`}
                className="underline-offset-2 hover:text-brand hover:underline"
              >
                {heading}
              </Link>
            </h3>
            <p className="text-xs text-ink-soft">
              📍 {place.location}
              {place.title && place.ogTitle && place.title !== place.ogTitle
                ? ` · ${place.ogTitle}`
                : ''}
              {' · '}
              {place.userName} · {formatRelative(place.createdAt)}
            </p>
          </div>
          <p className="shrink-0 text-lg leading-tight font-bold text-accent tabular-nums">
            {formatPrice(place.totalPriceCzk)}
          </p>
        </header>

        {place.ogDescription && (
          <p className="mt-2 line-clamp-2 text-sm text-ink-soft wrap-anywhere">{place.ogDescription}</p>
        )}
        {place.comment && (
          <p className="mt-2 text-sm wrap-anywhere text-ink-soft">{place.comment}</p>
        )}

        <footer className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            title={place.up.map((u) => u.name).join(', ') || undefined}
            onClick={() => toggle(1)}
            disabled={rate.isPending}
            className={`rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95 ${
              place.myRating === 1
                ? 'border-good bg-good/10 font-medium text-good'
                : 'border-line hover:border-good/50'
            }`}
          >
            👍 {place.up.length}
          </button>
          <button
            type="button"
            title={place.down.map((u) => u.name).join(', ') || undefined}
            onClick={() => toggle(-1)}
            disabled={rate.isPending}
            className={`rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95 ${
              place.myRating === -1
                ? 'border-bad bg-bad/10 font-medium text-bad'
                : 'border-line hover:border-bad/50'
            }`}
          >
            👎 {place.down.length}
          </button>

          {!compact && (
            <Link to={`/places/${place.id}`} className="btn-ghost px-3 py-1.5 text-sm">
              Detail
              {place.commentCount > 0 ? ` · 💬 ${place.commentCount}` : ''}
            </Link>
          )}

          <a
            href={place.url}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            Otevřít ↗
          </a>

          <span className="flex-1" />
          {canDelete && (
            <ConfirmButton
              label="Smazat"
              confirmLabel={
                place.commentCount > 0
                  ? `Smazat toto místo? Smaže se i ${place.commentCount} komentář${place.commentCount === 1 ? '' : place.commentCount >= 2 && place.commentCount <= 4 ? 'e' : 'ů'}.`
                  : 'Smazat toto místo?'
              }
              onConfirm={() => remove.mutate()}
              pending={remove.isPending}
              className="btn-ghost px-3 py-1.5 text-xs text-bad hover:border-bad/40 hover:bg-bad/10"
            />
          )}
        </footer>
      </div>
    </article>
  );
}
