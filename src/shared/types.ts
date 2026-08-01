export type Role = 'admin' | 'member';
export type Provider = 'booking' | 'airbnb' | 'other';

export type Me = {
  id: number;
  name: string;
  role: Role;
  hasPassword: boolean;
  mustSetPassword: boolean;
};

export type UserRef = { userId: number; name: string };

export type QuotedMessage = {
  id: number;
  userName: string;
  body: string;
  deleted: boolean;
};

export type Message = {
  id: number;
  userId: number;
  userName: string;
  body: string;
  quotedMessageId: number | null;
  quoted: QuotedMessage | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  reactions: { emoji: string; users: UserRef[] }[];
};

export type MessagePage = {
  messages: Message[];
  nextCursor: string | null;
};

export type PollOption = {
  id: number;
  label: string;
  position: number;
  voters: UserRef[];
};

export type Poll = {
  id: number;
  creatorId: number;
  creatorName: string;
  question: string;
  multiChoice: boolean;
  closedAt: string | null;
  createdAt: string;
  options: PollOption[];
};

export type Accommodation = {
  id: number;
  userId: number;
  userName: string;
  url: string;
  provider: Provider;
  location: string;
  totalPriceCzk: number;
  comment: string | null;
  createdAt: string;
  up: UserRef[];
  down: UserRef[];
  score: number;
  myRating: 1 | -1 | 0;
  commentCount: number;
};

export type LocationCount = { location: string; count: number };

export type AccommodationComment = {
  id: number;
  accommodationId: number;
  userId: number;
  userName: string;
  body: string;
  createdAt: string;
  deleted: boolean;
};

export type AdminUser = {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  hasPassword: boolean;
  hasInvite: boolean;
  inviteRevoked: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};
