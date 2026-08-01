import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { useSession } from '../lib/session';
import { THEMES, useTheme } from '../lib/theme';
import { PASSWORD_MIN } from '@shared/schemas';
import { ErrorNote, Sheet } from './ui';

export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);

  const savePassword = useMutation({
    mutationFn: () => api.setPassword(next, current || undefined),
    onSuccess: (me) => {
      queryClient.setQueryData(qk.me, me);
      setCurrent('');
      setNext('');
      setDone(true);
    },
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.setQueryData(qk.me, null);
      queryClient.clear();
    },
  });

  return (
    <Sheet open={open} title={user.name} onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 font-medium">Theme</h3>
          <div className="flex gap-1 rounded-xl border border-line/70 bg-surface-2/60 p-1 text-sm">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={`flex-1 rounded-lg px-2.5 py-1.5 transition-all ${
                  theme === option.value
                    ? 'bg-linear-to-br from-brand to-brand-2 font-medium text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="mb-1 font-medium">
            {user.hasPassword ? 'Change password' : 'Set a password'}
          </h3>
          <p className="mb-3 text-sm text-ink-soft">
            {user.hasPassword
              ? 'You can sign in with your name and password.'
              : `Optional — your invite link keeps working either way. At least ${PASSWORD_MIN} characters.`}
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setDone(false);
              savePassword.mutate();
            }}
          >
            {user.hasPassword && (
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                placeholder="Current password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            )}
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              minLength={PASSWORD_MIN}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <ErrorNote error={savePassword.error} />
            {done && <p className="text-sm text-good">Password saved.</p>}
            <button className="btn-primary w-full" disabled={savePassword.isPending}>
              Save password
            </button>
          </form>
        </section>

        <section className="border-t border-line pt-5">
          <button
            className="btn-ghost w-full"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            Sign out
          </button>
        </section>
      </div>
    </Sheet>
  );
}
