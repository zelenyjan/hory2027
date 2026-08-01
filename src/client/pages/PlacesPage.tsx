import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { Accommodation } from '@shared/types';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { parseSqlDate } from '../lib/format';
import { AddPlaceSheet } from '../components/places/AddPlaceSheet';
import { PlaceCard } from '../components/places/PlaceCard';
import { EmptyState, Spinner } from '../components/ui';

const SORTS = {
  score: { label: 'Top rated', compare: (a: Accommodation, b: Accommodation) => b.score - a.score },
  price: {
    label: 'Cheapest',
    compare: (a: Accommodation, b: Accommodation) => a.totalPriceCzk - b.totalPriceCzk,
  },
  newest: {
    label: 'Newest',
    compare: (a: Accommodation, b: Accommodation) =>
      parseSqlDate(b.createdAt).getTime() - parseSqlDate(a.createdAt).getTime(),
  },
} as const;

type SortKey = keyof typeof SORTS;

export function PlacesPage() {
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);

  const location = params.get('location') ?? undefined;
  const sort = (params.get('sort') as SortKey | null) ?? 'score';

  const places = useQuery({
    queryKey: qk.accommodations(location),
    queryFn: () => api.accommodations(location),
  });
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.locations });

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const sorted = places.data
    ? [...places.data].sort(SORTS[sort]?.compare ?? SORTS.score.compare)
    : [];
  const total = locations.data?.reduce((sum, l) => sum + l.count, 0) ?? 0;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="gradient-text text-xl font-bold tracking-tight">Places</h2>
        <button className="btn-primary py-2" onClick={() => setAdding(true)}>
          Add place
        </button>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setParam('location')} className={location ? 'chip' : 'chip-active'}>
          All ({total})
        </button>
        {locations.data?.map((entry) => (
          <button
            key={entry.location}
            onClick={() => setParam('location', entry.location)}
            className={location === entry.location ? 'chip-active' : 'chip'}
          >
            {entry.location} ({entry.count})
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-1 rounded-xl border border-line/70 bg-surface-2/60 p-1 text-sm">
        {(Object.keys(SORTS) as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setParam('sort', key === 'score' ? undefined : key)}
            className={`flex-1 rounded-lg px-2.5 py-1.5 transition-all ${
              sort === key
                ? 'bg-linear-to-br from-brand to-brand-2 font-medium text-white shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {SORTS[key].label}
          </button>
        ))}
      </div>

      {places.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {places.data?.length === 0 && (
        <EmptyState
          title={location ? `Nothing in ${location} yet` : 'No places yet'}
          hint="Paste a Booking or Airbnb link with the total price."
        />
      )}

      <div className="space-y-3">
        {sorted.map((place) => (
          <PlaceCard key={place.id} place={place} />
        ))}
      </div>

      <AddPlaceSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
