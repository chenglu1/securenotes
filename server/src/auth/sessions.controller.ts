import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ok } from '../common/http/api-response';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @HttpCode(200)
  async createSession(@Body() body: { email: string; password: string }) {
    return ok(await this.authService.login(body.email, body.password), '登录成功');
  }
}