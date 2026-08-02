import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotifyPrefs } from '@shared/types';
import { displayName } from '@shared/names';
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

const NOTIFY_OPTIONS: { key: keyof NotifyPrefs; label: string; hint: string }[] = [
  { key: 'messages', label: 'Zprávy', hint: 'nové zprávy ve chatu' },
  { key: 'mentions', label: 'Zmínky (@)', hint: 'když tě někdo označí' },
  { key: 'votes', label: 'Hlasování', hint: 'nové ankety a hlasy' },
  { key: 'places', label: 'Místa', hint: 'nové ubytování' },
  { key: 'links', label: 'Odkazy', hint: 'připnuté weby a soubory' },
];

function pushCopy(status: PushStatus): string {
  switch (status) {
    case 'unsupported':
      return 'Tento prohlížeč neumí push oznámení.';
    case 'unavailable':
      return 'Oznámení zatím nejsou na serveru nastavená.';
    case 'needs-install':
      return 'Na iPhonu fungují oznámení jen z appky na ploše. Klepni Sdílet → Přidat na plochu, otevři Hory z nové ikony a pak je tu zapni.';
    case 'denied':
      return deniedHelpText();
    case 'default':
      return 'Zapni odběr na tomto zařízení a níže si vyber, co chceš dostávat.';
    case 'unsubscribed':
      return 'Oprávnění je udělené, ale toto zařízení ještě není přihlášené k odběru.';
    case 'subscribed':
      return 'Toto zařízení je přihlášené. Co přesně dostaneš řídíš zaškrtávátky níže.';
  }
}

export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);
  const [visibleName, setVisibleName] = useState(user.visibleName ?? '');
  const [nameDone, setNameDone] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>(
    pushSupported() ? 'default' : 'unsupported',
  );
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [notify, setNotify] = useState<NotifyPrefs>(user.notify);

  useEffect(() => {
    if (!open) return;
    setNotify(user.notify);
    setVisibleName(user.visibleName ?? '');
    setNameDone(false);
    let cancelled = false;
    const refresh = () => {
      void getPushStatus().then((status) => {
        if (!cancelled) setPushStatus(status);
      });
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [open, user.notify, user.visibleName]);

  const saveProfile = useMutation({
    mutationFn: () => api.updateProfile(visibleName.trim() || null),
    onSuccess: (me) => {
      queryClient.setQueryData(qk.me, me);
      setVisibleName(me.visibleName ?? '');
      setNameDone(true);
      void queryClient.invalidateQueries({ queryKey: qk.members });
      void queryClient.invalidateQueries({ queryKey: qk.messages });
      void queryClient.invalidateQueries({ queryKey: qk.reads });
      void queryClient.invalidateQueries({ queryKey: qk.polls });
      void queryClient.invalidateQueries({ queryKey: qk.accommodations() });
      void queryClient.invalidateQueries({ queryKey: qk.pins });
    },
  });

  const savePassword = useMutation({
    mutationFn: () => api.setPassword(next, current || undefined),
    onSuccess: (me) => {
      queryClient.setQueryData(qk.me, me);
      setCurrent('');
      setNext('');
      setDone(true);
    },
  });

  const saveNotify = useMutation({
    mutationFn: (prefs: NotifyPrefs) => api.updateNotify(prefs),
    onSuccess: (me) => {
      queryClient.setQueryData(qk.me, me);
      setNotify(me.notify);
      setPushNote('Nastavení oznámení uloženo.');
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
      if (nextStatus === 'subscribed') setPushNote('Oznámení na tomto zařízení jsou zapnutá.');
      if (nextStatus === 'unsubscribed') setPushNote('Oznámení na tomto zařízení jsou vypnutá.');
      if (nextStatus === 'needs-install') setPushNote(pushCopy('needs-install'));
      if (nextStatus === 'denied') setPushNote(deniedHelpText());
    } catch (error) {
      setPushNote(error instanceof Error ? error.message : 'Oznámení se nepodařilo upravit');
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
    <Sheet open={open} title={displayName(user)} onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="mb-1 font-medium">Zobrazované jméno</h3>
          <p className="mb-3 text-sm text-ink-soft">
            Tak tě uvidí ostatní ve chatu. Přihlášení pořád běží přes{' '}
            <span className="font-medium text-ink">{user.name}</span>.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setNameDone(false);
              saveProfile.mutate();
            }}
          >
            <input
              className="field"
              type="text"
              maxLength={80}
              autoComplete="nickname"
              placeholder={user.name}
              value={visibleName}
              onChange={(e) => {
                setVisibleName(e.target.value);
                setNameDone(false);
              }}
            />
            <ErrorNote error={saveProfile.error} />
            {nameDone && <p className="text-sm text-good">Jméno uloženo.</p>}
            <button className="btn-primary w-full" disabled={saveProfile.isPending}>
              Uložit jméno
            </button>
          </form>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="mb-2 font-medium">Vzhled</h3>
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
          <h3 className="mb-1 font-medium">Oznámení</h3>
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
                {pushStatus === 'subscribed' ? 'Vypnout na tomto zařízení' : 'Zapnout oznámení'}
              </button>
            )}
            {pushStatus === 'subscribed' && (
              <button
                type="button"
                className="btn-ghost w-full"
                disabled={pushBusy}
                onClick={() => void sendTest()}
              >
                Poslat zkušební oznámení
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Co chci dostávat</p>
            <p className="text-xs text-ink-soft">
              Platí pro všechna tvá zařízení. Zmínky můžou přijít i když máš vypnuté běžné zprávy.
            </p>
            {NOTIFY_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-brand)]"
                  checked={notify[option.key]}
                  onChange={(e) => {
                    const nextPrefs = { ...notify, [option.key]: e.target.checked };
                    setNotify(nextPrefs);
                    saveNotify.mutate(nextPrefs);
                  }}
                />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="block text-xs text-ink-soft">{option.hint}</span>
                </span>
              </label>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => {
                  const nextPrefs: NotifyPrefs = {
                    messages: true,
                    mentions: true,
                    votes: true,
                    places: true,
                    links: true,
                  };
                  setNotify(nextPrefs);
                  saveNotify.mutate(nextPrefs);
                }}
              >
                Vše
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => {
                  const nextPrefs: NotifyPrefs = {
                    messages: false,
                    mentions: true,
                    votes: false,
                    places: false,
                    links: false,
                  };
                  setNotify(nextPrefs);
                  saveNotify.mutate(nextPrefs);
                }}
              >
                Jen zmínky
              </button>
            </div>
            <ErrorNote error={saveNotify.error} />
          </div>
          {pushNote && <p className="mt-2 text-sm text-ink-soft">{pushNote}</p>}
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="mb-1 font-medium">{user.hasPassword ? 'Změnit heslo' : 'Nastavit heslo'}</h3>
          <p className="mb-3 text-sm text-ink-soft">
            {user.hasPassword
              ? 'Pak se můžeš přihlásit jménem a heslem.'
              : `Volitelné — pozvánkový odkaz funguje dál. Alespoň ${PASSWORD_MIN} znaky.`}
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
                placeholder="Současné heslo"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            )}
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              placeholder="Nové heslo"
              minLength={PASSWORD_MIN}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <ErrorNote error={savePassword.error} />
            {done && <p className="text-sm text-good">Heslo uloženo.</p>}
            <button className="btn-primary w-full" disabled={savePassword.isPending}>
              Uložit heslo
            </button>
          </form>
        </section>

        <section className="border-t border-line pt-5">
          <button
            className="btn-ghost w-full"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            Odhlásit se
          </button>
        </section>
      </div>
    </Sheet>
  );
}
