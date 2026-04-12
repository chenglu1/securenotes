import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, MoreThan, IsNull } from 'typeorm';
import { Note } from '../entities/note.entity';
import { User } from '../entities/user.entity';

export interface NoteSummaryDto {
  id: string;
  encryptedTitle: string;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Note) private noteRepo: Repository<Note>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

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
  async upsertNote(userId: string, noteData: UpsertNoteDto): Promise<UpsertNoteResult> {
      return this.dataSource.transaction(async (manager) => {
        const noteRepo = manager.getRepository(Note);
        let note = await noteRepo.findOne({
          where: { id: noteData.id, userId },
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
          id: noteData.id,
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
  async listNoteSummaries(userId: string): Promise<NoteSummaryDto[]> {
    return this.noteRepo.find({
      where: {
        userId,
        deletedAt: IsNull(),
      },
      select: {
        id: true,
        encryptedTitle: true,
        syncVersion: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
      order: { updatedAt: 'DESC' },
    });
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
}

export interface UpsertNoteDto {
  id: string;
  encryptedTitle: string;
  encryptedContent: string;
  yjsState?: number[];
  syncVersion: number;
  deletedAt?: string;
}

export interface UpsertNoteResult {
  status: 'created' | 'updated' | 'conflict';
  note: Note;
}
