// Run with: npm test
const assert = require('assert');
const { JsonStreamParser } = require('./parser');

const p = new JsonStreamParser();

// 1. Two messages glued together in one chunk
let out = p.push('{"Event":"A","Data":{"x":1}}{"Event":"B","Data":{"y":"}{"}}');
assert.strictEqual(out.length, 2);
assert.strictEqual(out[1].Data.y, '}{', 'braces inside strings must be ignored');

// 2. One message split across two chunks
out = p.push('{"Event":"Goal","Da');
assert.strictEqual(out.length, 0);
out = p.push('ta":{"Speed":100}}');
assert.strictEqual(out.length, 1);
assert.strictEqual(out[0].Data.Speed, 100);

// 3. Data sent as a JSON-encoded string
out = p.push('{"Event":"C","Data":"{\\"z\\":5}"}');
assert.strictEqual(out[0].Data.z, 5);

// 4. Escaped quotes inside names
out = p.push('{"Event":"D","Data":{"Name":"Yeah\\"Mel"}}');
assert.strictEqual(out[0].Data.Name, 'Yeah"Mel');

console.log('All parser tests passed.');
