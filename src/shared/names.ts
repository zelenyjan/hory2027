/** Login `name` vs optional `visibleName` shown in the UI. */

export type Named = { name: string; visibleName?: string | null };

export function displayName(user: Named): string {
  const visible = user.visibleName?.trim();
  return visible || user.name;
}

/** Tokens that may appear after `@` for this user (longest-first ready). */
export function mentionTokens(user: Named): string[] {
  const tokens = [user.name];
  const visible = user.visibleName?.trim();
  if (visible && visible.localeCompare(user.name, 'cs', { sensitivity: 'accent' }) !== 0) {
    tokens.push(visible);
  }
  return tokens;
}
