import { z } from 'zod';

export const MESSAGE_MAX = 4000;
export const COMMENT_MAX = 2000;
export const PASSWORD_MIN = 10;
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const loginSchema = z.object({
  name: trimmed(80),
  password: z.string().min(1).max(200),
});

export const setPasswordSchema = z.object({
  current: z.string().max(200).optional(),
  next: z.string().min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`).max(200),
});

export const createMessageSchema = z.object({
  body: trimmed(MESSAGE_MAX),
  quotedMessageId: z.number().int().positive().nullish(),
});

export const updateMessageSchema = z.object({ body: trimmed(MESSAGE_MAX) });

export const toggleReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

export const createPollSchema = z.object({
  question: trimmed(300),
  options: z.array(trimmed(120)).min(2).max(10),
  multiChoice: z.boolean().default(false),
});

export const votePollSchema = z.object({
  optionIds: z.array(z.number().int().positive()).max(10),
});

export const createAccommodationSchema = z.object({
  url: z.url().max(2000),
  priceCzk: z.number().int().positive().max(100_000_000),
  location: trimmed(120),
  comment: z.string().trim().max(COMMENT_MAX).optional(),
});

export const rateAccommodationSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

export const createCommentSchema = z.object({ body: trimmed(COMMENT_MAX) });

export const createUserSchema = z.object({ name: trimmed(80) });

export const updateUserSchema = z
  .object({
    name: trimmed(80).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.active !== undefined, {
    message: 'Nothing to update',
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreatePollInput = z.infer<typeof createPollSchema>;
export type CreateAccommodationInput = z.infer<typeof createAccommodationSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
