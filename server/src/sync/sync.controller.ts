import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { SyncService, UpsertNoteDto } from './sync.service';
import { AuthService } from '../auth/auth.service';
import { ok } from '../common/http/api-response';

@Controller('notes')
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

  @Put(':id')
  async upsert(
    @Param('id') id: string,
    @Body() body: UpsertNoteDto,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const result = await this.syncService.upsertNote(userId, { ...body, id } as UpsertNoteDto & { id: string });
    if (result.status === 'conflict') {
      throw new ConflictException({
        message: 'Note version conflict',
        data: {
          action: result.status,
          note: result.note,
        },
      });
    }

    return ok(
      {
        action: result.status,
        note: result.note,
      },
      result.status === 'created' ? '笔记创建成功' : '笔记更新成功',
    );
  }

  @Get('changes')
  @HttpCode(200)
  async listChanges(
    @Query('sinceVersion') sinceVersion: string,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const latestVersion = parseInt(sinceVersion) || 0;
    const result = await this.syncService.listNoteChanges(userId, latestVersion);
    return ok(
      {
        items: result.notes,
        latestVersion: result.latestVersion,
      },
      '获取笔记增量成功',
    );
  }

  @Get()
  @HttpCode(200)
  async listNotes(@Headers('authorization') auth?: string) {
    const userId = await this.getUserId(auth);
    const notes = await this.syncService.listNoteSummaries(userId);
    return ok(
      {
        items: notes,
        total: notes.length,
      },
      '获取笔记列表成功',
    );
  }

  @Get(':id')
  @HttpCode(200)
  async getNoteDetail(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const note = await this.syncService.getNoteDetail(userId, id);
    return ok(note, '获取笔记详情成功');
  }
}
