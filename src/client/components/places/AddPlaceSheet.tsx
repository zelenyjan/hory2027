import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries';
import { COMMENT_MAX, TITLE_MAX } from '@shared/schemas';
import { ErrorNote, Sheet } from '../ui';

export function AddPlaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.locations, enabled: open });
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [comment, setComment] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createAccommodation({
        url: url.trim(),
        title: title.trim() || undefined,
        priceCzk: Number(price),
        location: location.trim(),
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accommodations'] });
      void queryClient.invalidateQueries({ queryKey: qk.locations });
      setUrl('');
      setTitle('');
      setPrice('');
      setLocation('');
      setComment('');
      onClose();
    },
  });

  return (
    <Sheet open={open} title="Přidat místo" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Název (volitelné)</span>
          <input
            className="field"
            maxLength={TITLE_MAX}
            placeholder="Chalet Alpenrose — jinak zkusíme načíst z odkazu"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <span className="mt-1 block text-xs text-ink-soft">
            Název a fotka z Bookingu/Airbnb se načtou automaticky, pokud to stránka dovolí.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Odkaz</span>
          <input
            className="field"
            type="url"
            inputMode="url"
            placeholder="https://www.booking.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Celková cena (Kč)</span>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="48000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Lokalita</span>
            <input
              className="field"
              list="known-locations"
              placeholder="Sölden"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
            <datalist id="known-locations">
              {locations.data?.map((entry) => (
                <option key={entry.location} value={entry.location} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Poznámka (volitelné)</span>
          <textarea
            className="min-h-20 field resize-y"
            maxLength={COMMENT_MAX}
            placeholder="Termíny, počet lůžek, vzdálenost k vleku…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>

        <ErrorNote error={create.error} />
        <button className="btn-primary w-full" disabled={create.isPending}>
          Přidat na seznam
        </button>
      </form>
    </Sheet>
  );
}
