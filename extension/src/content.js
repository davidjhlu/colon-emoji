(() => {
  const { findTrigger, createIndex, search } = globalThis.ColonEmoji;
  const index = createIndex(globalThis.COLON_EMOJI_DATA);
  const LOOKBEHIND = 64; // No shortcode is longer than this, so don't read further back.
  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel']);

  // Sites inside an iframe follow the setting of the page the user is actually on.
  const ancestors = location.ancestorOrigins;
  const topHost = ancestors?.length ? new URL(ancestors[ancestors.length - 1]).hostname : location.hostname;

  let active = false;
  let usage = {};
  let menu = null; // { target, trigger, results, selected } while the menu is open
  let dismissed = null; // { target, start } after Esc, so the same shortcode stays quiet
  let ui = null;

  // ---- Settings ----

  function applySettings({ enabled, disabledSites }) {
    active = enabled && !disabledSites.includes(topHost);
    if (!active) closeMenu();
  }

  function loadSettings() {
    chrome.storage.sync.get(globalThis.COLON_EMOJI_DEFAULTS, applySettings);
  }

  loadSettings();
  chrome.storage.local.get({ usage: {} }, (stored) => (usage = stored.usage));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') loadSettings();
  });

  function recordUse(emoji) {
    usage[emoji] = (usage[emoji] ?? 0) + 1;
    try {
      chrome.storage.local.set({ usage });
    } catch {
      // Thrown if the extension was reloaded while this tab stayed open. Only ranking suffers.
    }
  }

  // ---- Reading the text before the caret ----

  function textControlContext(el) {
    if (el.selectionStart === null || el.selectionStart !== el.selectionEnd) return null;
    const caret = el.selectionStart;
    const offset = Math.max(0, caret - LOOKBEHIND);
    return {
      target: el,
      text: el.value.slice(offset, caret),
      select(start) {
        el.setSelectionRange(offset + start, caret);
      },
      rect: (start) => textControlRect(el, offset + start),
    };
  }

  function closestBlock(node, host) {
    let el = node.parentElement;
    while (el && el !== host && getComputedStyle(el).display.startsWith('inline')) el = el.parentElement;
    return el ?? host;
  }

  /** Normalises a caret sitting between elements into a text node and offset. */
  function caretInText(sel) {
    let node = sel.anchorNode;
    let offset = sel.anchorOffset;
    if (node.nodeType === Node.TEXT_NODE) return { node, offset };
    node = node.childNodes[offset - 1];
    while (node?.lastChild) node = node.lastChild;
    return node?.nodeType === Node.TEXT_NODE ? { node, offset: node.data.length } : null;
  }

  function editableContext(host) {
    const sel = getSelection();
    if (!sel?.isCollapsed || !sel.anchorNode || !host.contains(sel.anchorNode)) return null;
    const caret = caretInText(sel);
    if (!caret) return null;

    // Editors can split one line across several text nodes, so walk back through the
    // line, stopping at line breaks and at non-editable pieces such as @mentions.
    const parts = [{ node: caret.node, text: caret.node.data.slice(0, caret.offset) }];
    let length = parts[0].text.length;
    const walker = document.createTreeWalker(
      closestBlock(caret.node, host),
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    walker.currentNode = caret.node;
    while (length < LOOKBEHIND) {
      const node = walker.previousNode();
      if (!node) break;
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'BR' || node.isContentEditable === false) break;
        continue;
      }
      parts.unshift({ node, text: node.data });
      length += node.data.length;
    }

    const rangeFrom = (start) => {
      let remaining = start;
      const range = document.createRange();
      for (const part of parts) {
        if (remaining <= part.text.length) {
          range.setStart(part.node, remaining);
          break;
        }
        remaining -= part.text.length;
      }
      range.setEnd(caret.node, caret.offset);
      return range;
    };

    return {
      target: host,
      text: parts.map((p) => p.text).join(''),
      select(start) {
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(rangeFrom(start));
      },
      rect: (start) => rangeFrom(start).getBoundingClientRect(),
    };
  }

  function currentContext() {
    const el = document.activeElement;
    if (!el) return null;
    if (el.readOnly || el.disabled) return null;
    if (el.tagName === 'TEXTAREA') return textControlContext(el);
    if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has(el.type) ? textControlContext(el) : null;
    return el.isContentEditable ? editableContext(el) : null;
  }

  // ---- Inserting ----

  /** Sends a synthetic paste, which editors that block execCommand usually still accept. */
  function pasteText(target, text) {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }

  function replaceTrigger(ctx, start, emoji) {
    const { target } = ctx;
    const shortcode = ctx.text.slice(start);
    ctx.select(start);
    // Going through the browser's own editing command, rather than changing the DOM or
    // .value directly, is what lets React, Lexical and undo all see the change.
    document.execCommand('insertText', false, emoji);

    // Rich editors can apply the edit a moment later, so check on the next task.
    setTimeout(() => {
      const after = currentContext();
      if (after?.target === target && after.text.endsWith(shortcode)) {
        after.select(after.text.length - shortcode.length);
        if (target.isContentEditable) {
          pasteText(target, emoji);
        } else {
          target.setRangeText(emoji, target.selectionStart, target.selectionEnd, 'end');
          target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: emoji }));
        }
      }
    });
    recordUse(emoji);
  }

  function choose(position) {
    const { results, trigger } = menu;
    const ctx = currentContext();
    closeMenu();
    if (ctx) replaceTrigger(ctx, trigger.start, results[position].emoji);
  }

  // ---- Reacting to typing ----

  /** `typed` is false when the caret got here some other way, such as undo or arrow keys. */
  function refresh(typed) {
    if (!active) return;
    const ctx = currentContext();
    const trigger = ctx && findTrigger(ctx.text);
    if (!trigger) return closeMenu();

    if (trigger.closed) {
      closeMenu();
      const emoji = index.byName.get(trigger.query);
      if (emoji && typed) replaceTrigger(ctx, trigger.start, emoji);
      return;
    }

    if (dismissed?.target === ctx.target && dismissed.start === trigger.start) return closeMenu();
    dismissed = null;

    const results = search(index, trigger.query, usage);
    if (!results.length) return closeMenu();

    // After one letter nothing is preselected, so ":D" then Enter still sends the message.
    menu = { target: ctx.target, trigger, results, selected: trigger.query.length >= 2 ? 0 : -1 };
    render();
    position(ctx.rect(trigger.start));
  }

  const isTyping = (event) => event.inputType === 'insertText' || event.inputType === 'insertCompositionText';

  // Handle each keystroke inside its own input event, after the page's editor has seen it.
  // A timer can't do this job: Chrome runs queued key presses ahead of timers, so fast typing
  // would move the caret past the closing colon. Listening on window doesn't work either,
  // because Lexical (Meta's editor framework) stops input events from bubbling. So listen on the
  // editor element itself, where this listener runs after the ones the page added first.
  // The timer is only a fallback for editors that swallow the input event entirely.
  let fallback;
  const watched = new WeakSet();

  function onInput(event) {
    clearTimeout(fallback);
    if (!event.isComposing) refresh(isTyping(event));
  }

  document.addEventListener(
    'beforeinput',
    (event) => {
      if (event.isComposing || !active) return;
      if (!watched.has(event.target)) {
        watched.add(event.target);
        event.target.addEventListener('input', onInput);
      }
      clearTimeout(fallback);
      fallback = setTimeout(() => refresh(isTyping(event)));
    },
    true,
  );
  document.addEventListener('compositionend', () => setTimeout(() => refresh(true)), true);
  document.addEventListener('selectionchange', () => menu && refresh(false));
  document.addEventListener('focusout', () => closeMenu(), true);
  addEventListener('blur', () => closeMenu());
  addEventListener('resize', () => closeMenu());
  document.addEventListener(
    'scroll',
    () => {
      if (!menu) return;
      const ctx = currentContext();
      if (ctx) position(ctx.rect(menu.trigger.start));
    },
    true,
  );

  // Capturing on window runs before the page, so Enter picks an emoji instead of sending.
  addEventListener(
    'keydown',
    (event) => {
      if (!menu || event.isComposing) return;
      const count = menu.results.length;
      const consume = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      switch (event.key) {
        case 'ArrowDown':
          consume();
          menu.selected = (menu.selected + 1) % count;
          render();
          break;
        case 'ArrowUp':
          consume();
          menu.selected = (Math.max(menu.selected, 0) - 1 + count) % count;
          render();
          break;
        case 'Tab':
          if (event.shiftKey) return closeMenu();
          consume();
          choose(Math.max(menu.selected, 0));
          break;
        case 'Enter':
          if (event.shiftKey || menu.selected < 0) return closeMenu();
          consume();
          choose(menu.selected);
          break;
        case 'Escape':
          consume();
          dismissed = { target: menu.target, start: menu.trigger.start };
          closeMenu();
          break;
      }
    },
    true,
  );

  // ---- Menu UI ----

  const STYLES = `
    :host { all: initial; position: fixed; z-index: 2147483647; }
    .menu {
      --bg: #fff; --fg: #1c1e21; --muted: #65676b; --hover: #f0f2f5; --pick: #e4e9f7; --line: #dadde1;
      width: 280px; box-sizing: border-box; padding: 4px; border-radius: 10px;
      background: var(--bg); color: var(--fg); border: 1px solid var(--line);
      box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
      font: 14px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      .menu { --bg: #242526; --fg: #e4e6eb; --muted: #b0b3b8; --hover: #3a3b3c; --pick: #3b4a6b; --line: #3e4042; }
    }
    .row { display: flex; align-items: center; gap: 10px; padding: 5px 8px; border-radius: 6px; cursor: pointer; }
    .row:hover { background: var(--hover); }
    .row.picked { background: var(--pick); }
    .glyph { font-size: 20px; line-height: 1; width: 24px; text-align: center;
      font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hint { padding: 5px 8px 3px; color: var(--muted); font-size: 11px; }
  `;

  function ensureUi() {
    if (ui) return ui;
    const host = document.createElement('div');
    host.setAttribute('data-colon-emoji', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    const box = document.createElement('div');
    box.className = 'menu';
    box.setAttribute('role', 'listbox');
    shadow.append(style, box);

    // Keep focus in the text box when the menu is clicked.
    box.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const row = event.target.closest('.row');
      if (row && menu) choose(Number(row.dataset.position));
    });

    ui = { host, box };
    return ui;
  }

  function render() {
    const { host, box } = ensureUi();
    if (!host.isConnected) document.documentElement.append(host);
    box.replaceChildren(
      ...menu.results.map(({ emoji, name }, i) => {
        const row = document.createElement('div');
        row.className = i === menu.selected ? 'row picked' : 'row';
        row.dataset.position = i;
        row.setAttribute('role', 'option');
        const glyph = document.createElement('span');
        glyph.className = 'glyph';
        glyph.textContent = emoji;
        const label = document.createElement('span');
        label.className = 'name';
        label.textContent = `:${name}:`;
        row.append(glyph, label);
        return row;
      }),
    );
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = menu.selected < 0 ? 'Tab to insert · Esc to dismiss' : 'Enter or Tab to insert · Esc to dismiss';
    box.append(hint);
  }

  function position(caret) {
    const { host, box } = ui;
    const gap = 6;
    const { width, height } = box.getBoundingClientRect();
    const fitsBelow = caret.bottom + gap + height <= innerHeight;
    const top = fitsBelow ? caret.bottom + gap : Math.max(gap, caret.top - gap - height);
    const left = Math.max(gap, Math.min(caret.left, innerWidth - width - gap));
    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
  }

  function closeMenu() {
    menu = null;
    ui?.host.remove();
  }

  /** Measures where a character sits in an input or textarea, using a hidden copy of it. */
  function textControlRect(el, position) {
    const style = getComputedStyle(el);
    const mirror = document.createElement('div');
    for (const prop of [
      'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
      'textTransform', 'textIndent', 'wordSpacing', 'tabSize',
    ]) {
      mirror.style[prop] = style[prop];
    }
    Object.assign(mirror.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      visibility: 'hidden',
      overflow: 'hidden',
      whiteSpace: el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre',
      overflowWrap: 'break-word',
    });
    mirror.textContent = el.value.slice(0, position);
    const marker = document.createElement('span');
    marker.textContent = '​';
    mirror.append(marker);
    document.documentElement.append(mirror);
    const spot = marker.getBoundingClientRect();
    mirror.remove();

    const box = el.getBoundingClientRect();
    const left = box.left + spot.left - el.scrollLeft;
    const top = box.top + spot.top - el.scrollTop;
    return { left, top, bottom: top + spot.height };
  }
})();
