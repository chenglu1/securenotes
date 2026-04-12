import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth/google')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('start')
  googleStart(@Query('state') state: string, @Res() res: any) {
    if (!state?.trim()) {
      throw new BadRequestException('Missing OAuth state');
    }

    return res.redirect(this.authService.getGoogleAuthorizationUrl(state));
  }

  @Get('callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: any,
  ) {
    if (!state?.trim()) {
      throw new BadRequestException('Missing OAuth state');
    }

    const callbackUrl = error
      ? this.authService.buildDesktopAuthErrorCallbackUrl(state, error)
      : this.authService.buildDesktopAuthSuccessCallbackUrl(
          await this.authService.authenticateWithGoogleCode(code ?? ''),
          state,
        );

    const title = error ? 'Google 登录未完成' : 'Google 登录成功';
    const description = error
      ? '授权流程已取消或未完成。返回 SecureNotes 后可以重新发起一次登录。'
      : '浏览器已经完成身份验证，正在返回 SecureNotes 继续处理加密同步。';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(
      this.authService.renderDesktopAuthCallbackPage(callbackUrl, title, description),
    );
  }
}
