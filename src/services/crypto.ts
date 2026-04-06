import sodium from 'libsodium-wrappers-sumo'

const KEY_PREFIX = 'sodium:v1';
const LEGACY_KEY_PREFIX = 'enc:v1';
const LEGACY_PBKDF2_ITERATIONS = 250000;
const LEGACY_DERIVED_KEY_LENGTH = 256;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

async function getSodium() {
  await sodium.ready;
  return sodium;
}

async function importDerivedKey(rawKeyBase64: string, keyUsages: KeyUsage[]): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(base64ToBytes(rawKeyBase64)),
    'AES-GCM',
    false,
    keyUsages,
  );
}

async function decryptLegacyText(value: string, rawKeyBase64: string): Promise<string> {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    return value;
  }

  const iv = base64ToBytes(parts[2]);
  const ciphertext = base64ToBytes(parts[3]);
  const key = await importDerivedKey(rawKeyBase64, ['decrypt']);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(ciphertext),
  );

  return decoder.decode(decryptedBuffer);
}

export async function deriveEncryptionKey(password: string, saltBase64: string): Promise<string> {
  const sodiumLib = await getSodium();
  const derivedKey = sodiumLib.crypto_pwhash(
    sodiumLib.crypto_secretbox_KEYBYTES,
    sodiumLib.from_string(password),
    sodiumLib.from_base64(saltBase64, sodiumLib.base64_variants.ORIGINAL),
    sodiumLib.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodiumLib.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodiumLib.crypto_pwhash_ALG_DEFAULT,
  );

  return sodiumLib.to_base64(derivedKey, sodiumLib.base64_variants.ORIGINAL);
}

export async function encryptText(plainText: string, rawKeyBase64: string): Promise<string> {
  const sodiumLib = await getSodium();
  const key = sodiumLib.from_base64(rawKeyBase64, sodiumLib.base64_variants.ORIGINAL);
  const nonce = sodiumLib.randombytes_buf(sodiumLib.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodiumLib.crypto_secretbox_easy(
    sodiumLib.from_string(plainText),
    nonce,
    key,
  );

  return `${KEY_PREFIX}:${sodiumLib.to_base64(nonce, sodiumLib.base64_variants.ORIGINAL)}:${sodiumLib.to_base64(ciphertext, sodiumLib.base64_variants.ORIGINAL)}`;
}

export async function decryptText(value: string, rawKeyBase64: string): Promise<string> {
  if (value.startsWith(`${LEGACY_KEY_PREFIX}:`)) {
    return decryptLegacyText(value, rawKeyBase64);
  }

  const parts = value.split(':');
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== KEY_PREFIX) {
    return value;
  }

  const sodiumLib = await getSodium();
  const key = sodiumLib.from_base64(rawKeyBase64, sodiumLib.base64_variants.ORIGINAL);
  const nonce = sodiumLib.from_base64(parts[2], sodiumLib.base64_variants.ORIGINAL);
  const ciphertext = sodiumLib.from_base64(parts[3], sodiumLib.base64_variants.ORIGINAL);
  const decrypted = sodiumLib.crypto_secretbox_open_easy(ciphertext, nonce, key);

  return sodiumLib.to_string(decrypted);
}