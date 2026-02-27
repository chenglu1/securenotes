import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from '../entities/note.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Note])],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
