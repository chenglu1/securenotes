import { Body, Controller, Headers, HttpCode, Post, Put, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ok } from '../common/http/api-response';

@Controller('users')
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @HttpCode(201)
  async createUser(@Body() body: { email: string; password: string }) {
    return ok(await this.authService.register(body.email, body.password), '注册成功');
  }

  @Put('me/sync-key-verifier')
  @HttpCode(200)
  async putSyncKeyVerifier(
    @Body() body: { keyVerifier: string },
    @Headers('authorization') auth?: string,
  ) {
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization');
    }

    const token = auth.slice(7);
    const { userId, authMethod } = await this.authService.validateToken(token);
    return ok(
      await this.authService.ensureSyncKeyVerifier(userId, body.keyVerifier, authMethod),
      '同步密钥校验成功',
    );
  }
}