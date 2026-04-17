import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, MoreThan, IsNull } from 'typeorm';
import { Note } from '../entities/note.entity';
import { NoteShare, type NoteShareRole } from '../entities/note-share.entity';
import { User } from '../entities/user.entity';
import { UpsertNoteDto } from './dto/upsert-note.dto';

export interface NoteSummaryDto {
  id: string;
  encryptedTitle: string;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface NoteShareMemberDto {
  id: string;
  email: string;
  role: NoteShareRole;
  createdAt: Date;
}

export interface NoteShareStateDto {
  canInvite: boolean;
  reason: string | null;
  items: NoteShareMemberDto[];
}

export interface SharedNoteSummaryDto {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  ownerEmail: string;
  role: NoteShareRole;
}

export interface SharedNoteDetailDto extends SharedNoteSummaryDto {
  content: string;
}

const ENCRYPTED_VALUE_PREFIXES = ['sodium:v1:', 'enc:v1:'];

function isEncryptedStoredValue(value: string): boolean {
  return ENCRYPTED_VALUE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Note) private noteRepo: Repository<Note>,
    @InjectRepository(NoteShare) private noteShareRepo: Repository<NoteShare>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  private async getOwnedActiveNote(ownerUserId: string, noteId: string): Promise<Note> {
    const note = await this.noteRepo.findOne({
      where: {
        id: noteId,
        userId: ownerUserId,
        deletedAt: IsNull(),
      },
    });

    if (!note) {
      throw new NotFoundException('笔记不存在');
    }

    return note;
  }

  private getNoteShareability(note: Note): { canInvite: boolean; reason: string | null } {
    if (note.syncVersion <= 0) {
      return {
        canInvite: false,
        reason: '请先将当前文档同步到云端后再分享。',
      };
    }

    if (isEncryptedStoredValue(note.encryptedTitle) || isEncryptedStoredValue(note.encryptedContent)) {
      return {
        canInvite: false,
        reason: '当前文档仍使用端到端加密同步，暂不支持直接分享给其他账号。',
      };
    }

    return { canInvite: true, reason: null };
  }

