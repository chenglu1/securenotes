import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { Note } from './entities/note.entity';
import { User } from './entities/user.entity';

@Module({
  imports: [
    // Load environment variables from .env file
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // PostgreSQL connection with SSL support for cloud databases
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'securenotes',
      // SSL 配置（云数据库必需）
      ssl: process.env.DB_HOST?.includes('neon.tech') ? { 
        rejectUnauthorized: false 
      } : false,
      entities: [Note, User],
      synchronize: process.env.NODE_ENV !== 'production', // Auto-create tables in dev
      logging: process.env.NODE_ENV === 'development',
      // 连接池配置
      extra: {
        max: 10,
        connectionTimeoutMillis: 10000,
      },
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
