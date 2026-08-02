import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PASSWORD_MIN } from '@shared/schemas';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { ErrorNote } from '../components/ui';

/** The admin signs in once with the bootstrap secret and must replace it before going further. */
export function SetPasswordGate() {
  const queryClient = useQueryClient();
  const [next, setNext] = useState('');

  const save = useMutation({
    mutationFn: () => api.setPassword(next),
    onSuccess: (me) => queryClient.setQueryData(qk.me, me),
  });

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm card p-7">
        <h1 className="gradient-text text-2xl font-bold tracking-tight">Zvol si heslo</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Přihlásil ses bootstrap heslem. Nastav si vlastní heslo — tím dokončíš založení admin
          účtu a bootstrap heslo přestane fungovat.
        </p>

        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            placeholder={`Nové heslo (min. ${PASSWORD_MIN} znaky)`}
            minLength={PASSWORD_MIN}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <ErrorNote error={save.error} />
          <button className="btn-primary w-full" disabled={save.isPending}>
            Uložit a pokračovat
          </button>
        </form>
      </div>
    </div>
  );
}
