import { useState } from 'react';
import type { Message, MessageRead } from '@shared/types';
import { REACTION_EMOJIS } from '@shared/schemas';
import { formatTime } from '../../lib/format';
import { useSession } from '../../lib/session';
import { MentionText } from '../MentionText';
import { Avatar, Sheet } from '../ui';

type Props = {
  message: Message;
  reads: MessageRead[];
  showAuthor: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
  onJumpTo: (messageId: number) => void;
};

export function MessageBubble({
  message,
  reads,
  showAuthor,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
  onJumpTo,
}: Props) {
  const me = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const mine = message.userId === me.id;
  const canDelete = mine || me.role === 'admin';

  const others = reads.filter((r) => r.userId !== me.id);
  const readers = others.filter((r) => r.lastReadMessageId >= message.id);
  const pending = others.filter((r) => r.lastReadMessageId < message.id);
  const readByAll = others.length > 0 && pending.length === 0;
  const showTicks = mine && !message.deleted && others.length > 0;

  const act = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div
      id={`message-${message.id}`}
      className={`flex gap-2 px-3 ${mine ? 'flex-row-reverse' : ''} ${showAuthor ? 'mt-3' : 'mt-0.5'}`}
    >
      <div className="w-9 shrink-0">
        {showAuthor && !mine && <Avatar name={message.userName} size={36} />}
      </div>

      <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showAuthor && !mine && (
          <span className="mb-0.5 px-1 text-xs font-medium text-ink-soft">{message.userName}</span>
        )}

        {/* A div rather than a button: message bodies may contain links, which cannot nest in one. */}
        <div
          role={message.deleted ? undefined : 'button'}
          tabIndex={message.deleted ? undefined : 0}
          onClick={() => !message.deleted && setMenuOpen(true)}
          onKeyDown={(e) => {
            if (!message.deleted && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setMenuOpen(true);
            }
          }}
          className={`relative cursor-pointer rounded-2xl px-3.5 py-2 text-left text-[0.95rem] leading-snug wrap-anywhere shadow-bubble transition-transform active:scale-[0.99] ${
            mine
              ? 'rounded-br-md bg-linear-to-br from-brand to-brand-2 text-white'
              : 'rounded-bl-md border border-line/70 bg-surface-2 text-ink'
          } ${message.deleted ? 'cursor-default italic opacity-60' : ''}`}
        >
          {message.quoted && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onJumpTo(message.quoted!.id);
              }}
              className={`mb-1.5 block rounded-lg border-l-2 px-2 py-1 text-xs ${
                mine ? 'border-white/60 bg-white/15' : 'border-brand bg-brand/10'
              }`}
            >
              <span className="block font-medium">{message.quoted.userName}</span>
              <span className="line-clamp-2 opacity-80">
                {message.quoted.deleted ? 'zpráva smazána' : message.quoted.body}
              </span>
            </span>
          )}

          {message.deleted ? (
            'zpráva smazána'
          ) : (
            <MentionText
              text={message.body}
              mentionNames={(message.mentions ?? []).map((m) => m.name)}
              accent={mine ? 'on-brand' : 'brand'}
            />
          )}

          <span
            className={`ml-2 inline-block align-bottom text-[0.65rem] whitespace-nowrap ${
              mine ? 'text-white/70' : 'text-ink-soft'
            }`}
          >
            {message.editedAt && 'upraveno · '}
            {formatTime(message.createdAt)}
            {showTicks && (
              <span
                title={
                  readers.length === 0
                    ? 'Zatím nikdo nepřečetl'
                    : `Přečetli: ${readers.map((r) => r.name).join(', ')}`
                }
                className={`ml-1 tracking-tighter ${readByAll ? 'text-white' : 'text-white/60'}`}
              >
                {readers.length === 0 ? '✓' : '✓✓'}
              </span>
            )}
          </span>
        </div>

        {message.reactions.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
            {message.reactions.map((reaction) => {
              const reactedByMe = reaction.users.some((u) => u.userId === me.id);
              return (
                <button
                  key={reaction.emoji}
                  type="button"
                  title={reaction.users.map((u) => u.name).join(', ')}
                  onClick={() => onToggleReaction(message, reaction.emoji)}
                  className={`rounded-full border px-1.5 py-0.5 text-xs shadow-bubble transition-colors ${
                    reactedByMe
                      ? 'border-brand bg-brand-soft font-medium text-brand'
                      : 'border-line bg-surface-2'
                  }`}
                >
                  {reaction.emoji} {reaction.users.length}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={menuOpen} title="Zpráva" onClose={() => setMenuOpen(false)}>
        {showTicks && (
          <div className="mb-5 rounded-xl border border-line/70 bg-surface p-3 text-sm">
            <p className="font-medium">
              {readByAll
                ? '✓✓ Přečetli všichni'
                : `Přečetlo ${readers.length} z ${others.length}`}
            </p>
            {readers.length > 0 && !readByAll && (
              <p className="mt-1 text-ink-soft">{readers.map((r) => r.name).join(', ')}</p>
            )}
            {pending.length > 0 && (
              <p className="mt-1 text-ink-soft">
                Čeká se na {pending.map((r) => r.name).join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="mb-5 flex justify-between gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="rounded-xl px-2 py-1.5 text-2xl transition-transform hover:scale-125 hover:bg-brand-soft"
              onClick={act(() => onToggleReaction(message, emoji))}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <button className="btn-ghost w-full" onClick={act(() => onReply(message))}>
            Odpovědět
          </button>
          {mine && (
            <button className="btn-ghost w-full" onClick={act(() => onEdit(message))}>
              Upravit
            </button>
          )}
          {canDelete && (
            <button
              className="btn-ghost w-full text-bad"
              onClick={act(() => {
                if (window.confirm('Smazat tuto zprávu?')) onDelete(message);
              })}
            >
              Smazat
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
