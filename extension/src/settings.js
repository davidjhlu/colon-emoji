// Shared by the content script and the toolbar popup.
globalThis.COLON_EMOJI_DEFAULTS = {
  enabled: true,
  // These sites already have their own :emoji: menu, so two would stack.
  disabledSites: ['discord.com', 'app.slack.com', 'github.com'],
};
