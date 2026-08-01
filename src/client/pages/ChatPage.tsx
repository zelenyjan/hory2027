import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@shared/types';
import { MESSAGE_MAX } from '@shared/schemas';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { formatDay, parseSqlDate } from '../lib/format';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ErrorNote, Spinner } from '../components/ui';

const NEAR_BOTTOM_PX = 120;

export function ChatPage() {
  const queryClient = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);

  const feed = useInfiniteQuery({
    queryKey: qk.messages,
    queryFn: ({ pageParam }) => api.messages(pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Pages arrive newest-first; flip them so the oldest sits at the top of the scroller.
  const messages = feed.data ? [...feed.data.pages].reverse().flatMap((p) => p.messages) : [];
  const lastId = messages.at(-1)?.id;

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.messages });

  const sendMessage = useMutation({
    mutationFn: () => api.sendMessage(draft.trim(), replyTo?.id ?? null),
    onSuccess: () => {
      setDraft('');
      setReplyTo(null);
      void refresh();
    },
  });

  const editMessage = useMutation({
    mutationFn: () => api.editMessage(editing!.id, draft.trim()),
    onSuccess: () => {
      setDraft('');
      setEditing(null);
      void refresh();
    },
  });

  const deleteMessage = useMutation({
    mutationFn: (message: Message) => api.deleteMessage(message.id),
    onSuccess: () => void refresh(),
  });

  const toggleReaction = useMutation({
    mutationFn: ({ message, emoji }: { message: Message; emoji: string }) =>
      api.toggleReaction(message.id, emoji),
    onSuccess: () => void refresh(),
  });

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const nearBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom || messages.length <= 50) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [lastId, messages.length]);

  const onScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.scrollTop > 80) return;
    if (feed.hasNextPage && !feed.isFetchingNextPage) {
      const before = scroller.scrollHeight;
      void feed.fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          scroller.scrollTop += scroller.scrollHeight - before;
        });
      });
    }
  }, [feed]);

  const jumpTo = (messageId: number) => {
    const node = document.getElementById(`message-${messageId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 700 });
  };

  const startEdit = (message: Message) => {
    setEditing(message);
    setReplyTo(null);
    setDraft(message.body);
  };

  const cancelComposerContext = () => {
    setEditing(null);
    setReplyTo(null);
    setDraft('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    if (editing) editMessage.mutate();
    else sendMessage.mutate();
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-end py-2">
          {feed.isPending && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}
          {feed.isFetchingNextPage && (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          )}
          {!feed.isPending && messages.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-ink-soft">
              🏔️ Quiet on the mountain. Say hi to the crew.
            </p>
          )}

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay =
              !previous ||
              parseSqlDate(previous.createdAt).toDateString() !==
                parseSqlDate(message.createdAt).toDateString();
            const showAuthor = newDay || previous?.userId !== message.userId;

            return (
              <div key={message.id}>
                {newDay && (
                  <div className="my-4 text-center">
                    <span className="rounded-full border border-line/70 bg-surface-2/80 px-3 py-1 text-xs font-medium text-ink-soft backdrop-blur">
                      {formatDay(message.createdAt)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  showAuthor={showAuthor}
                  onReply={(m) => {
                    setEditing(null);
                    setReplyTo(m);
                  }}
                  onEdit={startEdit}
                  onDelete={(m) => deleteMessage.mutate(m)}
                  onToggleReaction={(m, emoji) => toggleReaction.mutate({ message: m, emoji })}
                  onJumpTo={jumpTo}
                />
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={submit} className="border-t glass p-3">
        {(replyTo || editing) && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border-l-2 border-brand bg-surface-2 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {editing ? 'Editing your message' : `Replying to ${replyTo!.userName}`}
              </p>
              <p className="truncate text-ink-soft">{(editing ?? replyTo)!.body}</p>
            </div>
            <button type="button" className="text-ink-soft" onClick={cancelComposerContext}>
              ✕
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            className="max-h-32 min-h-11 field flex-1 resize-none py-2.5"
            rows={1}
            maxLength={MESSAGE_MAX}
            placeholder="Message the group…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <button
            className="btn-primary h-11 px-4"
            disabled={!draft.trim() || sendMessage.isPending || editMessage.isPending}
          >
            {editing ? 'Save' : 'Send'}
          </button>
        </div>
        <ErrorNote error={sendMessage.error ?? editMessage.error} />
      </form>
    </div>
  );
}
