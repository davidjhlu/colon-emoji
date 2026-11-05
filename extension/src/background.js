// The Chrome Web Store requires consent inside the extension before it handles any data, so
// the content script stays idle until the user agrees on the welcome page.
chrome.runtime.onInstalled.addListener(async () => {
  const { consented } = await chrome.storage.local.get({ consented: false });
  if (!consented) chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
});
