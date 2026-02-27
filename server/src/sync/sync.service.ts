import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Note } from '../entities/note.entity';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Note) private noteRepo: Repository<Note>,
  ) {}

  /**
   * Push a note update from the client.
   * The server stores encrypted content — it never sees plaintext.
   */
  async pushNote(userId: string, noteData: PushNoteDto): Promise<Note> {
    let note = await this.noteRepo.findOne({
      where: { id: noteData.id, userId },
    });

    if (note) {
      // Update existing — the client's version must be >= server's
      if (noteData.syncVersion < note.syncVersion) {
        // Conflict: client is behind. Return server version for merge.
        return note;
      }
      note.encryptedTitle = noteData.encryptedTitle;
      note.encryptedContent = noteData.encryptedContent;
      note.yjsState = noteData.yjsState ? Buffer.from(noteData.yjsState) : null;
      note.syncVersion = note.syncVersion + 1;
      note.deletedAt = noteData.deletedAt ? new Date(noteData.deletedAt) : null;
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
    }

    return this.noteRepo.save(note);
  }

  /**
   * Pull notes updated since the given sync version
   */
  async pullNotes(userId: string, sinceVersion: number): Promise<{ notes: Note[]; latestVersion: number }> {
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
   * Get all notes for a user
   */
  async getAllNotes(userId: string): Promise<Note[]> {
    return this.noteRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }
}

export interface PushNoteDto {
  id: string;
  encryptedTitle: string;
  encryptedContent: string;
  yjsState?: number[];
  syncVersion: number;
  deletedAt?: string;
}
