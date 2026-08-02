/** @Name tokens in chat bodies — names are unique, longest match wins. */

import { mentionTokens, type Named } from './names';

export type MentionMember = Named & { id: number };

/** Characters that may end a mention (WhatsApp-ish). */
const AFTER = /[\s,.:;!?)"'\]}]|$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find user ids mentioned via @login or @visibleName in `body`. */
export function extractMentionIds(body: string, members: MentionMember[]): number[] {
  const candidates = members
    .flatMap((member) => mentionTokens(member).map((token) => ({ id: member.id, token })))
    .sort((a, b) => b.token.length - a.token.length);

  const found = new Set<number>();
  const claimed = new Set<number>();

  for (const { id, token } of candidates) {
    if (!token) continue;
    const re = new RegExp(`(^|[\\s([{])@(${escapeRegExp(token)})(?=${AFTER.source})`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
      const atIndex = match.index + match[1]!.length;
      if (claimed.has(atIndex)) continue;
      found.add(id);
      for (let i = atIndex; i < atIndex + 1 + token.length; i++) claimed.add(i);
    }
  }

  return [...found];
}

export type TextPart = { text: string; mention?: boolean };

/** Split text so @Name spans can be highlighted. */
export function splitMentions(body: string, mentionNames: string[]): TextPart[] {
  if (!body || mentionNames.length === 0) return [{ text: body }];

  const names = [...new Set(mentionNames.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length === 0) return [{ text: body }];

  const pattern = names.map(escapeRegExp).join('|');
  const re = new RegExp(`(?:^|[\\s([{])(@(?:${pattern}))(?=${AFTER.source})`, 'g');
  const parts: TextPart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    const token = match[1]!;
    const start = match.index + match[0].length - token.length;
    if (start > last) parts.push({ text: body.slice(last, start) });
    parts.push({ text: token, mention: true });
    last = start + token.length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts.length > 0 ? parts : [{ text: body }];
}

/** Detect an in-progress @query at the caret for the mention picker. */
export function mentionQueryAt(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/[\s([{]/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

export function insertMention(
  value: string,
  caret: number,
  start: number,
  name: string,
): { value: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(caret);
  const inserted = `@${name} `;
  return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}
