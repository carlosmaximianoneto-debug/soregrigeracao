// Same public-credential fingerprint gate as operations/clicks/relay-auth.mjs.
// Kept in this deployment bundle so the new Edge function is self-contained.
// This is not a credential and is never enough to authenticate a request.
export const ACTIVE_RELAY_FINGERPRINT = 'f8bfcc2cc7655055e4d05eef557ef106cd86769aef5e3165b6734452dc5df1b3';

export async function matchesRelayBearer(authorization, expectedFingerprint = ACTIVE_RELAY_FINGERPRINT) {
  if (typeof authorization !== 'string' || authorization.length > 4103 ||
      typeof expectedFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(expectedFingerprint)) return false;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization);
  if (!match) return false;
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1])));
    const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    let mismatch = 0;
    for (let index = 0; index < hex.length; index++) mismatch |= hex.charCodeAt(index) ^ expectedFingerprint.charCodeAt(index);
    return mismatch === 0;
  } catch { return false; }
}
