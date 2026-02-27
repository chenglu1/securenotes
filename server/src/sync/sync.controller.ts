import { Controller, Post, Get, Body, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { SyncService, PushNoteDto } from './sync.service';
import { AuthService } from '../auth/auth.service';

@Controller('api/sync')
export class SyncController {
  constructor(
    private syncService: SyncService,
    private authService: AuthService,
  ) {}

  private async getUserId(authHeader?: string): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization');
    }
    const token = authHeader.slice(7);
    const { userId } = await this.authService.validateToken(token);
    return userId;
  }

  @Post('push')
  async push(
    @Body() body: PushNoteDto,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const note = await this.syncService.pushNote(userId, body);
    return { success: true, note };
  }

  @Get('pull')
  async pull(
    @Query('since') since: string,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const sinceVersion = parseInt(since) || 0;
    return this.syncService.pullNotes(userId, sinceVersion);
  }

  @Get('notes')
  async getAllNotes(@Headers('authorization') auth?: string) {
    const userId = await this.getUserId(auth);
    return this.syncService.getAllNotes(userId);
  }
}
