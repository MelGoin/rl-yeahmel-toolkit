// Splits Rocket League's raw TCP stream into individual JSON messages.
//
// The Stats API sends JSON objects back-to-back with no separator, e.g.
//   {"Event":"UpdateState","Data":{...}}{"Event":"BallHit","Data":{...}}
// and a single message can also arrive split across two network packets.
// So we count curly braces (ignoring braces inside strings) to find where
// each object ends.

class JsonStreamParser {
  constructor() {
    this.buffer = '';
  }

  /** Feed a chunk of text. Returns an array of parsed messages. */
  push(chunk) {
    this.buffer += chunk;
    const messages = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;
    let consumed = 0;

    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}' && depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          const raw = this.buffer.slice(start, i + 1);
          consumed = i + 1;
          start = -1;
          const msg = normalize(raw);
          if (msg) messages.push(msg);
        }
      }
    }

    this.buffer = this.buffer.slice(consumed);
    // Safety valve: never let a broken stream eat all your memory.
    if (this.buffer.length > 5_000_000) this.buffer = '';
    return messages;
  }
}

/** Parse one envelope. Handles Data arriving as an object OR as a JSON string. */
function normalize(raw) {
  try {
    const msg = JSON.parse(raw);
    if (typeof msg.Data === 'string') {
      try { msg.Data = JSON.parse(msg.Data); } catch { /* leave as-is */ }
    }
    if (!msg.Event) return null;
    return msg;
  } catch {
    return null;
  }
}

module.exports = { JsonStreamParser, normalize };
