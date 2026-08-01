import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Poll } from '@shared/types';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { formatRelative } from '../lib/format';
import { useSession } from '../lib/session';
import { ConfirmButton, EmptyState, ErrorNote, Sheet, Spinner } from '../components/ui';

function PollCard({ poll }: { poll: Poll }) {
  const me = useSession();
  const queryClient = useQueryClient();
  const [showVoters, setShowVoters] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.polls });

  const vote = useMutation({
    mutationFn: (optionIds: number[]) => api.vote(poll.id, optionIds),
    onSuccess: invalidate,
  });
  const close = useMutation({ mutationFn: () => api.closePoll(poll.id), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => api.deletePoll(poll.id), onSuccess: invalidate });

  const myVotes = poll.options
    .filter((o) => o.voters.some((v) => v.userId === me.id))
    .map((o) => o.id);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.voters.length, 0);
  const leaderCount = Math.max(...poll.options.map((o) => o.voters.length));
  const closed = poll.closedAt !== null;
  const canManage = poll.creatorId === me.id || me.role === 'admin';

  const choose = (optionId: number) => {
    if (closed) return;
    const chosen = poll.multiChoice
      ? myVotes.includes(optionId)
        ? myVotes.filter((id) => id !== optionId)
        : [...myVotes, optionId]
      : myVotes.includes(optionId)
        ? []
        : [optionId];
    vote.mutate(chosen);
  };

  return (
    <article className="card p-4">
      <header className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold wrap-anywhere">{poll.question}</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {poll.creatorName} · {formatRelative(poll.createdAt)}
            {poll.multiChoice && ' · multiple choice'}
            {closed && ' · closed'}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            {!closed && (
              <ConfirmButton
                label="Close"
                confirmLabel="Close this poll? Voting stops, results stay visible."
                onConfirm={() => close.mutate()}
                pending={close.isPending}
              />
            )}
            <ConfirmButton
              label="Delete"
              confirmLabel="Delete this poll and all its votes?"
              onConfirm={() => remove.mutate()}
              pending={remove.isPending}
              className="btn-ghost px-3 py-1.5 text-xs text-bad"
            />
          </div>
        )}
      </header>

      <ul className="space-y-2">
        {poll.options.map((option) => {
          const share = totalVotes === 0 ? 0 : (option.voters.length / totalVotes) * 100;
          const mine = myVotes.includes(option.id);
          const leading = totalVotes > 0 && option.voters.length === leaderCount;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={closed || vote.isPending}
                onClick={() => choose(option.id)}
                className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-all ${
                  mine ? 'border-brand shadow-sm shadow-brand/20' : 'border-line'
                } ${closed ? 'cursor-default' : 'hover:border-brand active:scale-[0.99]'}`}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-linear-to-r from-brand/25 to-brand-2/20 transition-[width] duration-500"
                  style={{ width: `${share}%` }}
                />
                <span className="relative flex items-center gap-2">
                  <span className="flex-1 text-sm wrap-anywhere">
                    {closed && leading && '🏆 '}
                    {option.label}
                  </span>
                  <span
                    className={`text-xs tabular-nums ${leading ? 'font-semibold text-accent' : 'text-ink-soft'}`}
                  >
                    {option.voters.length}
                  </span>
                  {mine && <span className="text-brand">✓</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="mt-3 flex items-center justify-between text-xs text-ink-soft">
        <span>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </span>
        {totalVotes > 0 && (
          <button className="underline underline-offset-2" onClick={() => setShowVoters(true)}>
            Who voted?
          </button>
        )}
      </footer>

      <Sheet open={showVoters} title="Who voted" onClose={() => setShowVoters(false)}>
        <ul className="space-y-4">
          {poll.options.map((option) => (
            <li key={option.id}>
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-sm text-ink-soft">
                {option.voters.length > 0
                  ? option.voters.map((v) => v.name).join(', ')
                  : 'nobody yet'}
              </p>
            </li>
          ))}
        </ul>
      </Sheet>
    </article>
  );
}

function CreatePollSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiChoice, setMultiChoice] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api.createPoll(question.trim(), options.map((o) => o.trim()).filter(Boolean), multiChoice),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.polls });
      setQuestion('');
      setOptions(['', '']);
      setMultiChoice(false);
      onClose();
    },
  });

  const filled = options.filter((o) => o.trim()).length;

  return (
    <Sheet open={open} title="New poll" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          className="field"
          placeholder="What are we deciding?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
        />
        {options.map((option, index) => (
          <div key={index} className="flex gap-2">
            <input
              className="field"
              placeholder={`Option ${index + 1}`}
              value={option}
              onChange={(e) =>
                setOptions(options.map((o, i) => (i === index ? e.target.value : o)))
              }
            />
            {options.length > 2 && (
              <button
                type="button"
                className="btn-ghost px-3"
                onClick={() => setOptions(options.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => setOptions([...options, ''])}
          >
            Add option
          </button>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-brand)]"
            checked={multiChoice}
            onChange={(e) => setMultiChoice(e.target.checked)}
          />
          Allow picking several options
        </label>

        <ErrorNote error={create.error} />
        <button
          className="btn-primary w-full"
          disabled={create.isPending || !question.trim() || filled < 2}
        >
          Create poll
        </button>
      </form>
    </Sheet>
  );
}

export function VotingPage() {
  const [creating, setCreating] = useState(false);
  const polls = useQuery({ queryKey: qk.polls, queryFn: api.polls });

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="gradient-text text-xl font-bold tracking-tight">Voting</h2>
        <button className="btn-primary py-2" onClick={() => setCreating(true)}>
          New poll
        </button>
      </div>

      {polls.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {polls.data?.length === 0 && (
        <EmptyState title="No polls yet" hint="Start one to settle a date, a resort, or dinner." />
      )}

      <div className="space-y-3">
        {polls.data?.map((poll) => (
          <PollCard key={poll.id} poll={poll} />
        ))}
      </div>

      <CreatePollSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
