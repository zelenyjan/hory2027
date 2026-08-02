import type {
  Accommodation,
  AccommodationComment,
  AdminUser,
  LocationCount,
  Me,
  Member,
  Message,
  MessagePage,
  MessageRead,
  NotifyPrefs,
  Pin,
  Poll,
} from '@shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body && !isForm ? { 'Content-Type': 'application/json' } : undefined),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? `Požadavek selhal (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: () => request<{ user: Me | null }>('/auth/me'),
  login: (name: string, password: string) => send<Me>('POST', '/auth/login', { name, password }),
  logout: () => send<{ ok: true }>('POST', '/auth/logout'),
  setPassword: (next: string, current?: string) =>
    send<Me>('POST', '/auth/password', { next, current }),
  updateNotify: (notify: NotifyPrefs) => send<Me>('PATCH', '/auth/notify', notify),
  members: () => request<Member[]>('/members'),

  messages: (cursor?: string) =>
    request<MessagePage>(`/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  sendMessage: (body: string, quotedMessageId?: number | null) =>
    send<Message>('POST', '/messages', { body, quotedMessageId: quotedMessageId ?? null }),
  editMessage: (id: number, body: string) => send<Message>('PATCH', `/messages/${id}`, { body }),
  deleteMessage: (id: number) => send<Message>('DELETE', `/messages/${id}`),
  toggleReaction: (id: number, emoji: string) =>
    send<{ added: boolean }>('PUT', `/messages/${id}/reactions`, { emoji }),
  reads: () => request<MessageRead[]>('/messages/reads'),
  unread: () => request<{ count: number }>('/messages/unread'),
  markRead: (messageId: number) =>
    send<{ lastReadMessageId: number }>('POST', '/messages/read', { messageId }),

  pushKey: () => request<{ key: string | null }>('/push/key'),
  pushSubscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    send<{ ok: true }>('POST', '/push/subscribe', subscription),
  pushUnsubscribe: (endpoint: string) =>
    send<{ ok: true }>('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => send<{ sent: number }>('POST', '/push/test').then((r) => r.sent),

  polls: () => request<Poll[]>('/polls'),
  createPoll: (question: string, options: string[], multiChoice: boolean) =>
    send<Poll>('POST', '/polls', { question, options, multiChoice }),
  vote: (pollId: number, optionIds: number[]) =>
    send<Poll>('POST', `/polls/${pollId}/votes`, { optionIds }),
  closePoll: (pollId: number) => send<Poll>('POST', `/polls/${pollId}/close`),
  deletePoll: (pollId: number) => send<{ ok: true }>('DELETE', `/polls/${pollId}`),

  accommodations: (location?: string) =>
    request<Accommodation[]>(
      `/accommodations${location ? `?location=${encodeURIComponent(location)}` : ''}`,
    ),
  accommodation: (id: number) => request<Accommodation>(`/accommodations/${id}`),
  locations: () => request<LocationCount[]>('/accommodations/locations'),
  createAccommodation: (input: {
    url: string;
    title?: string;
    priceCzk: number;
    location: string;
    comment?: string;
  }) => send<Accommodation>('POST', '/accommodations', input),
  deleteAccommodation: (id: number) => send<{ ok: true }>('DELETE', `/accommodations/${id}`),
  rate: (id: number, value: 1 | -1 | 0) =>
    send<Accommodation>('PUT', `/accommodations/${id}/rating`, { value }),
  comments: (id: number) => request<AccommodationComment[]>(`/accommodations/${id}/comments`),
  addComment: (id: number, body: string) =>
    send<AccommodationComment[]>('POST', `/accommodations/${id}/comments`, { body }),
  deleteComment: (id: number) => send<{ ok: true }>('DELETE', `/comments/${id}`),

  pins: () => request<Pin[]>('/pins'),
  createPinLink: (title: string, url: string) => send<Pin>('POST', '/pins/link', { title, url }),
  createPinFile: (title: string, file: File) => {
    const body = new FormData();
    body.set('title', title);
    body.set('file', file);
    return request<Pin>('/pins/file', { method: 'POST', body });
  },
  deletePin: (id: number) => send<{ ok: true }>('DELETE', `/pins/${id}`),

  adminUsers: () => request<AdminUser[]>('/admin/users'),
  createUser: (name: string) =>
    send<{ id: number; name: string; inviteUrl: string }>('POST', '/admin/users', { name }),
  regenerateInvite: (id: number) =>
    send<{ inviteUrl: string }>('POST', `/admin/users/${id}/invite`),
  revokeInvite: (id: number) => send<{ ok: true }>('DELETE', `/admin/users/${id}/invite`),
  updateUser: (id: number, patch: { name?: string; active?: boolean }) =>
    send<AdminUser>('PATCH', `/admin/users/${id}`, patch),
};
