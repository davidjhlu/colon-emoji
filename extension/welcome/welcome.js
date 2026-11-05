function show(id) {
  for (const section of document.querySelectorAll('section')) section.hidden = section.id !== id;
}

document.getElementById('agree').addEventListener('click', async () => {
  await chrome.storage.local.set({ consented: true });
  show('done');
});

document.getElementById('decline').addEventListener('click', () => show('declined'));

chrome.storage.local.get({ consented: false }).then(({ consented }) => {
  if (consented) show('done');
});
