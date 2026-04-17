import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

export type NoteShareRole = 'viewer';

@Entity('note_shares')
@Unique('UQ_note_shares_note_recipient', ['noteId', 'sharedWithUserId'])
export class NoteShare {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'character varying' })
  noteId!: string;

  @Column({ type: 'uuid' })
  ownerUserId!: string;

  @Column({ type: 'uuid' })
  sharedWithUserId!: string;

  @Column({ type: 'character varying', default: 'viewer' })
  role!: NoteShareRole;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}