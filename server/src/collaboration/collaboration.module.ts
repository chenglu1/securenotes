import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Note } from '../entities/note.entity';
import { CollaborationGateway } from './collaboration.gateway';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Note])],
  providers: [CollaborationGateway],
  exports: [CollaborationGateway],
})
export class CollaborationModule {}
