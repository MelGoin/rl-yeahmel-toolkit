// Shared helper: connects to the relay server and hands every update to your page.
// Usage:  RL.connect((msg) => { ...msg.live, msg.session, msg.event... });
window.RL = {
  connect(onMessage) {
    const open = () => {
      const ws = new WebSocket(`ws://${location.host}/ws`);
      ws.onmessage = (e) => onMessage(JSON.parse(e.data));
      ws.onclose = () => setTimeout(open, 2000); // auto-reconnect
    };
    open();
  },
  clock(seconds, overtime) {
    const s = Math.max(0, seconds | 0);
    const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return overtime ? `+${t}` : t;
  },
  // Ball speed comes in Unreal Units/sec. 1 UU = 1 cm, so x0.036 = km/h.
  kph: (uu) => Math.round((uu || 0) * 0.036),
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  // Optional: ?blue=1873FF&orange=C26418 in the URL overrides team colors.
  param: (k, d) => new URLSearchParams(location.search).get(k) || d,
};
