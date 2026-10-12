// Only events from the current SSE handshake may be replayed after the next
// full snapshot. Reusing an old queue after reconnect can resurrect sessions
// that the fresh snapshot correctly removed, or revert newer status fields.
// No persistence and no content leaves the user's local browser.
export function createLiveEventBacklog() {
  let pending = [];
  return {
    begin() {
      pending = [];
    },
    add(name, data) {
      pending.push([name, data]);
    },
    drain(handle) {
      const events = pending;
      pending = [];
      for (const [name, data] of events) handle(name, data);
    },
    get size() {
      return pending.length;
    },
  };
}
