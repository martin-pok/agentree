// Capture the reader's position before replacing the chat markup. A reply may arrive while
// someone is reading an older message; only a new message they sent or a view already at
// the bottom should follow the conversation.
export function renderChatAtPosition(log, render, { ownMessage = false } = {}) {
  const top = log.scrollTop;
  const nearBottom = log.scrollHeight - log.clientHeight - top <= 24;
  render();
  log.scrollTop = ownMessage || nearBottom ? log.scrollHeight : top;
}