  private async mapNoteShares(noteId: string, ownerUserId: string): Promise<NoteShareMemberDto[]> {
    const rows = await this.noteShareRepo
      .createQueryBuilder('share')
      .innerJoin(User, 'recipient', 'recipient.id = share."sharedWithUserId"')
      .select([
        'share.id AS "id"',
        'recipient.email AS "email"',
        'share.role AS "role"',
        'share.createdAt AS "createdAt"',
      ])
      .where('share."noteId" = :noteId', { noteId })
      .andWhere('share."ownerUserId" = :ownerUserId', { ownerUserId })
      .orderBy('share."createdAt"', 'ASC')
      .getRawMany<NoteShareMemberDto>();

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: new Date(row.createdAt),
    }));
  }

  private async allocateNextChangeVersion(manager: EntityManager, userId: string): Promise<number> {
    const userRepo = manager.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    user.latestNoteChangeVersion = (user.latestNoteChangeVersion ?? 0) + 1;
    await userRepo.save(user);
    return user.latestNoteChangeVersion;
  }

  /**
   * Push a note update from the client.
    * The server stores whatever the client sends. Older clients send encrypted
    * payloads, while the current Google plaintext mode uploads raw text.
   */
  async upsertNote(userId: string, noteId: string, noteData: UpsertNoteDto): Promise<UpsertNoteResult> {
      return this.dataSource.transaction(async (manager) => {
        const noteRepo = manager.getRepository(Note);
        let note = await noteRepo.findOne({
          where: { id: noteId, userId },
          lock: { mode: 'pessimistic_write' },
        });

        if (note) {
          if (noteData.syncVersion !== note.syncVersion) {
            return { status: 'conflict', note };
          }

          const nextChangeVersion = await this.allocateNextChangeVersion(manager, userId);
          note.encryptedTitle = noteData.encryptedTitle;
          note.encryptedContent = noteData.encryptedContent;
          note.yjsState = noteData.yjsState ? Buffer.from(noteData.yjsState) : null;
          note.syncVersion = note.syncVersion + 1;
          note.changeVersion = nextChangeVersion;
          note.deletedAt = noteData.deletedAt ? new Date(noteData.deletedAt) : null;
          const savedNote = await noteRepo.save(note);
          return { status: 'updated', note: savedNote };
        }

        const nextChangeVersion = await this.allocateNextChangeVersion(manager, userId);
        note = noteRepo.create({
          id: noteId,
          userId,
          encryptedTitle: noteData.encryptedTitle,
          encryptedContent: noteData.encryptedContent,
          yjsState: noteData.yjsState ? Buffer.from(noteData.yjsState) : null,
          syncVersion: 1,
          changeVersion: nextChangeVersion,
          deletedAt: noteData.deletedAt ? new Date(noteData.deletedAt) : null,
        });
        const savedNote = await noteRepo.save(note);
        return { status: 'created', note: savedNote };
      });
  }

  /**
     * Pull notes updated since the given global change version.
   */
    async listNoteChanges(userId: string, sinceChangeVersion: number): Promise<{ notes: Note[]; latestChangeVersion: number }> {
    const notes = await this.noteRepo.find({
      where: {
        userId,
          changeVersion: MoreThan(sinceChangeVersion),
      },
        order: { changeVersion: 'ASC' },
    });

      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: { latestNoteChangeVersion: true },
      });

      const latestChangeVersion = user?.latestNoteChangeVersion ?? sinceChangeVersion;

      return { notes, latestChangeVersion };
  }

  /**
   * Get note summaries for list views.
   */
  async listNoteSummaries(userId: string, query?: string): Promise<NoteSummaryDto[]> {
    const normalizedQuery = query?.trim();
    const queryBuilder = this.noteRepo
      .createQueryBuilder('note')
      .select([
        'note.id',
        'note.encryptedTitle',
        'note.syncVersion',
        'note.createdAt',
        'note.updatedAt',
        'note.deletedAt',
      ])
      .where('note.userId = :userId', { userId })
      .andWhere('note.deletedAt IS NULL')
      .orderBy('note.updatedAt', 'DESC');

    if (normalizedQuery) {
      // ⚠️ 注意：此处对 encryptedTitle 做明文模糊匹配。
      // 对于使用密码登录（password 模式）的用户，笔记标题已加密，搜索无法匹配明文内容。
      // 该搜索仅对 Google 登录（plaintext 模式，PLAINTEXT_SYNC_KEY）的用户有效，
      // 因为该模式下 encryptedTitle 存储的是明文。
      // 加密用户的全文搜索应在客户端本地 SQLite 完成，不依赖此端点。
      queryBuilder.andWhere('note.encryptedTitle ILIKE :query', {
        query: `%${normalizedQuery}%`,
      });
    }

    return queryBuilder.getMany();
  }

  /**
   * Get a note detail by id.
   */
  async getNoteDetail(userId: string, noteId: string): Promise<Note> {
    const note = await this.noteRepo.findOne({
      where: {
        id: noteId,
        userId,
        deletedAt: IsNull(),
      },
    });

    if (!note) {
      throw new NotFoundException('笔记不存在');
    }

    return note;
  }

  async getNoteShareState(ownerUserId: string, noteId: string): Promise<NoteShareStateDto> {
    const note = await this.getOwnedActiveNote(ownerUserId, noteId);
    const shareability = this.getNoteShareability(note);
    const items = await this.mapNoteShares(noteId, ownerUserId);

    return {
      canInvite: shareability.canInvite,
      reason: shareability.reason,
      items,
    };
  }

  async shareNoteWithUser(ownerUserId: string, noteId: string, email: string): Promise<NoteShareMemberDto> {
    const note = await this.getOwnedActiveNote(ownerUserId, noteId);
    const shareability = this.getNoteShareability(note);
    if (!shareability.canInvite) {
      throw new ConflictException(shareability.reason ?? '当前文档暂不支持分享。');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const recipient = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (!recipient) {
      throw new NotFoundException('未找到该用户，请确认对方已注册。');
    }

    if (recipient.id === ownerUserId) {
      throw new BadRequestException('不能把文档分享给自己。');
    }

    let share = await this.noteShareRepo.findOne({
      where: {
        noteId,
        sharedWithUserId: recipient.id,
      },
    });

    if (!share) {
      share = this.noteShareRepo.create({
        noteId,
        ownerUserId,
        sharedWithUserId: recipient.id,
        role: 'viewer',
      });
    }

    const savedShare = await this.noteShareRepo.save(share);
    return {
      id: savedShare.id,
      email: recipient.email,
      role: savedShare.role,
      createdAt: savedShare.createdAt,
    };
  }

  async revokeNoteShare(ownerUserId: string, noteId: string, shareId: string): Promise<void> {
    await this.getOwnedActiveNote(ownerUserId, noteId);

    const share = await this.noteShareRepo.findOne({
      where: {
        id: shareId,
        noteId,
        ownerUserId,
      },
    });

    if (!share) {
      throw new NotFoundException('分享记录不存在');
    }

    await this.noteShareRepo.delete(share.id);
  }

  async listSharedNotes(userId: string, query?: string): Promise<SharedNoteSummaryDto[]> {
    const normalizedQuery = query?.trim();
    const queryBuilder = this.noteShareRepo
      .createQueryBuilder('share')
      .innerJoin(Note, 'note', 'note.id = share."noteId"')
      .innerJoin(User, 'owner', 'owner.id = share."ownerUserId"')
      .select([
        'note.id AS "id"',
        'note."encryptedTitle" AS "title"',
        'note."createdAt" AS "createdAt"',
        'note."updatedAt" AS "updatedAt"',
        'owner.email AS "ownerEmail"',
        'share.role AS "role"',
      ])
      .where('share."sharedWithUserId" = :userId', { userId })
      .andWhere('note."deletedAt" IS NULL')
      .andWhere('note."encryptedTitle" NOT LIKE :encryptedPrefix', { encryptedPrefix: 'sodium:v1:%' })
      .andWhere('note."encryptedTitle" NOT LIKE :legacyPrefix', { legacyPrefix: 'enc:v1:%' })
      .orderBy('note."updatedAt"', 'DESC');

    if (normalizedQuery) {
      queryBuilder.andWhere('note."encryptedTitle" ILIKE :query', {
        query: `%${normalizedQuery}%`,
      });
    }

    const rows = await queryBuilder.getRawMany<SharedNoteSummaryDto>();
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      ownerEmail: row.ownerEmail,
      role: row.role,
    }));
  }

  async getSharedNoteDetail(userId: string, noteId: string): Promise<SharedNoteDetailDto> {
    const row = await this.noteShareRepo
      .createQueryBuilder('share')
      .innerJoin(Note, 'note', 'note.id = share."noteId"')
      .innerJoin(User, 'owner', 'owner.id = share."ownerUserId"')
      .select([
        'note.id AS "id"',
        'note."encryptedTitle" AS "title"',
        'note."encryptedContent" AS "content"',
        'note."createdAt" AS "createdAt"',
        'note."updatedAt" AS "updatedAt"',
        'owner.email AS "ownerEmail"',
        'share.role AS "role"',
      ])
      .where('share."sharedWithUserId" = :userId', { userId })
      .andWhere('share."noteId" = :noteId', { noteId })
      .andWhere('note."deletedAt" IS NULL')
      .andWhere('note."encryptedTitle" NOT LIKE :encryptedPrefix', { encryptedPrefix: 'sodium:v1:%' })
      .andWhere('note."encryptedTitle" NOT LIKE :legacyPrefix', { legacyPrefix: 'enc:v1:%' })
      .andWhere('note."encryptedContent" NOT LIKE :encryptedPrefix', { encryptedPrefix: 'sodium:v1:%' })
      .andWhere('note."encryptedContent" NOT LIKE :legacyPrefix', { legacyPrefix: 'enc:v1:%' })
      .getRawOne<SharedNoteDetailDto | null>();

    if (!row) {
      throw new NotFoundException('共享文档不存在或你没有访问权限。');
    }

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      ownerEmail: row.ownerEmail,
      role: row.role,
    };
  }
}

// UpsertNoteDto 已迁移至 ./dto/upsert-note.dto.ts，使用 class + class-validator 装饰器。
// 导出类型供其他模块使用（controller 直接从 dto 引入）。
export type { UpsertNoteDto };

export interface UpsertNoteResult {
  status: 'created' | 'updated' | 'conflict';
  note: Note;
}
