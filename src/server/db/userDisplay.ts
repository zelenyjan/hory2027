/** Prefer non-empty visible_name over login name in SELECT lists. */
export function userDisplaySql(alias = 'u'): string {
  const col = (name: string) => (alias ? `${alias}.${name}` : name);
  return `COALESCE(NULLIF(TRIM(${col('visible_name')}), ''), ${col('name')})`;
}
