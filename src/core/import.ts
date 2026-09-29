/**
 * Parses bulk card text. One card per line, either
 *   question<TAB>answer   (Anki "Notes in Plain Text" export)
 *   question ; answer
 * Lines starting with '#' (Anki export headers) and blank lines are skipped.
 * Basic HTML from Anki exports is stripped.
 */
export function parseBulk(text: string): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.includes('\t') ? line.split('\t') : line.split(/\s*;\s*/);
    if (parts.length < 2) continue;
    const question = stripHtml(parts[0]);
    const answer = stripHtml(parts.slice(1).join(line.includes('\t') ? ' ' : '; '));
    if (question && answer) out.push({ question, answer });
  }
  return out;
}

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/^"(.*)"$/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
