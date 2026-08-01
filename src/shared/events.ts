import type { Message } from './types';

export type TripEvent =
  | { type: 'message.created'; payload: Message }
  | { type: 'message.updated'; payload: Message }
  | { type: 'message.deleted'; payload: Message }
  | {
      type: 'reaction.toggled';
      payload: {
        messageId: number;
        userId: number;
        userName: string;
        emoji: string;
        added: boolean;
      };
    }
  | { type: 'poll.created'; payload: { pollId: number } }
  | { type: 'poll.closed'; payload: { pollId: number } }
  | { type: 'poll.deleted'; payload: { pollId: number } }
  | { type: 'poll.voted'; payload: { pollId: number } }
  | { type: 'accommodation.created'; payload: { id: number } }
  | { type: 'accommodation.deleted'; payload: { id: number } }
  | { type: 'accommodation.rated'; payload: { id: number } }
  | { type: 'comment.created'; payload: { accommodationId: number } }
  | { type: 'comment.deleted'; payload: { accommodationId: number } }
  | { type: 'presence'; payload: { online: number } };
