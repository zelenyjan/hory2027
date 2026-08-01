/** Classic text smileys, turned into emoji on the way into the database. */
const EMOTICONS: Record<string, string> = {
  ':)': '🙂',
  ':-)': '🙂',
  '=)': '🙂',
  ':D': '😃',
  ':-D': '😃',
  '=D': '😃',
  xD: '😆',
  XD: '😆',
  ':(': '🙁',
  ':-(': '🙁',
  '=(': '🙁',
  ";'(": '😢',
  ":'(": '😢',
  ';)': '😉',
  ';-)': '😉',
  ':P': '😛',
  ':-P': '😛',
  ':p': '😛',
  ':-p': '😛',
  ':O': '😮',
  ':-O': '😮',
  ':o': '😮',
  ':-o': '😮',
  ':/': '😕',
  ':-/': '😕',
  ':\\': '😕',
  ':|': '😐',
  ':-|': '😐',
  ':*': '😘',
  ':-*': '😘',
  '8)': '😎',
  '8-)': '😎',
  'B)': '😎',
  '>:(': '😠',
  '<3': '❤️',
  '</3': '💔',
};

const PATTERN = new RegExp(
  `(^|\\s)(${Object.keys(EMOTICONS)
    .sort((a, b) => b.length - a.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?=$|\\s|[.,!?…])`,
  'g',
);

/**
 * Only free-standing smileys are replaced, so URLs (`http://…`) and words that
 * happen to contain a colon survive untouched.
 */
export function emojify(text: string): string {
  return text.replace(
    PATTERN,
    (_match, lead: string, token: string) => `${lead}${EMOTICONS[token]}`,
  );
}
