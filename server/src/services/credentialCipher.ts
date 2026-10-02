import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const KEY = crypto.scryptSync(env.dbCredentialsSecret, 'codegraph-db-creds', 32);

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptJson<T>(encoded: string): T {
  const [ivHex, authTagHex, ciphertextHex] = encoded.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('Malformed encrypted payload.');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

const encryptedPattern = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

// Secret strings (e.g. OAuth tokens) are stored encrypted. Rows written before
// encryption was introduced hold the plaintext value, which never matches the
// iv:tag:ciphertext shape, so they are read back unchanged. A value that can't
// be decrypted (rotated key) is treated as absent rather than failing the
// whole request — the user simply reconnects.
export function encryptSecret(value: string): string {
  return encryptJson(value);
}

export function revealSecret(stored: string | null): string | null {
  if (!stored) return null;
  if (!encryptedPattern.test(stored)) return stored;
  try {
    return decryptJson<string>(stored);
  } catch {
    return null;
  }
}
