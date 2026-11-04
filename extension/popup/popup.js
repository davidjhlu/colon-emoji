const enabledBox = document.getElementById('enabled');
const siteBox = document.getElementById('site-enabled');

async function init() {
  const settings = await chrome.storage.sync.get(globalThis.COLON_EMOJI_DEFAULTS);
  enabledBox.checked = settings.enabled;
  enabledBox.addEventListener('change', () => chrome.storage.sync.set({ enabled: enabledBox.checked }));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ? new URL(tab.url) : null;
  if (!url || !url.protocol.startsWith('http')) return;

  const host = url.hostname;
  document.getElementById('site').textContent = host;
  document.getElementById('site-row').hidden = false;
  siteBox.checked = !settings.disabledSites.includes(host);

  siteBox.addEventListener('change', async () => {
    const { disabledSites } = await chrome.storage.sync.get(globalThis.COLON_EMOJI_DEFAULTS);
    const others = disabledSites.filter((site) => site !== host);
    chrome.storage.sync.set({ disabledSites: siteBox.checked ? others : [...others, host] });
  });
}

init();
