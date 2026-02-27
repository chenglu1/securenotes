import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { Note } from './entities/note.entity';
import { User } from './entities/user.entity';

@Module({
  imports: [
    // PostgreSQL connection
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'securenotes',
      entities: [Note, User],
      synchronize: process.env.NODE_ENV !== 'production', // Auto-create tables in dev
    }),

    // JWT authentication
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),

    AuthModule,
    SyncModule,
    CollaborationModule,
  ],
})
export class AppModule {}
