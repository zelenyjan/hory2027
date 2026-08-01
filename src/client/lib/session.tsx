import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Me } from '@shared/types';
import { api } from './api';
import { qk } from './queries';

const SessionContext = createContext<Me | null>(null);

export function SessionProvider({ user, children }: { user: Me; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): Me {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSession used outside an authenticated route');
  return user;
}

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.me().then((r) => r.user),
    staleTime: 60_000,
    retry: false,
  });
}
