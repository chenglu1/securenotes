import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from '../entities/note.entity';
import { User } from '../entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsController } from './sessions.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Note])],
  controllers: [AuthController, SessionsController, UsersController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
