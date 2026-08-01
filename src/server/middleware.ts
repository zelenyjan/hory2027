import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import type { TripEvent } from '../shared/events';
import type { AppEnv } from './types';
import { resolveSession } from './auth/session';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await resolveSession(c);
  if (!user) throw new HTTPException(401, { message: 'Not signed in' });
  c.set('user', user);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('user').role !== 'admin') throw new HTTPException(403, { message: 'Admins only' });
  await next();
};

export async function parseBody<T extends z.ZodType>(
  c: Context<AppEnv>,
  schema: T,
): Promise<z.infer<T>> {
  const json = await c.req.json().catch(() => null);
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HTTPException(400, {
      message: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request',
    });
  }
  return result.data;
}

export function intParam(c: Context<AppEnv>, name: string): number {
  const value = Number(c.req.param(name));
  if (!Number.isInteger(value) || value <= 0) throw new HTTPException(400, { message: 'Bad id' });
  return value;
}

function room(c: Context<AppEnv>) {
  return c.env.TRIP_ROOM.get(c.env.TRIP_ROOM.idFromName('trip'));
}

export function broadcast(c: Context<AppEnv>, event: TripEvent): void {
  c.executionCtx.waitUntil(Promise.resolve(room(c).broadcast(event)).catch(() => {}));
}

/** Token-bucket limiter backed by the room DO, which is a single point for the whole app. */
export function rateLimit(
  keyFor: (c: Context<AppEnv>) => string,
  limit: number,
  windowMs = 60_000,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    const allowed = await room(c).consume(keyFor(c), limit, windowMs);
    if (!allowed) throw new HTTPException(429, { message: 'Slow down a moment' });
    await next();
  };
}

export const limitWrites = rateLimit((c) => `user:${c.get('user').id}`, 60);

export const limitLogins = rateLimit(
  (c) => `ip:${c.req.header('CF-Connecting-IP') ?? 'local'}`,
  15,
);
