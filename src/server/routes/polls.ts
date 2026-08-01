import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createPollSchema, votePollSchema } from '../../shared/schemas';
import { getPoll, listPolls } from '../db/polls';
import { broadcast, intParam, parseBody } from '../middleware';
import { notifyOthers, preview } from '../push/notify';
import type { AppEnv } from '../types';

export const pollRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await listPolls(c.env.DB)))

  .post('/', async (c) => {
    const { question, options, multiChoice } = await parseBody(c, createPollSchema);
    const user = c.get('user');

    const poll = await c.env.DB.prepare(
      'INSERT INTO polls (creator_id, question, multi_choice) VALUES (?, ?, ?) RETURNING id',
    )
      .bind(user.id, question, multiChoice ? 1 : 0)
      .first<{ id: number }>();

    await c.env.DB.batch(
      options.map((label, index) =>
        c.env.DB.prepare(
          'INSERT INTO poll_options (poll_id, label, position) VALUES (?, ?, ?)',
        ).bind(poll!.id, label, index),
      ),
    );

    broadcast(c, { type: 'poll.created', payload: { pollId: poll!.id } });
    notifyOthers(c, user.id, {
      title: `${user.name} started a poll`,
      body: preview(question),
      url: '/voting',
      tag: `poll-${poll!.id}`,
    });
    return c.json((await getPoll(c.env.DB, poll!.id))!, 201);
  })

  .post('/:id/votes', async (c) => {
    const pollId = intParam(c, 'id');
    const { optionIds } = await parseBody(c, votePollSchema);
    const user = c.get('user');

    const poll = await getPoll(c.env.DB, pollId);
    if (!poll) throw new HTTPException(404, { message: 'Poll not found' });
    if (poll.closedAt) throw new HTTPException(400, { message: 'Poll is closed' });

    const valid = new Set(poll.options.map((o) => o.id));
    const chosen = [...new Set(optionIds)].filter((id) => valid.has(id));
    if (chosen.length !== optionIds.length) {
      throw new HTTPException(400, { message: 'Unknown option' });
    }
    if (!poll.multiChoice && chosen.length > 1) {
      throw new HTTPException(400, { message: 'This poll is single-choice' });
    }

    const statements = [
      c.env.DB.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').bind(
        pollId,
        user.id,
      ),
      ...chosen.map((optionId) =>
        c.env.DB.prepare(
          'INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)',
        ).bind(pollId, optionId, user.id),
      ),
    ];
    await c.env.DB.batch(statements);

    broadcast(c, { type: 'poll.voted', payload: { pollId } });
    notifyOthers(c, user.id, {
      title: `${user.name} voted`,
      body: preview(poll.question),
      url: '/voting',
      tag: `poll-vote-${pollId}`,
    });
    return c.json((await getPoll(c.env.DB, pollId))!);
  })

  .post('/:id/close', async (c) => {
    const pollId = intParam(c, 'id');
    const user = c.get('user');
    const poll = await getPoll(c.env.DB, pollId);
    if (!poll) throw new HTTPException(404, { message: 'Poll not found' });
    if (poll.creatorId !== user.id && user.role !== 'admin') {
      throw new HTTPException(403, { message: 'Not allowed' });
    }

    await c.env.DB.prepare(
      "UPDATE polls SET closed_at = datetime('now') WHERE id = ? AND closed_at IS NULL",
    )
      .bind(pollId)
      .run();

    broadcast(c, { type: 'poll.closed', payload: { pollId } });
    return c.json((await getPoll(c.env.DB, pollId))!);
  })

  .delete('/:id', async (c) => {
    const pollId = intParam(c, 'id');
    const user = c.get('user');
    const row = await c.env.DB.prepare('SELECT creator_id AS creatorId FROM polls WHERE id = ?')
      .bind(pollId)
      .first<{ creatorId: number }>();
    if (!row) throw new HTTPException(404, { message: 'Poll not found' });
    if (row.creatorId !== user.id && user.role !== 'admin') {
      throw new HTTPException(403, { message: 'Not allowed' });
    }

    await c.env.DB.prepare('DELETE FROM polls WHERE id = ?').bind(pollId).run();
    broadcast(c, { type: 'poll.deleted', payload: { pollId } });
    return c.json({ ok: true });
  });
