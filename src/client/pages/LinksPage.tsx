import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Pin } from '@shared/types';
import { PIN_FILE_MAX_BYTES, TITLE_MAX } from '@shared/schemas';
import { api } from '../lib/api';
import { formatRelative } from '../lib/format';
import { qk } from '../lib/queries';
import { useSession } from '../lib/session';
import { ConfirmButton, EmptyState, ErrorNote, Sheet, Spinner } from '../components/ui';

function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function PinRow({ pin }: { pin: Pin }) {
  const me = useSession();
  const queryClient = useQueryClient();
  const canDelete = pin.userId === me.id || me.role === 'admin';

  const remove = useMutation({
    mutationFn: () => api.deletePin(pin.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.pins }),
  });

  const href = pin.kind === 'link' ? pin.url! : `/api/pins/${pin.id}/file`;

  return (
    <li className="card flex items-start gap-3 p-3.5">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg"
      >
        {pin.kind === 'link' ? '🔗' : '📄'}
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={href}
          target={pin.kind === 'link' ? '_blank' : undefined}
          rel={pin.kind === 'link' ? 'noreferrer noopener' : undefined}
          download={pin.kind === 'file' ? (pin.fileName ?? true) : undefined}
          className="font-medium wrap-anywhere underline-offset-2 hover:text-brand hover:underline"
        >
          {pin.title}
          {pin.kind === 'link' ? (
            <span aria-hidden className="ml-1 text-xs font-normal text-ink-soft">
              ↗
            </span>
          ) : null}
        </a>
        <p className="mt-0.5 text-xs text-ink-soft wrap-anywhere">
          {pin.kind === 'link'
            ? pin.url
            : `${pin.fileName ?? 'soubor'}${pin.byteSize != null ? ` · ${formatBytes(pin.byteSize)}` : ''}`}
          {' · '}
          {pin.userName} · {formatRelative(pin.createdAt)}
        </p>
      </div>
      {canDelete && (
        <ConfirmButton
          label="Smazat"
          confirmLabel={`Smazat „${pin.title}“?`}
          onConfirm={() => remove.mutate()}
          pending={remove.isPending}
          className="btn-ghost shrink-0 px-3 py-1.5 text-xs text-bad"
        />
      )}
    </li>
  );
}

function AddPinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'link' | 'file'>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setTitle('');
    setUrl('');
    setFile(null);
    setMode('link');
  };

  const createLink = useMutation({
    mutationFn: () => api.createPinLink(title.trim(), url.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.pins });
      reset();
      onClose();
    },
  });

  const createFile = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Vyber soubor');
      return api.createPinFile(title.trim(), file);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.pins });
      reset();
      onClose();
    },
  });

  const pending = createLink.isPending || createFile.isPending;
  const error = createLink.error ?? createFile.error;

  return (
    <Sheet
      open={open}
      title="Přidat odkaz"
      onClose={() => {
        if (!pending) {
          reset();
          onClose();
        }
      }}
    >
      <div className="mb-4 flex gap-1 rounded-xl border border-line/70 bg-surface-2/60 p-1 text-sm">
        <button
          type="button"
          className={`flex-1 rounded-lg px-2.5 py-1.5 transition-all ${
            mode === 'link'
              ? 'bg-linear-to-br from-brand to-brand-2 font-medium text-white shadow-sm'
              : 'text-ink-soft hover:text-ink'
          }`}
          onClick={() => setMode('link')}
        >
          Web
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg px-2.5 py-1.5 transition-all ${
            mode === 'file'
              ? 'bg-linear-to-br from-brand to-brand-2 font-medium text-white shadow-sm'
              : 'text-ink-soft hover:text-ink'
          }`}
          onClick={() => setMode('file')}
        >
          Soubor
        </button>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'link') createLink.mutate();
          else createFile.mutate();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Název</span>
          <input
            className="field"
            maxLength={TITLE_MAX}
            placeholder="Ski pass, mapka, společný drive…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        {mode === 'link' ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Odkaz</span>
            <input
              className="field"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Soubor</span>
            <input
              className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            <span className="mt-1 block text-xs text-ink-soft">
              Max. {Math.floor(PIN_FILE_MAX_BYTES / 1_000_000)} MB
              {file ? ` · vybraný: ${file.name} (${formatBytes(file.size)})` : ''}
            </span>
          </label>
        )}

        <ErrorNote error={error} />
        <button
          className="btn-primary w-full"
          disabled={
            pending ||
            !title.trim() ||
            (mode === 'link' ? !url.trim() : !file) ||
            (file != null && file.size > PIN_FILE_MAX_BYTES)
          }
        >
          {mode === 'link' ? 'Připnout odkaz' : 'Nahrát soubor'}
        </button>
      </form>
    </Sheet>
  );
}

export function LinksPage() {
  const [adding, setAdding] = useState(false);
  const pins = useQuery({ queryKey: qk.pins, queryFn: api.pins });

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="gradient-text text-xl font-bold tracking-tight">Důležité odkazy</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Společné weby a soubory — ski pass, mapky, rezervace…
          </p>
        </div>
        <button className="btn-primary shrink-0 py-2" onClick={() => setAdding(true)}>
          Přidat
        </button>
      </div>

      {pins.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {pins.data?.length === 0 && (
        <EmptyState
          title="Zatím nic nepřipnuto"
          hint="Přidej odkaz na web, nebo nahraj soubor s názvem."
        />
      )}

      <ul className="space-y-2.5">
        {pins.data?.map((pin) => (
          <PinRow key={pin.id} pin={pin} />
        ))}
      </ul>

      <AddPinSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
