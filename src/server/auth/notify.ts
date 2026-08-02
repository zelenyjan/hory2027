import type { NotifyPrefs } from '../../shared/types';

export function prefsFromRow(row: {
  notifyMessages: number;
  notifyMentions: number;
  notifyVotes: number;
  notifyPlaces: number;
  notifyLinks: number;
}): NotifyPrefs {
  return {
    messages: row.notifyMessages === 1,
    mentions: row.notifyMentions === 1,
    votes: row.notifyVotes === 1,
    places: row.notifyPlaces === 1,
    links: row.notifyLinks === 1,
  };
}

export const DEFAULT_NOTIFY: NotifyPrefs = {
  messages: true,
  mentions: true,
  votes: true,
  places: true,
  links: true,
};
