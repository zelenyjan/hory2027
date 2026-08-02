import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import { displayName } from '@shared/names';
import type { Me } from '@shared/types';
import { api } from '../lib/api';
import { setAppBadge } from '../lib/badge';
import { qk } from '../lib/queries';
import { SessionProvider } from '../lib/session';
import { useTripSocket } from '../lib/useTripSocket';
import { MountainBackdrop } from './MountainBackdrop';
import { ProfileSheet } from './ProfileSheet';
import { Avatar } from './ui';

const TABS = [
  { to: '/', label: 'Chat', icon: '💬', end: true },
  { to: '/voting', label: 'Hlasování', icon: '🗳️', end: false },
  { to: '/places', label: 'Místa', icon: '🏔️', end: false },
  { to: '/links', label: 'Odkazy', icon: '🔗', end: false },
];

export function AppLayout({ user }: { user: Me }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const { online, connected } = useTripSocket(true);
  const unread = useQuery({ queryKey: qk.unread, queryFn: api.unread, refetchInterval: 60_000 });
  const unreadCount = unread.data?.count ?? 0;
  const tabs =
    user.role === 'admin'
      ? [...TABS, { to: '/admin', label: 'Správa', icon: '⚙️', end: false }]
      : TABS;

  useEffect(() => {
    if (unread.data) setAppBadge(unread.data.count);
  }, [unread.data]);

  return (
    <SessionProvider user={user}>
      <div className="mx-auto flex h-full max-w-3xl flex-col sm:border-x sm:border-line/60">
        <header className="flex items-center gap-3 border-b glass px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-brand to-brand-2 text-xl shadow-lg shadow-brand/30"
          >
            ❄️
          </span>
          <div className="flex-1">
            <h1 className="gradient-text text-lg leading-tight font-bold tracking-tight">
              Hory 2027
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-ink-soft">
              <span
                className={`size-1.5 rounded-full ${connected ? 'animate-pulse bg-good' : 'bg-accent'}`}
                aria-hidden
              />
              {connected
                ? online === 1
                  ? '1 na horách'
                  : online >= 2 && online <= 4
                    ? `${online} na horách`
                    : `${online} na horách`
                : 'připojuji…'}
            </p>
          </div>
          <button
            onClick={() => setProfileOpen(true)}
            className="rounded-full ring-2 ring-transparent transition hover:ring-brand/40"
            aria-label="Tvůj profil"
          >
            <Avatar name={displayName(user)} size={36} />
          </button>
        </header>

        <main className="relative min-h-0 flex-1 overflow-hidden">
          <MountainBackdrop />
          <div className="relative z-10 h-full min-h-0">
            <Outlet />
          </div>
        </main>

        <nav className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1 border-t glass px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink-soft hover:bg-line/30 hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={`relative overflow-visible text-lg leading-none transition-transform ${isActive ? 'scale-110' : ''}`}
                  >
                    {tab.icon}
                    {tab.to === '/' && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.65rem] leading-none font-bold text-white tabular-nums shadow-sm">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </SessionProvider>
  );
}
