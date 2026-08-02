import { splitMentions } from '@shared/mentions';
import { splitLinks } from '../lib/format';

/** Renders plain text with @mentions highlighted and URLs linkified. */
export function MentionText({
  text,
  mentionNames,
  accent = 'brand',
}: {
  text: string;
  mentionNames: string[];
  /** Bubble style for own chat messages vs default brand accent. */
  accent?: 'brand' | 'on-brand';
}) {
  const mentionClass =
    accent === 'on-brand'
      ? 'rounded bg-white/20 px-0.5 font-medium'
      : 'rounded bg-brand/15 px-0.5 font-medium text-brand';

  return (
    <>
      {splitMentions(text, mentionNames).flatMap((part, i) => {
        if (part.mention) {
          return [
            <span key={`m-${i}`} className={mentionClass}>
              {part.text}
            </span>,
          ];
        }
        return splitLinks(part.text).map((link, j) =>
          link.href ? (
            <a
              key={`l-${i}-${j}`}
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="underline underline-offset-2 hover:opacity-80"
            >
              {link.text}
            </a>
          ) : (
            <span key={`t-${i}-${j}`}>{link.text}</span>
          ),
        );
      })}
    </>
  );
}
