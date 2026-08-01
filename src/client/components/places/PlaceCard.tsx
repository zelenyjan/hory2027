import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Accommodation } from '@shared/types';
import { api } from '../../lib/api';
import { formatPrice, formatRelative } from '../../lib/format';
import { useSession } from '../../lib/session';
import { ConfirmButton } from '../ui';
import { ProviderBadge } from './ProviderBadge';

export function PlaceCard({ place }: { place: Accommodation }) {
  const me = useSession();
  const queryClient = useQueryClient();
  const canDelete = place.userId === me.id || me.role === 'admin';

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
    <article className="card p-4 transition-shadow hover:shadow-lg">
      <header className="flex items-start gap-3">
        <ProviderBadge provider={place.provider} url={place.url} />
        <div className="min-w-0 flex-1">
          <h3 className="leading-tight font-semibold wrap-anywhere">{place.location}</h3>
          <p className="text-xs text-ink-soft">
            {place.userName} · {formatRelative(place.createdAt)}
          </p>
        </div>
        <p className="shrink-0 text-lg leading-tight font-bold text-accent tabular-nums">
          {formatPrice(place.totalPriceCzk)}
        </p>
      </header>

      {place.comment && <p className="mt-3 text-sm wrap-anywhere text-ink-soft">{place.comment}</p>}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          title={place.up.map((u) => u.name).join(', ')}
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
          title={place.down.map((u) => u.name).join(', ')}
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

        <Link to={`/places/${place.id}`} className="btn-ghost px-3 py-1.5 text-sm">
          💬 {place.commentCount}
        </Link>

        <span className="flex-1" />
        {canDelete && (
          <ConfirmButton
            label="Delete"
            confirmLabel={
              place.commentCount > 0
                ? `Delete this place? This will also delete ${place.commentCount} comment${place.commentCount === 1 ? '' : 's'}.`
                : 'Delete this place?'
            }
            onConfirm={() => remove.mutate()}
            pending={remove.isPending}
            className="btn-ghost px-3 py-1.5 text-xs text-bad hover:border-bad/40 hover:bg-bad/10"
          />
        )}
      </footer>
    </article>
  );
}
