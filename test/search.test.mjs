import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/src/emoji-data.js';
import '../extension/src/search.js';

const { findTrigger, createIndex, search } = globalThis.ColonEmoji;
const index = createIndex(globalThis.COLON_EMOJI_DATA);

test('common Discord shortcodes resolve to the expected emoji', () => {
  const expected = {
    smile: '😄', joy: '😂', sob: '😭', heart: '❤️', fire: '🔥', thumbsup: '👍', '+1': '👍',
    '-1': '👎', eyes: '👀', skull: '💀', pray: '🙏', tada: '🎉', thinking: '🤔', rofl: '🤣',
    wave: '👋', clap: '👏', '100': '💯', sparkles: '✨', pensive: '😔', grinning: '😀',
  };
  for (const [name, emoji] of Object.entries(expected)) {
    assert.equal(index.byName.get(name), emoji, `:${name}:`);
  }
});

test('trigger detection starts on a colon that begins a word', () => {
  assert.deepEqual(findTrigger(':sm'), { start: 0, query: 'sm', closed: false });
  assert.deepEqual(findTrigger('hi :sm'), { start: 3, query: 'sm', closed: false });
  assert.deepEqual(findTrigger('hi\n:sm'), { start: 3, query: 'sm', closed: false });
  assert.deepEqual(findTrigger('(:sm'), { start: 1, query: 'sm', closed: false });
  assert.deepEqual(findTrigger('hi :smile:'), { start: 3, query: 'smile', closed: true });
  assert.deepEqual(findTrigger('😄:heart'), { start: 2, query: 'heart', closed: false });
  assert.deepEqual(findTrigger(':SMILE:'), { start: 0, query: 'smile', closed: true });
});

test('trigger detection ignores colons that are not emoji', () => {
  for (const text of ['12:30', 'http://x', 'https:', 'a:b', '::before', 'note: ', ':', ': x', ':)', 'x/:id', 'foo:bar:']) {
    assert.equal(findTrigger(text), null, text);
  }
});

test('search ranks exact, then prefix, then word matches', () => {
  assert.equal(search(index, 'smile')[0].emoji, '😄');
  assert.equal(search(index, 'heart')[0].emoji, '❤️');
  assert.ok(search(index, 'eyes').some((r) => r.name === 'heart_eyes'));
  assert.equal(search(index, 'xqzq').length, 0);
});

test('tags find synonyms and usage lifts an emoji within its tier', () => {
  assert.ok(search(index, 'lol').some((r) => r.emoji === '😂' || r.emoji === '🤣'));
  const plain = search(index, 'sm');
  const last = plain[plain.length - 1];
  assert.equal(search(index, 'sm', { [last.emoji]: 5 })[0].emoji, last.emoji);
});

test('results respect the limit', () => {
  assert.equal(search(index, 's').length, 8);
});
