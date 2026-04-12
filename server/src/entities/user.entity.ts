import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'character varying', nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'character varying', nullable: true, unique: true })
  googleSub!: string | null;

  @Column({ default: false })
  emailVerified!: boolean;

  @Column({ type: 'text', nullable: true })
  keyVerifier!: string | null;

  @Column({ type: 'text', nullable: true })
  publicKey!: string | null; // Base64-encoded public key for sealed box encryption

  @Column({ type: 'text', nullable: true })
  keySalt!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
