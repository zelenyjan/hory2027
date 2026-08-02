import { useEffect, useMemo, useRef, useState } from 'react';
import type { Accommodation, Member, Pin, Poll } from '@shared/types';
import { entityQueryAt, insertEntityTag } from '@shared/entityTags';
import { insertMention, mentionQueryAt } from '@shared/mentions';
import { displayName } from '@shared/names';
import { MESSAGE_MAX } from '@shared/schemas';
import { formatPrice } from '../../lib/format';

/** Keep in sync with the send button row — single-line composer height. */
const COMPOSER_MIN_PX = 48;
const COMPOSER_MAX_PX = 128;

function fitTextarea(el: HTMLTextAreaElement) {
  el.style.height = '0px';
  el.style.height = `${Math.max(COMPOSER_MIN_PX, Math.min(el.scrollHeight, COMPOSER_MAX_PX))}px`;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  selfId: number;
  /** When set, `#` opens a picker for polls, places, and pins (chat). */
  polls?: Poll[];
  places?: Accommodation[];
  pins?: Pin[];
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  onSubmit: () => void;
};

type Suggestion =
  | { key: string; kind: 'member'; member: Member }
  | { key: string; kind: 'poll'; poll: Poll }
  | { key: string; kind: 'place'; place: Accommodation }
  | { key: string; kind: 'pin'; pin: Pin };

function placeLabel(place: Accommodation): string {
  return (place.title || place.ogTitle || place.location).trim();
}

export function MentionComposer({
  value,
  onChange,
  members,
  selfId,
  polls,
  places,
  pins,
  disabled,
  placeholder,
  maxLength = MESSAGE_MAX,
  onSubmit,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);

  const entityEnabled = polls !== undefined || places !== undefined || pins !== undefined;

  const mentionQ = mentionQueryAt(value, caret);
  const entityQ = entityEnabled ? entityQueryAt(value, caret) : null;

  // Prefer whichever trigger is closer to the caret.
  const mode =
    mentionQ && entityQ
      ? mentionQ.start >= entityQ.start
        ? ('mention' as const)
        : ('entity' as const)
      : mentionQ
        ? ('mention' as const)
        : entityQ
          ? ('entity' as const)
          : null;

  const query = mode === 'mention' ? mentionQ : mode === 'entity' ? entityQ : null;
  const open = query !== null && query.start !== dismissedStart;

  const suggestions = useMemo((): Suggestion[] => {
    if (!open || !query || !mode) return [];
    const q = query.query.toLocaleLowerCase('cs');

    if (mode === 'mention') {
      return members
        .filter((m) => m.id !== selfId)
        .filter((m) => {
          if (!q) return true;
          const hay = `${m.name} ${m.visibleName ?? ''}`.toLocaleLowerCase('cs');
          return hay.includes(q);
        })
        .slice(0, 8)
        .map((member) => ({ key: `m-${member.id}`, kind: 'member' as const, member }));
    }

    const out: Suggestion[] = [];
    for (const poll of polls ?? []) {
      if (q && !poll.question.toLocaleLowerCase('cs').includes(q)) continue;
      out.push({ key: `p-${poll.id}`, kind: 'poll', poll });
    }
    for (const place of places ?? []) {
      const hay = `${placeLabel(place)} ${place.location}`.toLocaleLowerCase('cs');
      if (q && !hay.includes(q)) continue;
      out.push({ key: `a-${place.id}`, kind: 'place', place });
    }
    for (const pin of pins ?? []) {
      const hay = `${pin.title} ${pin.url ?? ''} ${pin.fileName ?? ''}`.toLocaleLowerCase('cs');
      if (q && !hay.includes(q)) continue;
      out.push({ key: `n-${pin.id}`, kind: 'pin', pin });
    }
    return out.slice(0, 8);
  }, [members, mode, open, pins, places, polls, query, selfId]);

  useEffect(() => {
    setActive(0);
    if (query && query.start !== dismissedStart) setDismissedStart(null);
  }, [mode, query?.query, query?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = textareaRef.current;
    if (el) fitTextarea(el);
  }, [value]);

  const focusCaret = (nextCaret: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
      fitTextarea(el);
    });
  };

  const pick = (item: Suggestion) => {
    if (!query) return;
    if (item.kind === 'member') {
      const next = insertMention(value, caret, query.start, displayName(item.member));
      onChange(next.value);
      setDismissedStart(null);
      focusCaret(next.caret);
      return;
    }
    if (item.kind === 'poll') {
      const next = insertEntityTag(value, caret, query.start, 'anketa', item.poll.id, item.poll.question);
      onChange(next.value);
      setDismissedStart(null);
      focusCaret(next.caret);
      return;
    }
    if (item.kind === 'place') {
      const label = `${placeLabel(item.place)} · ${formatPrice(item.place.totalPriceCzk)}`;
      const next = insertEntityTag(value, caret, query.start, 'misto', item.place.id, label);
      onChange(next.value);
      setDismissedStart(null);
      focusCaret(next.caret);
      return;
    }
    const next = insertEntityTag(value, caret, query.start, 'odkaz', item.pin.id, item.pin.title);
    onChange(next.value);
    setDismissedStart(null);
    focusCaret(next.caret);
  };

  return (
    <div className="relative flex min-h-12 min-w-0 flex-1 flex-col">
      {suggestions.length > 0 && (
        <ul
          className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg"
          role="listbox"
        >
          {suggestions.map((item, index) => (
            <li key={item.key}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${
                  index === active ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
              >
                {item.kind === 'member' && (
                  <span className="font-medium">@{displayName(item.member)}</span>
                )}
                {item.kind === 'poll' && (
                  <>
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                      Anketa
                    </span>
                    <span className="line-clamp-2 font-medium">{item.poll.question}</span>
                  </>
                )}
                {item.kind === 'place' && (
                  <>
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                      Ubytování
                    </span>
                    <span className="font-medium">
                      {placeLabel(item.place)}
                      <span className="font-normal text-ink-soft">
                        {' '}
                        · {formatPrice(item.place.totalPriceCzk)}
                      </span>
                    </span>
                  </>
                )}
                {item.kind === 'pin' && (
                  <>
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                      {item.pin.kind === 'file' ? 'Soubor' : 'Odkaz'}
                    </span>
                    <span className="line-clamp-2 font-medium">{item.pin.title}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        ref={textareaRef}
        className="field box-border max-h-32 min-h-12 w-full flex-1 resize-none py-2.5 text-base leading-6"
        rows={1}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart);
          fitTextarea(e.target);
        }}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(suggestions[active]!);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              if (query) setDismissedStart(query.start);
              return;
            }
          }

          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
    </div>
  );
}
