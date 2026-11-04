// A chat-style test page. Each editor keeps its own state, the way real sites do, so the
// tests can check what the app would actually send rather than what the DOM shows.
import { createEditor, $getRoot, KEY_ENTER_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical';
import { registerPlainText } from '@lexical/plain-text';
import { registerRichText } from '@lexical/rich-text';
import { registerHistory, createEmptyHistoryState } from '@lexical/history';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

window.sent = [];

// Records images handed to the page, as a site's upload handling would see them.
window.received = [];
async function record(via, files) {
  for (const file of files) {
    const { width } = await createImageBitmap(file);
    window.received.push({ via, type: file.type, width });
  }
}
document.addEventListener('paste', (e) => record('paste', e.clipboardData.files));

function mountLexical(id, register, sendOnEnter) {
  const editor = createEditor({ namespace: id, onError: (e) => { throw e; } });
  editor.setRootElement(document.getElementById(id));
  register(editor);
  registerHistory(editor, createEmptyHistoryState(), 0);
  const read = () => editor.getEditorState().read(() => $getRoot().getTextContent());
  if (sendOnEnter) {
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) return false;
        event?.preventDefault();
        window.sent.push(read());
        editor.update(() => $getRoot().clear());
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }
  return read;
}

window.lexicalChat = mountLexical('lexical-chat', registerPlainText, true);
window.lexicalRich = mountLexical('lexical-rich', registerRichText, false);

function ControlledBox() {
  const [value, setValue] = useState('');
  window.reactValue = value;
  return <textarea id="react" value={value} onChange={(e) => setValue(e.target.value)} />;
}
createRoot(document.getElementById('react-root')).render(<ControlledBox />);
