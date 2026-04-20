import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { UpsertNoteDto } from './dto/upsert-note.dto';
import { ShareNoteDto } from './dto/share-note.dto';
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
    const result = await this.syncService.upsertNote(userId, id, body);
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
    const sinceChangeVersion = parseInt(sinceVersion, 10);
    const result = await this.syncService.listNoteChanges(
      userId,
      Number.isFinite(sinceChangeVersion) && sinceChangeVersion > 0 ? sinceChangeVersion : 0,
    );
    return ok(
      {
        items: result.notes,
        latestChangeVersion: result.latestChangeVersion,
      },
      '获取笔记增量成功',
    );
  }

  @Get()
  @HttpCode(200)
  async listNotes(
    @Query('query') query: string | undefined,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const notes = await this.syncService.listNoteSummaries(userId, query);
    return ok(
      {
        items: notes,
        total: notes.length,
      },
      '获取笔记列表成功',
    );
  }

  @Get('shared')
  @HttpCode(200)
  async listSharedNotes(
    @Query('query') query: string | undefined,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const notes = await this.syncService.listSharedNotes(userId, query);
    return ok(
      {
        items: notes,
        total: notes.length,
      },
      '获取共享文档列表成功',
    );
  }

  @Get('shared/:id')
  @HttpCode(200)
  async getSharedNoteDetail(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const note = await this.syncService.getSharedNoteDetail(userId, id);
    return ok(note, '获取共享文档详情成功');
  }

  @Get(':id/shares')
  @HttpCode(200)
  async getNoteShareState(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const state = await this.syncService.getNoteShareState(userId, id);
    return ok(state, '获取分享状态成功');
  }

  @Get(':id/shares/candidates')
  @HttpCode(200)
  async searchShareCandidates(
    @Param('id') id: string,
    @Query('query') query: string | undefined,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const candidates = await this.syncService.searchShareCandidates(userId, id, query);
    return ok(
      {
        items: candidates,
        total: candidates.length,
      },
      '获取可分享成员成功',
    );
  }

  @Post(':id/shares')
  @HttpCode(200)
  async shareNote(
    @Param('id') id: string,
    @Body() body: ShareNoteDto,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    const share = await this.syncService.shareNoteWithUser(userId, id, body.email);
    return ok(share, '文档分享成功');
  }

  @Delete(':id/shares/:shareId')
  @HttpCode(200)
  async revokeNoteShare(
    @Param('id') id: string,
    @Param('shareId') shareId: string,
    @Headers('authorization') auth?: string,
  ) {
    const userId = await this.getUserId(auth);
    await this.syncService.revokeNoteShare(userId, id, shareId);
    return ok({ success: true }, '已取消文档分享');
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
