import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('notes')
export class Note {
  @PrimaryColumn()
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'text', default: '' })
  encryptedTitle!: string;

  @Column({ type: 'text', default: '' })
  encryptedContent!: string;

  @Column({ type: 'bytea', nullable: true })
  yjsState!: Buffer | null;

  @Column({ default: 0 })
  syncVersion!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
