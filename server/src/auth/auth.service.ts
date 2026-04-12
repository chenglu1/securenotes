import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { request as httpsRequest } from 'node:https';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { Note } from '../entities/note.entity';
import { User } from '../entities/user.entity';

type AuthResult = {
  token: string;
  userId: string;
  keySalt: string;
  email: string;
  isNewUser?: boolean;
};

type AuthMethod = 'password' | 'google';

type GoogleTokenResponse = {
  id_token?: string;
  error?: string;
  error_description?: string;
};

const GOOGLE_SCOPE = 'openid email profile';
const DESKTOP_AUTH_CALLBACK_URL = 'securenotes://auth/callback';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Note) private noteRepo: Repository<Note>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const user = this.userRepo.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      googleSub: null,
      emailVerified: false,
      keySalt: randomBytes(16).toString('base64'),
      keyVerifier: null,
    });
    await this.userRepo.save(user);

    return this.buildAuthResult(user, false, 'password');
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses Google sign-in. Please continue with Google.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.ensureUserKeySalt(user);
    await this.userRepo.save(user);

    return this.buildAuthResult(user, false, 'password');
  }

  getGoogleAuthorizationUrl(state: string): string {
    if (!state.trim()) {
      throw new UnauthorizedException('Missing OAuth state');
    }

    const { clientId, redirectUri } = this.getGoogleOAuthConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPE,
      state,
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async authenticateWithGoogleCode(code: string): Promise<AuthResult> {
    if (!code.trim()) {
      throw new UnauthorizedException('Missing Google authorization code.');
    }

    const idToken = await this.exchangeGoogleCodeForIdToken(code);
    const payload = await this.verifyGoogleIdToken(idToken);

    if (!payload.email || !payload.sub) {
      throw new UnauthorizedException('Google account is missing required profile fields.');
    }

    if (!payload.email_verified) {
      throw new UnauthorizedException('Google account email is not verified.');
    }

    return this.loginWithGoogleProfile({
      email: payload.email,
      googleSub: payload.sub,
      emailVerified: Boolean(payload.email_verified),
    });
  }

  buildDesktopAuthSuccessCallbackUrl(result: AuthResult, state: string): string {
    const callbackUrl = new URL(DESKTOP_AUTH_CALLBACK_URL);
    callbackUrl.searchParams.set('state', state);
    callbackUrl.searchParams.set('token', result.token);
    callbackUrl.searchParams.set('userId', result.userId);
    callbackUrl.searchParams.set('keySalt', result.keySalt);
    callbackUrl.searchParams.set('email', result.email);
    callbackUrl.searchParams.set('isNewUser', result.isNewUser ? '1' : '0');
    return callbackUrl.toString();
  }

  buildDesktopAuthErrorCallbackUrl(state: string, error: string): string {
    const callbackUrl = new URL(DESKTOP_AUTH_CALLBACK_URL);
    callbackUrl.searchParams.set('state', state);
    callbackUrl.searchParams.set('error', error);
    return callbackUrl.toString();
  }

  renderDesktopAuthCallbackPage(callbackUrl: string, title: string, description: string): string {
    const escapedTitle = this.escapeHtml(title);
    const escapedDescription = this.escapeHtml(description);
    const escapedCallbackUrl = this.escapeHtml(callbackUrl);

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedTitle}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #f7f4ee 0%, #ffffff 100%);
        color: #2f3437;
      }

      main {
        width: min(460px, calc(100vw - 32px));
        padding: 32px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(55, 53, 47, 0.08);
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }

      p {
        margin: 0 0 24px;
        line-height: 1.7;
        color: #6f6a63;
      }

      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 999px;
        background: #2f3437;
        color: #ffffff;
        text-decoration: none;
        font-weight: 600;
      }

      small {
        display: block;
        margin-top: 16px;
        color: #9b978f;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapedTitle}</h1>
      <p>${escapedDescription}</p>
      <a href="${escapedCallbackUrl}">返回 SecureNotes</a>
      <small>如果应用没有自动唤起，请点击上方按钮返回桌面客户端。</small>
    </main>
    <script>
      window.location.replace(${JSON.stringify(callbackUrl)});
    </script>
  </body>
</html>`;
  }

  async validateToken(token: string): Promise<{ userId: string; email: string; authMethod: AuthMethod }> {
    try {
      const payload = this.jwtService.verify(token);
      return {
        userId: payload.sub,
        email: payload.email,
        authMethod: payload.authMethod === 'google' ? 'google' : 'password',
      };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async ensureSyncKeyVerifier(
    userId: string,
    keyVerifier: string,
    authMethod: AuthMethod,
  ): Promise<{ status: 'created' | 'verified' }> {
    if (!keyVerifier.trim()) {
      throw new UnauthorizedException('Missing sync key verifier.');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!user.keyVerifier) {
      const noteCount = await this.noteRepo.count({ where: { userId } });
      if (noteCount > 0 && authMethod !== 'password') {
        throw new ConflictException(
          '该账号已有云端加密数据，请先用原邮箱密码登录一次以初始化同步口令校验，再使用 Google 登录。',
        );
      }

      user.keyVerifier = keyVerifier;
      await this.userRepo.save(user);
      return { status: 'created' };
    }

    if (user.keyVerifier !== keyVerifier) {
      throw new UnauthorizedException('同步口令不正确，请确认后重试。');
    }

    return { status: 'verified' };
  }

  private async loginWithGoogleProfile(profile: {
    email: string;
    googleSub: string;
    emailVerified: boolean;
  }): Promise<AuthResult> {
    let user = await this.userRepo.findOne({ where: { googleSub: profile.googleSub } });
    let isNewUser = false;

    if (!user) {
      user = await this.userRepo.findOne({ where: { email: profile.email } });
    }

    if (!user) {
      user = this.userRepo.create({
        email: profile.email,
        passwordHash: null,
        googleSub: profile.googleSub,
        emailVerified: profile.emailVerified,
        keySalt: randomBytes(16).toString('base64'),
        keyVerifier: null,
      });
      isNewUser = true;
    } else {
      user.googleSub = user.googleSub ?? profile.googleSub;
      user.emailVerified = profile.emailVerified || user.emailVerified;
    }

    await this.ensureUserKeySalt(user);
    await this.userRepo.save(user);

    return this.buildAuthResult(user, isNewUser, 'google');
  }

  private async ensureUserKeySalt(user: User): Promise<void> {
    if (!user.keySalt) {
      user.keySalt = randomBytes(16).toString('base64');
    }
  }

  private buildAuthResult(user: User, isNewUser: boolean, authMethod: AuthMethod): AuthResult {
    if (!user.keySalt) {
      throw new InternalServerErrorException('Missing key salt for user.');
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email, authMethod });
    return {
      token,
      userId: user.id,
      keySalt: user.keySalt,
      email: user.email,
      isNewUser,
    };
  }

  private async exchangeGoogleCodeForIdToken(code: string): Promise<string> {
    const { clientId, clientSecret, redirectUri } = this.getGoogleOAuthConfig();
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const { statusCode, body } = await this.postGoogleForm(
      'https://oauth2.googleapis.com/token',
      params,
    );

    let payload: GoogleTokenResponse | null = null;
    try {
      payload = JSON.parse(body) as GoogleTokenResponse;
    } catch {
      payload = null;
    }

    if (statusCode < 200 || statusCode >= 300 || !payload?.id_token) {
      throw new UnauthorizedException(
        payload?.error_description || payload?.error || 'Google token exchange failed.',
      );
    }

    return payload.id_token;
  }

  private async postGoogleForm(
    endpoint: string,
    params: URLSearchParams,
  ): Promise<{ statusCode: number; body: string }> {
    const proxyUrl =
      this.configService.get<string>('HTTPS_PROXY')?.trim() ||
      this.configService.get<string>('HTTP_PROXY')?.trim() ||
      this.configService.get<string>('https_proxy')?.trim() ||
      this.configService.get<string>('http_proxy')?.trim();

    return new Promise((resolve, reject) => {
      const targetUrl = new URL(endpoint);
      const requestBody = params.toString();
      const request = httpsRequest(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(requestBody).toString(),
          },
          agent: proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined,
        },
        (response) => {
          let responseBody = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            responseBody += chunk;
          });
          response.on('end', () => {
            resolve({
              statusCode: response.statusCode ?? 500,
              body: responseBody,
            });
          });
        },
      );

      request.setTimeout(15000, () => {
        request.destroy(new Error('Google token request timed out.'));
      });

      request.on('error', (error) => {
        reject(new InternalServerErrorException(`Google token request failed: ${error.message}`));
      });

      request.write(requestBody);
      request.end();
    });
  }

  private async verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
    const { clientId } = this.getGoogleOAuthConfig();
    const googleClient = new OAuth2Client(clientId);
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Failed to verify Google identity token.');
    }

    return payload;
  }

  private getGoogleOAuthConfig(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    const redirectUri = this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI')?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
      throw new InternalServerErrorException('Google OAuth is not configured on the server.');
    }

    if (
      clientId.includes('dummy-client-id') ||
      clientId.includes('your-google-client-id') ||
      clientSecret.includes('your-google-client-secret')
    ) {
      throw new InternalServerErrorException(
        'Google OAuth is using placeholder credentials. Check server/.env and terminal environment overrides.',
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
