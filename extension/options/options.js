const SEND_SIZE = 64; // Messenger shows images at about their real size, so this sets how big they look.
const MAX_GIF_BYTES = 1024 * 1024; // GIFs can't be shrunk without losing their animation.
const VALID_NAME = /^[a-z0-9_+-]{2,32}$/;

const form = document.getElementById('add');
const fileInput = document.getElementById('file');
const nameInput = document.getElementById('name');
const message = document.getElementById('message');
const list = document.getElementById('list');

function say(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function nameFromFile(fileName) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_+-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function prepareImage(file) {
  if (file.type === 'image/gif') {
    if (file.size > MAX_GIF_BYTES) throw new Error('That GIF is over 1 MB. Try a smaller one.');
    return { type: 'image/gif', dataUrl: await readAsDataUrl(file) };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(SEND_SIZE / bitmap.width, SEND_SIZE / bitmap.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { type: 'image/png', dataUrl: canvas.toDataURL('image/png') };
}

async function getNames() {
  return (await chrome.storage.local.get({ customNames: [] })).customNames;
}

async function render() {
  const names = await getNames();
  const stored = await chrome.storage.local.get(names.map((name) => `custom:${name}`));
  document.getElementById('empty').hidden = names.length > 0;
  document.getElementById('count').textContent = names.length ? `(${names.length})` : '';

  list.replaceChildren(
    ...names.map((name) => {
      const item = document.createElement('li');
      const image = document.createElement('img');
      image.src = stored[`custom:${name}`].dataUrl;
      image.alt = '';
      const label = document.createElement('span');
      label.textContent = `:${name}:`;
      label.title = `:${name}:`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete ${name}`);
      remove.addEventListener('click', () => removeEmoji(name));
      item.append(image, label, remove);
      return item;
    }),
  );
}

async function removeEmoji(name) {
  const names = await getNames();
  await chrome.storage.local.set({ customNames: names.filter((n) => n !== name) });
  await chrome.storage.local.remove(`custom:${name}`);
  say(`Deleted :${name}:`);
  render();
}

fileInput.addEventListener('change', () => {
  const [file] = fileInput.files;
  if (file && !nameInput.value) nameInput.value = nameFromFile(file.name);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const [file] = fileInput.files;
  const name = nameInput.value.trim().toLowerCase();

  if (!VALID_NAME.test(name)) {
    say('Names need 2 to 32 characters: letters, numbers, _, + or -.', true);
    return;
  }
  const names = await getNames();
  if (names.includes(name)) {
    say(`You already have :${name}:. Delete it first or pick another name.`, true);
    return;
  }

  try {
    const image = await prepareImage(file);
    // Write the image first, so a tab can never see a name with no image behind it.
    await chrome.storage.local.set({ [`custom:${name}`]: image });
    await chrome.storage.local.set({ customNames: [...names, name] });
    form.reset();
    say(`Added :${name}:`);
    render();
  } catch (error) {
    say(error.message || "That image couldn't be read.", true);
  }
});

render();
