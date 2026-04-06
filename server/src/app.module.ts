import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { UploadModule } from './upload/upload.module';
import { HealthModule } from './health/health.module';
import { Note } from './entities/note.entity';
import { User } from './entities/user.entity';
import { Image } from './entities/image.entity';

function getDatabasePort(rawPort: string | undefined): number {
  const parsedPort = Number.parseInt(rawPort ?? '5432', 10);
  return Number.isNaN(parsedPort) ? 5432 : parsedPort;
}

function parseBooleanEnv(rawValue: string | undefined): boolean | undefined {
  if (!rawValue) {
    return undefined;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  return undefined;
}

@Module({
  imports: [
    // Load environment variables from .env file
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // PostgreSQL connection with SSL support for cloud databases
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL')?.trim();
        const databaseHost = configService.get<string>('DB_HOST')?.trim();
        const shouldSynchronize =
          parseBooleanEnv(configService.get<string>('DB_SYNCHRONIZE')) ??
          configService.get<string>('NODE_ENV') !== 'production';
        const shouldUseSsl = Boolean(
          databaseUrl?.includes('sslmode=require') ||
            databaseUrl?.includes('.neon.tech') ||
            databaseHost?.includes('neon.tech'),
        );

        return {
          type: 'postgres',
          ...(databaseUrl
            ? {
                url: databaseUrl,
              }
            : {
                host: databaseHost || 'localhost',
                port: getDatabasePort(configService.get<string>('DB_PORT')),
                username: configService.get<string>('DB_USER') || 'postgres',
                password: configService.get<string>('DB_PASSWORD') || 'postgres',
                database: configService.get<string>('DB_NAME') || 'securenotes',
              }),
          ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
          entities: [Note, User, Image],
          synchronize: shouldSynchronize,
          logging: configService.get<string>('NODE_ENV') === 'development',
          extra: {
            max: 10,
            connectionTimeoutMillis: 10000,
          },
        };
      },
    }),

    // JWT authentication
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET')?.trim();
        const nodeEnv = configService.get<string>('NODE_ENV');

        if (!jwtSecret && nodeEnv === 'production') {
          throw new Error('JWT_SECRET environment variable is required in production.');
        }

        return {
          global: true,
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
