import { useEffect, useMemo, useRef, useState } from 'react';
import type { Member } from '@shared/types';
import { insertMention, mentionQueryAt } from '@shared/mentions';
import { MESSAGE_MAX } from '@shared/schemas';

type Props = {
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  selfId: number;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  onSubmit: () => void;
};

export function MentionComposer({
  value,
  onChange,
  members,
  selfId,
  disabled,
  placeholder,
  maxLength = MESSAGE_MAX,
  onSubmit,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);

  const query = mentionQueryAt(value, caret);
  const open = query !== null && query.start !== dismissedStart;

  const suggestions = useMemo(() => {
    if (!open || !query) return [];
    const q = query.query.toLocaleLowerCase('cs');
    return members
      .filter((m) => m.id !== selfId)
      .filter((m) => !q || m.name.toLocaleLowerCase('cs').includes(q))
      .slice(0, 8);
  }, [members, open, query, selfId]);

  useEffect(() => {
    setActive(0);
    if (query && query.start !== dismissedStart) setDismissedStart(null);
  }, [query?.query, query?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (member: Member) => {
    if (!query) return;
    const next = insertMention(value, caret, query.start, member.name);
    onChange(next.value);
    setDismissedStart(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    });
  };

  return (
    <div className="relative min-w-0 flex-1">
      {suggestions.length > 0 && (
        <ul
          className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg"
          role="listbox"
        >
          {suggestions.map((member, index) => (
            <li key={member.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  index === active ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(member);
                }}
              >
                <span className="font-medium">@{member.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        ref={textareaRef}
        className="max-h-32 min-h-11 field w-full resize-none py-2.5"
        rows={1}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
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
