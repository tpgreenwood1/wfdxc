// Pure — imported by client components (SubmitForm) to filter the teacher's roster
// instantly on screen, so keep DB imports out of here.

/** Lowercase, strip accents, and treat hyphens/apostrophes/whitespace as word breaks,
 * so "Zoë O'Neil-Smith" matches "zoe", "neil" and "smith". */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[\s\-_.]+/g, " ")
    .trim();
}

/**
 * Filters a roster by what the teacher has typed. A runner matches when every typed
 * word is the start of some word in their name ("jam coo" → "Jamie Cooper"), or the
 * whole query appears anywhere in the name. Runners whose first name starts with the
 * first typed word come first; otherwise the roster's own order is kept.
 */
export function filterRoster<T extends { name: string }>(roster: T[], query: string): T[] {
  const q = normalizeName(query);
  if (!q) return roster;
  const tokens = q.split(" ");

  const strong: T[] = [];
  const weak: T[] = [];
  for (const runner of roster) {
    const name = normalizeName(runner.name);
    const words = name.split(" ");
    const tokensMatch = tokens.every((t) => words.some((w) => w.startsWith(t)));
    if (!tokensMatch && !name.includes(q)) continue;
    (words[0].startsWith(tokens[0]) ? strong : weak).push(runner);
  }
  return [...strong, ...weak];
}
