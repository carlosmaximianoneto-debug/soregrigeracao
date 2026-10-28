import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { matchesRelayBearer, ACTIVE_RELAY_FINGERPRINT } from '../operations/clicks/relay-auth.mjs';

const key = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.example_signature';
const fingerprint = createHash('sha256').update(key).digest('hex');

test('accepts only a Bearer whose bytes match the expected fingerprint', async () => {
  assert.equal(await matchesRelayBearer(`Bearer ${key}`, fingerprint), true);
  assert.equal(await matchesRelayBearer(`bearer ${key}`, fingerprint), false);
  assert.equal(await matchesRelayBearer(`Bearer ${key}different`, fingerprint), false);
  assert.equal(await matchesRelayBearer(`Bearer ${key.toUpperCase()}`, fingerprint), false);
});

test('rejects absent, malformed, oversized and non-Bearer authorization', async () => {
  for (const header of [null, undefined, '', key, `Basic ${key}`, 'Bearer', 'Bearer ', `Bearer  ${key}`, `Bearer ${key}\n`, `Bearer ${'x'.repeat(4097)}`]) {
    assert.equal(await matchesRelayBearer(header, fingerprint), false);
  }
});

test('rejects missing or malformed expected fingerprints and pins the active public-key fingerprint', async () => {
  for (const expected of ['', 'f'.repeat(63), 'G'.repeat(64), null]) {
    assert.equal(await matchesRelayBearer(`Bearer ${key}`, expected), false);
  }
  assert.equal(ACTIVE_RELAY_FINGERPRINT, 'f8bfcc2cc7655055e4d05eef557ef106cd86769aef5e3165b6734452dc5df1b3');
  assert.equal(await matchesRelayBearer(`Bearer ${key}`), false);
});
