export const qk = {
  me: ['me'] as const,
  messages: ['messages'] as const,
  reads: ['reads'] as const,
  unread: ['unread'] as const,
  polls: ['polls'] as const,
  accommodations: (location?: string) => ['accommodations', location ?? 'all'] as const,
  accommodation: (id: number) => ['accommodation', id] as const,
  locations: ['locations'] as const,
  comments: (id: number) => ['comments', id] as const,
  adminUsers: ['admin', 'users'] as const,
};
