// Pure logic with no DOM access, so it can be unit tested in Node.
(() => {
  // A colon only starts an emoji when it isn't glued to the end of a word, URL or
  // another colon. This keeps "12:30", "http://x", "a:b" and "::before" quiet, while
  // still allowing back-to-back emoji such as "😄:heart:".
  const NOT_AFTER = '(?<![\\p{L}\\p{N}_:/\\\\])';
  const OPEN = new RegExp(`${NOT_AFTER}:([a-z0-9_+-]+)$`, 'iu');
  const CLOSED = new RegExp(`${NOT_AFTER}:([a-z0-9_+-]+):$`, 'iu');

  /** Finds a shortcode ending at the caret. `closed` means the user typed the final colon. */
  function findTrigger(textBeforeCaret) {
    const closed = CLOSED.exec(textBeforeCaret);
    if (closed) return { start: closed.index, query: closed[1].toLowerCase(), closed: true };
    const open = OPEN.exec(textBeforeCaret);
    if (open) return { start: open.index, query: open[1].toLowerCase(), closed: false };
    return null;
  }

  function createIndex(rows) {
    const byName = new Map();
    for (const [emoji, names] of rows) for (const name of names) byName.set(name, emoji);
    return { rows, byName };
  }

  // Lower is better.
  function nameTier(name, q) {
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(`_${q}`)) return 2;
    if (q.length >= 2 && name.includes(q)) return 3;
    return null;
  }

  /** Returns up to `limit` results, as [{ emoji, name }], best first. */
  function search(index, query, usage = {}, limit = 8) {
    const q = query.toLowerCase();
    const hits = [];

    index.rows.forEach(([emoji, names, tags], order) => {
      let tier = null;
      let name = names[0];
      for (const candidate of names) {
        const t = nameTier(candidate, q);
        if (t !== null && (tier === null || t < tier || (t === tier && candidate.length < name.length))) {
          tier = t;
          name = candidate;
        }
      }
      // Tags catch synonyms, such as :lol finding 😂. They rank below any real name match.
      if (tier === null && q.length >= 2 && tags.some((tag) => tag.startsWith(q))) tier = 4;
      if (tier !== null) hits.push({ emoji, name, tier, order, uses: usage[emoji] ?? 0 });
    });

    hits.sort(
      (a, b) =>
        a.tier - b.tier ||
        b.uses - a.uses ||
        // With one letter, name length is noise, so picker order (faces first) is better.
        (q.length > 1 ? a.name.length - b.name.length : 0) ||
        a.order - b.order,
    );
    return hits.slice(0, limit).map(({ emoji, name }) => ({ emoji, name }));
  }

  globalThis.ColonEmoji = { findTrigger, createIndex, search };
})();
