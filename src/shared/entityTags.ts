/** Inline chat tags: `[[anketa:12|…]]` / `[[misto:5|…]]` / `[[odkaz:3|…]]`. */

export type EntityKind = 'anketa' | 'misto' | 'odkaz';

export type EntityTag = {
  kind: EntityKind;
  id: number;
  label: string;
  /** Full matched token including brackets. */
  raw: string;
  start: number;
  end: number;
};

const ENTITY_RE = /\[\[(anketa|misto|odkaz):(\d+)\|([^\]]+)\]\]/g;

const ENTITY_LABEL: Record<EntityKind, string> = {
  anketa: 'Anketa',
  misto: 'Místo',
  odkaz: 'Odkaz',
};

function sanitizeLabel(label: string): string {
  return label.replace(/[\[\]|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function formatEntityTag(kind: EntityKind, id: number, label: string): string {
  return `[[${kind}:${id}|${sanitizeLabel(label) || String(id)}]]`;
}

export function entityHref(tag: Pick<EntityTag, 'kind' | 'id'>): string {
  if (tag.kind === 'anketa') return `/voting#poll-${tag.id}`;
  if (tag.kind === 'misto') return `/places/${tag.id}`;
  return `/links#pin-${tag.id}`;
}

export function entityKindLabel(kind: EntityKind): string {
  return ENTITY_LABEL[kind];
}

/** Replace tags with short plain-text previews (reply bar, quotes). */
export function formatBodyPreview(body: string): string {
  return body.replace(
    /\[\[(anketa|misto|odkaz):(\d+)\|([^\]]+)\]\]/g,
    (_m, kind: EntityKind, _id: string, label: string) => {
      const clean = sanitizeLabel(label);
      return `${ENTITY_LABEL[kind]}: ${clean}`;
    },
  );
}

export type EntityPart =
  | { text: string; entity?: undefined }
  | { text: string; entity: EntityTag };

/** Split body so entity tags can be rendered as links. */
export function splitEntityTags(body: string): EntityPart[] {
  if (!body) return [{ text: body }];
  const parts: EntityPart[] = [];
  let last = 0;
  ENTITY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENTITY_RE.exec(body)) !== null) {
    if (match.index > last) parts.push({ text: body.slice(last, match.index) });
    const kind = match[1] as EntityKind;
    const id = Number(match[2]);
    const label = sanitizeLabel(match[3] ?? '') || String(id);
    const entity: EntityTag = {
      kind,
      id,
      label,
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    };
    parts.push({ text: match[0], entity });
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts.length > 0 ? parts : [{ text: body }];
}

/** Detect an in-progress `#query` at the caret for the entity picker. */
export function entityQueryAt(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const hash = before.lastIndexOf('#');
  if (hash < 0) return null;
  if (hash > 0 && !/[\s([{]/.test(before[hash - 1]!)) return null;
  // Don't open the picker while typing inside an existing tag.
  if (before.slice(Math.max(0, hash - 2), hash) === '[[') return null;
  const query = before.slice(hash + 1);
  // Same as @mentions: whitespace ends the query so normal sentences don't keep the picker open.
  if (/\s/.test(query)) return null;
  if (/[\[\]]/.test(query)) return null;
  if (query.length > 48) return null;
  return { start: hash, query };
}

export function insertEntityTag(
  value: string,
  caret: number,
  start: number,
  kind: EntityKind,
  id: number,
  label: string,
): { value: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(caret);
  const inserted = `${formatEntityTag(kind, id, label)} `;
  return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}
