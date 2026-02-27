import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: 'text', nullable: true })
  publicKey!: string | null; // Base64-encoded public key for sealed box encryption

  @CreateDateColumn()
  createdAt!: Date;
}
