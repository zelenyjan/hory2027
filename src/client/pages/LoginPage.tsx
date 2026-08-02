import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { ErrorNote } from '../components/ui';

export function LoginPage() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => api.login(name.trim(), password),
    onSuccess: (me) => queryClient.setQueryData(qk.me, me),
  });

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm card p-7">
        <span
          aria-hidden
          className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand to-brand-2 text-3xl shadow-lg shadow-brand/30"
        >
          ❄️
        </span>
        <h1 className="gradient-text text-3xl font-bold tracking-tight">Hory 2027</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Jen pro pozvané. Otevři svůj osobní odkaz, nebo se přihlas níže.
        </p>

        {params.get('error') === 'invite' && (
          <p role="alert" className="mt-4 rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm text-bad">
            Tento pozvánkový odkaz už neplatí. Požádej Greena o nový.
          </p>
        )}

        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <input
            className="field"
            placeholder="Tvoje jméno"
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="field"
            type="password"
            placeholder="Heslo"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <ErrorNote error={login.error} />
          <button className="btn-primary w-full" disabled={login.isPending}>
            Přihlásit se
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          <Link to="/about" className="text-brand underline-offset-2 hover:underline">
            O aplikaci — jak ji používat a nainstalovat
          </Link>
        </p>
      </div>
    </div>
  );
}
