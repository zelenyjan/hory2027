import { Link } from 'react-router-dom';
import { entityHref, entityKindLabel, splitEntityTags, type EntityKind } from '@shared/entityTags';
import { splitMentions } from '@shared/mentions';
import { splitLinks } from '../lib/format';

const ENTITY_TITLE: Record<EntityKind, string> = {
  anketa: 'Otevřít anketu',
  misto: 'Otevřít ubytování',
  odkaz: 'Otevřít v důležitých odkazech',
};

/** Renders plain text with entity tags, @mentions, and URLs. */
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

  const entityClass =
    accent === 'on-brand'
      ? 'rounded bg-white/25 px-1 font-medium underline decoration-white/50 underline-offset-2'
      : 'rounded bg-brand/15 px-1 font-medium text-brand underline decoration-brand/40 underline-offset-2';

  return (
    <>
      {splitEntityTags(text).flatMap((entityPart, i) => {
        if (entityPart.entity) {
          const { entity } = entityPart;
          return [
            <Link
              key={`e-${i}`}
              to={entityHref(entity)}
              title={ENTITY_TITLE[entity.kind]}
              onClick={(e) => e.stopPropagation()}
              className={entityClass}
            >
              {entityKindLabel(entity.kind)}: {entity.label}
            </Link>,
          ];
        }

        return splitMentions(entityPart.text, mentionNames).flatMap((part, j) => {
          if (part.mention) {
            return [
              <span key={`m-${i}-${j}`} className={mentionClass}>
                {part.text}
              </span>,
            ];
          }
          return splitLinks(part.text).map((link, k) =>
            link.href ? (
              <a
                key={`l-${i}-${j}-${k}`}
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
                className="underline underline-offset-2 hover:opacity-80"
              >
                {link.text}
              </a>
            ) : (
              <span key={`t-${i}-${j}-${k}`}>{link.text}</span>
            ),
          );
        });
      })}
    </>
  );
}
