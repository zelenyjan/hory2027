import type { NotifyPrefs, Role } from '../shared/types';
import type { TripRoom } from './do/TripRoom';

export type Bindings = Omit<Env, 'TRIP_ROOM'> & {
  TRIP_ROOM: DurableObjectNamespace<TripRoom>;
};

export type SessionUser = {
  id: number;
  name: string;
  role: Role;
  hasPassword: boolean;
  notify: NotifyPrefs;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { user: SessionUser };
};
