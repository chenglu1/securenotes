import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { config as loadEnvFile } from 'dotenv';
import { resolve } from 'node:path';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { UploadModule } from './upload/upload.module';
import { HealthModule } from './health/health.module';
import { createBaseDatabaseOptions } from './database/database.config';

const envFilePath = resolve(__dirname, '../.env');

loadEnvFile({
  path: envFilePath,
  override: true,
});

@Module({
  imports: [
    // Load environment variables from .env file
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
    }),

    // PostgreSQL connection with SSL support for cloud databases
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return createBaseDatabaseOptions({
          DATABASE_URL: configService.get<string>('DATABASE_URL'),
          DB_HOST: configService.get<string>('DB_HOST'),
          DB_PORT: configService.get<string>('DB_PORT'),
          DB_USER: configService.get<string>('DB_USER'),
          DB_PASSWORD: configService.get<string>('DB_PASSWORD'),
          DB_NAME: configService.get<string>('DB_NAME'),
          DB_SYNCHRONIZE: configService.get<string>('DB_SYNCHRONIZE'),
          NODE_ENV: configService.get<string>('NODE_ENV'),
        });
      },
    }),

    // JWT authentication
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET')?.trim();
        const nodeEnv = configService.get<string>('NODE_ENV');

        if (!jwtSecret && nodeEnv === 'production') {
          throw new Error('JWT_SECRET environment variable is required in production.');
        }

        return {
          secret: jwtSecret || 'dev-secret-change-in-production',
          signOptions: { expiresIn: '7d' },
        };
      },
    }),

    AuthModule,
    SyncModule,
    CollaborationModule,
    UploadModule,
    HealthModule,
  ],
})
export class AppModule {}
