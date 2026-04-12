import { shell } from 'electron';
import { randomBytes } from 'node:crypto';

export interface GoogleAuthResult {
  token: string;
  userId: string;
  keySalt: string;
  email?: string;
  isNewUser?: boolean;
}

type PendingGoogleAuth = {
  state: string;
  resolve: (result: GoogleAuthResult) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

export const APP_PROTOCOL = 'securenotes';

const AUTH_HOST = 'auth';
const AUTH_CALLBACK_PATH = '/callback';
const AUTH_TIMEOUT_MS = 120000;

let pendingGoogleAuth: PendingGoogleAuth | null = null;

export async function startGoogleAuth(startUrl: string): Promise<GoogleAuthResult> {
  if (pendingGoogleAuth) {
    throw new Error('已有 Google 登录流程正在进行，请先完成当前流程。');
  }

  const state = randomBytes(16).toString('hex');
  const authUrl = new URL(startUrl);
  authUrl.searchParams.set('state', state);

  const resultPromise = new Promise<GoogleAuthResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!pendingGoogleAuth || pendingGoogleAuth.state !== state) {
        return;
      }

      pendingGoogleAuth = null;
      reject(new Error('Google 登录超时，请重试。'));
    }, AUTH_TIMEOUT_MS);

    pendingGoogleAuth = { state, resolve, reject, timeout };
  });

  try {
    await shell.openExternal(authUrl.toString());
  } catch (error) {
    rejectPendingGoogleAuth(error);
  }

  return resultPromise;
}

export function handleGoogleAuthCallback(rawUrl: string): boolean {
  let callbackUrl: URL;

  try {
    callbackUrl = new URL(rawUrl);
  } catch {
    return false;
  }

  if (
    callbackUrl.protocol !== `${APP_PROTOCOL}:` ||
    callbackUrl.hostname !== AUTH_HOST ||
    callbackUrl.pathname !== AUTH_CALLBACK_PATH
  ) {
    return false;
  }

  const state = callbackUrl.searchParams.get('state');
  if (!pendingGoogleAuth || !state || pendingGoogleAuth.state !== state) {
    return true;
  }

  const currentAuth = pendingGoogleAuth;
  pendingGoogleAuth = null;
  clearTimeout(currentAuth.timeout);

  const error = callbackUrl.searchParams.get('error');
  if (error) {
    currentAuth.reject(new Error(formatGoogleAuthError(error)));
    return true;
  }

  const token = callbackUrl.searchParams.get('token');
  const userId = callbackUrl.searchParams.get('userId');
  const keySalt = callbackUrl.searchParams.get('keySalt');

  if (!token || !userId || !keySalt) {
    currentAuth.reject(new Error('Google 登录返回缺少必要参数。'));
    return true;
  }

  currentAuth.resolve({
    token,
    userId,
    keySalt,
    email: callbackUrl.searchParams.get('email') ?? undefined,
    isNewUser: callbackUrl.searchParams.get('isNewUser') === '1',
  });

  return true;
}

function rejectPendingGoogleAuth(reason: unknown) {
  if (!pendingGoogleAuth) {
    return;
  }

  const currentAuth = pendingGoogleAuth;
  pendingGoogleAuth = null;
  clearTimeout(currentAuth.timeout);
  currentAuth.reject(reason);
}

function formatGoogleAuthError(error: string): string {
  if (error === 'access_denied') {
    return 'Google 登录已取消。';
  }

  return `Google 登录失败：${error}`;
}