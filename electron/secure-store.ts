import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

interface AuthSession {
  token: string;
  userId: string;
  email?: string;
}

interface SecureStorePayload {
  authSession: AuthSession | null;
  encryptionKeys: Record<string, string>;
  noteSyncCursors: Record<string, number>;
}

const ENCRYPTED_STORE_FILE = 'secure-store.bin';
const FALLBACK_STORE_FILE = 'secure-store.json';

function getEmptyPayload(): SecureStorePayload {
  return {
    authSession: null,
    encryptionKeys: {},
    noteSyncCursors: {},
  };
}

function ensureUserDataDir(): string {
  const userDataDir = app.getPath('userData');
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true });
  }
  return userDataDir;
}

function getEncryptedStorePath(): string {
  return join(ensureUserDataDir(), ENCRYPTED_STORE_FILE);
}

function getFallbackStorePath(): string {
  return join(ensureUserDataDir(), FALLBACK_STORE_FILE);
}

function readPayload(): SecureStorePayload {
  const encryptedPath = getEncryptedStorePath();
  const fallbackPath = getFallbackStorePath();

  try {
    if (existsSync(encryptedPath) && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = readFileSync(encryptedPath);
      const decryptedJson = safeStorage.decryptString(encryptedBuffer);
      return {
        ...getEmptyPayload(),
        ...(JSON.parse(decryptedJson) as Partial<SecureStorePayload>),
      };
    }

    if (existsSync(fallbackPath)) {
      const rawJson = readFileSync(fallbackPath, 'utf8');
      return {
        ...getEmptyPayload(),
        ...(JSON.parse(rawJson) as Partial<SecureStorePayload>),
      };
    }
  } catch {
    return getEmptyPayload();
  }

  return getEmptyPayload();
}

function writePayload(payload: SecureStorePayload): void {
  const encryptedPath = getEncryptedStorePath();
  const fallbackPath = getFallbackStorePath();
  const rawJson = JSON.stringify(payload);

  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(encryptedPath, safeStorage.encryptString(rawJson));
    if (existsSync(fallbackPath)) {
      unlinkSync(fallbackPath);
    }
    return;
  }

  writeFileSync(fallbackPath, rawJson, 'utf8');
  if (existsSync(encryptedPath)) {
    unlinkSync(encryptedPath);
  }
}

export function getAuthSession(): AuthSession | null {
  return readPayload().authSession;
}

export function saveAuthSession(session: AuthSession): void {
  const payload = readPayload();
  payload.authSession = session;
  writePayload(payload);
}

export function clearAuthSession(): void {
  const payload = readPayload();
  payload.authSession = null;
  writePayload(payload);
}

export function getEncryptionKey(userId: string): string | null {
  return readPayload().encryptionKeys[userId] ?? null;
}

export function saveEncryptionKey(userId: string, key: string): void {
  const payload = readPayload();
  payload.encryptionKeys[userId] = key;
  writePayload(payload);
}

export function clearEncryptionKey(userId: string): void {
  const payload = readPayload();
  delete payload.encryptionKeys[userId];
  writePayload(payload);
}

export function getNoteSyncCursor(userId: string): number {
  return readPayload().noteSyncCursors[userId] ?? 0;
}

export function saveNoteSyncCursor(userId: string, cursor: number): void {
  const payload = readPayload();
  payload.noteSyncCursors[userId] = cursor;
  writePayload(payload);
}

export function clearNoteSyncCursor(userId: string): void {
  const payload = readPayload();
  delete payload.noteSyncCursors[userId];
  writePayload(payload);
}