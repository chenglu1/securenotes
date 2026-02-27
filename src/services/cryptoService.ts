// End-to-End Encryption Service using libsodium-wrappers
// All encryption/decryption happens client-side — the server only sees ciphertext

let _sodium: typeof import('libsodium-wrappers') | null = null

/**
 * Initialize libsodium (must be called once before using crypto functions)
 */
export async function initCrypto(): Promise<void> {
  if (_sodium) return
  const sodium = await import('libsodium-wrappers')
  await sodium.ready
  _sodium = sodium
}

function getSodium() {
  if (!_sodium) throw new Error('Crypto not initialized. Call initCrypto() first.')
  return _sodium
}

// ── Key Management ──────────────────────────────────────

/**
 * Derive an encryption key from a user passphrase using Argon2id
 */
export function deriveKeyFromPassphrase(
  passphrase: string,
  salt?: Uint8Array
): { key: Uint8Array; salt: Uint8Array } {
  const sodium = getSodium()
  const _salt = salt ?? sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)

  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    passphrase,
    _salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  )

  return { key, salt: _salt }
}

/**
 * Generate a random encryption key (for per-note encryption)
 */
export function generateKey(): Uint8Array {
  const sodium = getSodium()
  return sodium.crypto_secretbox_keygen()
}

// ── Symmetric Encryption (for note content) ─────────────

/**
 * Encrypt plaintext using a symmetric key (XSalsa20-Poly1305)
 */
export function encrypt(plaintext: string, key: Uint8Array): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const sodium = getSodium()
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key)
  return { ciphertext, nonce }
}

/**
 * Decrypt ciphertext using a symmetric key
 */
export function decrypt(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): string {
  const sodium = getSodium()
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key)
  return sodium.to_string(plaintext)
}

// ── Sealed Box (for key sharing between collaborators) ──

/**
 * Generate a keypair for sealed box encryption
 */
export function generateKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const sodium = getSodium()
  const keyPair = sodium.crypto_box_keypair()
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey }
}

/**
 * Encrypt a message that only the recipient (with privateKey) can open
 */
export function sealedBoxEncrypt(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  const sodium = getSodium()
  return sodium.crypto_box_seal(message, recipientPublicKey)
}

/**
 * Open a sealed box message
 */
export function sealedBoxDecrypt(
  ciphertext: Uint8Array,
  publicKey: Uint8Array,
  privateKey: Uint8Array
): Uint8Array {
  const sodium = getSodium()
  return sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey)
}

// ── Utility Functions ───────────────────────────────────

/**
 * Encode bytes to base64 for storage/transmission
 */
export function toBase64(data: Uint8Array): string {
  const sodium = getSodium()
  return sodium.to_base64(data, sodium.base64_variants.ORIGINAL)
}

/**
 * Decode base64 back to bytes
 */
export function fromBase64(data: string): Uint8Array {
  const sodium = getSodium()
  return sodium.from_base64(data, sodium.base64_variants.ORIGINAL)
}

/**
 * Encrypt a note's content and return a serialized encrypted payload
 */
export function encryptNote(content: string, key: Uint8Array): string {
  const { ciphertext, nonce } = encrypt(content, key)
  return JSON.stringify({
    ct: toBase64(ciphertext),
    n: toBase64(nonce),
    v: 1, // encryption version
  })
}

/**
 * Decrypt an encrypted note payload
 */
export function decryptNote(encryptedPayload: string, key: Uint8Array): string {
  const { ct, n } = JSON.parse(encryptedPayload)
  return decrypt(fromBase64(ct), fromBase64(n), key)
}
