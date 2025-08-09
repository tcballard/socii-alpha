import nacl from 'tweetnacl';

const PK_KEY = 'socii_web_pk_hex';
const SK_KEY = 'socii_web_sk_hex';
const SEED_KEY = 'socii_web_seed_hex';

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return out;
}

export function getOrCreateIdentity() {
  if (typeof window === 'undefined') return { pubHex: '', sec: undefined as Uint8Array | undefined };
  let pubHex = localStorage.getItem(PK_KEY) || '';
  let secHex = localStorage.getItem(SK_KEY) || '';
  if (!pubHex || !secHex) {
    // Prefer deterministic seed if present
    const seedHex = localStorage.getItem(SEED_KEY);
    if (seedHex && seedHex.length >= 64) {
      const seed = fromHex(seedHex);
      const kp = nacl.sign.keyPair.fromSeed(seed);
      pubHex = toHex(kp.publicKey);
      secHex = toHex(kp.secretKey);
    } else {
      const seed = crypto.getRandomValues(new Uint8Array(32));
      localStorage.setItem(SEED_KEY, toHex(seed));
      const kp = nacl.sign.keyPair.fromSeed(seed);
      pubHex = toHex(kp.publicKey);
      secHex = toHex(kp.secretKey);
    }
    localStorage.setItem(PK_KEY, pubHex);
    localStorage.setItem(SK_KEY, secHex);
  }
  return { pubHex, sec: fromHex(secHex) };
}

export function resetIdentity() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PK_KEY);
  localStorage.removeItem(SK_KEY);
  localStorage.removeItem(SEED_KEY);
}

// Base32 (RFC4648) for human-friendly seed phrases without spaces
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(str: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  const clean = str.toUpperCase().replace(/=+$/g, '');
  for (const c of clean) {
    const idx = B32_ALPHABET.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function exportRecoveryPhrase(): string {
  const seedHex = localStorage.getItem(SEED_KEY);
  const seed = seedHex ? fromHex(seedHex) : new Uint8Array(32);
  return base32Encode(seed);
}

export function importRecoveryPhrase(phrase: string) {
  const seed = base32Decode(phrase.replace(/\s+/g, ''));
  if (seed.length !== 32) throw new Error('Invalid phrase');
  const kp = nacl.sign.keyPair.fromSeed(seed);
  localStorage.setItem(SEED_KEY, toHex(seed));
  localStorage.setItem(PK_KEY, toHex(kp.publicKey));
  localStorage.setItem(SK_KEY, toHex(kp.secretKey));
}


