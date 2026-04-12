import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull } from 'typeorm';
import { Note } from '../entities/note.entity';

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
  ) {}

  /**
   * Push a note update from the client.
    * The server stores whatever the client sends. Older clients send encrypted
    * payloads, while the current Google plaintext mode uploads raw text.
   */
  async upsertNote(userId: string, noteData: UpsertNoteDto): Promise<UpsertNoteResult> {
    let note = await this.noteRepo.findOne({
      where: { id: noteData.id, userId },
    });

    if (note) {
      // Update existing — the client must be based on the exact current server version.
      if (noteData.syncVersion !== note.syncVersion) {
        // Conflict: client and server are out of sync. Return server version for merge.
        return { status: 'conflict', note };
      }
      note.encryptedTitle = noteData.encryptedTitle;
      note.encryptedContent = noteData.encryptedContent;
      note.yjsState = noteData.yjsState ? Buffer.from(noteData.yjsState) : null;
      note.syncVersion = note.syncVersion + 1;
      note.deletedAt = noteData.deletedAt ? new Date(noteData.deletedAt) : null;
      const savedNote = await this.noteRepo.save(note);
      return { status: 'updated', note: savedNote };
    } else {
      // Create new note
      note = this.noteRepo.create({
        id: noteData.id,
        userId,
        encryptedTitle: noteData.encryptedTitle,
        encryptedContent: noteData.encryptedContent,
        yjsState: noteData.yjsState ? Buffer.from(noteData.yjsState) : null,
        syncVersion: 1,
        deletedAt: noteData.deletedAt ? new Date(noteData.deletedAt) : null,
      });
      const savedNote = await this.noteRepo.save(note);
      return { status: 'created', note: savedNote };
    }
  }

  /**
   * Pull notes updated since the given sync version
   */
  async listNoteChanges(userId: string, sinceVersion: number): Promise<{ notes: Note[]; latestVersion: number }> {
    const notes = await this.noteRepo.find({
      where: {
        userId,
        syncVersion: MoreThan(sinceVersion),
      },
      order: { syncVersion: 'ASC' },
    });

    const latestVersion = notes.length > 0
      ? Math.max(...notes.map(n => n.syncVersion))
      : sinceVersion;

    return { notes, latestVersion };
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
