import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PASSWORD_MIN } from '@shared/schemas';
import { api } from '../lib/api';
import { clearAppBadge } from '../lib/badge';
import {
  deniedHelpText,
  disablePush,
  enablePush,
  getPushStatus,
  pushSupported,
  testPush,
  type PushStatus,
} from '../lib/push';
import { qk } from '../lib/queries';
import { useSession } from '../lib/session';
import { THEMES, useTheme } from '../lib/theme';
import { ErrorNote, Sheet } from './ui';

function pushCopy(status: PushStatus): string {
  switch (status) {
    case 'unsupported':
      return 'This browser cannot receive push notifications.';
    case 'unavailable':
      return 'Notifications are not configured on the server yet.';
    case 'needs-install':
      return 'On iPhone, notifications only work from the Home Screen app. Tap Share → Add to Home Screen, open Hory from the new icon, then enable notifications here.';
    case 'denied':
      return deniedHelpText();
    case 'default':
      return 'Get pinged for new chat messages, votes and places — even with the app closed.';
    case 'unsubscribed':
      return 'Permission is granted, but this device is not subscribed yet.';
    case 'subscribed':
      return 'This device gets alerts for new messages, votes and places.';
  }
}

export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>(
    pushSupported() ? 'default' : 'unsupported',
  );
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refresh = () => {
      void getPushStatus().then((status) => {
        if (!cancelled) setPushStatus(status);
      });
    };
    refresh();
    // After the user flips the OS/browser toggle, re-read when they come back.
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [open]);

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
      clearAppBadge();
      queryClient.setQueryData(qk.me, null);
      queryClient.clear();
    },
  });

  const togglePush = async () => {
    setPushBusy(true);
    setPushNote(null);
    try {
      const nextStatus = pushStatus === 'subscribed' ? await disablePush() : await enablePush();
      setPushStatus(nextStatus);
      if (nextStatus === 'subscribed') setPushNote('Notifications enabled on this device.');
      if (nextStatus === 'unsubscribed') setPushNote('Notifications turned off on this device.');
      if (nextStatus === 'needs-install') setPushNote(pushCopy('needs-install'));
      if (nextStatus === 'denied') setPushNote(deniedHelpText());
    } catch (error) {
      setPushNote(error instanceof Error ? error.message : 'Could not update notifications');
    } finally {
      setPushBusy(false);
    }
  };

  const sendTest = async () => {
    setPushBusy(true);
    setPushNote(null);
    try {
      const sent = await testPush();
      if (sent > 0) setPushNote('Testovací oznámení odesláno.');
      else setPushNote('Nepodařilo se odeslat. Vypni oznámení a zapni je znovu.');
    } catch (error) {
      setPushNote(error instanceof Error ? error.message : 'Test selhal');
    } finally {
      setPushBusy(false);
    }
  };

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
          <h3 className="mb-1 font-medium">Notifications</h3>
          <p className="mb-3 text-sm text-ink-soft">{pushCopy(pushStatus)}</p>
          <div className="flex flex-col gap-2">
            {pushStatus !== 'needs-install' && (
              <button
                type="button"
                className={pushStatus === 'subscribed' ? 'btn-ghost w-full' : 'btn-primary w-full'}
                disabled={
                  pushBusy ||
                  pushStatus === 'unsupported' ||
                  pushStatus === 'unavailable' ||
                  pushStatus === 'denied'
                }
                onClick={() => void togglePush()}
              >
                {pushStatus === 'subscribed' ? 'Turn off on this device' : 'Enable notifications'}
              </button>
            )}
            {pushStatus === 'subscribed' && (
              <button
                type="button"
                className="btn-ghost w-full"
                disabled={pushBusy}
                onClick={() => void sendTest()}
              >
                Send a test notification
              </button>
            )}
          </div>
          {pushNote && <p className="mt-2 text-sm text-ink-soft">{pushNote}</p>}
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
