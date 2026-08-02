import { DurableObject } from 'cloudflare:workers';
import type { TripEvent } from '../../shared/events';

type SocketAttachment = { userId: number };

type Bucket = { tokens: number; refilledAt: number };

/**
 * Single room instance ("trip") holding every live client socket. Hibernation keeps
 * the object out of memory between events; D1 stays the source of truth.
 */
export class TripRoom extends DurableObject<Env> {
  /** Token buckets live in memory only; hibernation resets them, which is fine for abuse control. */
  private buckets = new Map<string, Bucket>();

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Očekáván WebSocket', { status: 426 });
    }
    const userId = Number(new URL(request.url).searchParams.get('userId') ?? 0);
    if (!userId) return new Response('Neautorizováno', { status: 401 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId } satisfies SocketAttachment);
    this.announcePresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(event: TripEvent): void {
    const frame = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(frame);
      } catch {
        // Socket is going away; the close/error handler cleans up.
      }
    }
  }

  onlineCount(): number {
    return this.ctx.getWebSockets().length;
  }

  /** Returns false when `key` has spent its allowance for the current window. */
  consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: limit, refilledAt: now };
    bucket.tokens = Math.min(limit, bucket.tokens + ((now - bucket.refilledAt) / windowMs) * limit);
    bucket.refilledAt = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Clients only send keepalive pings in v1; everything else arrives over REST.
    if (typeof message === 'string' && message === 'ping') ws.send('pong');
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): void {
    ws.close(code === 1006 ? 1000 : code, reason);
    void wasClean;
    this.announcePresence();
  }

  webSocketError(): void {
    this.announcePresence();
  }

  private announcePresence(): void {
    this.broadcast({ type: 'presence', payload: { online: this.ctx.getWebSockets().length } });
  }
}
