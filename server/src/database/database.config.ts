import { DataSourceOptions } from 'typeorm';
import { Note } from '../entities/note.entity';
import { User } from '../entities/user.entity';
import { Image } from '../entities/image.entity';

export const databaseEntities = [Note, User, Image];

type DatabaseEnv = {
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_SYNCHRONIZE?: string;
  NODE_ENV?: string;
};

export function getDatabasePort(rawPort: string | undefined): number {
  const parsedPort = Number.parseInt(rawPort ?? '5432', 10);
  return Number.isNaN(parsedPort) ? 5432 : parsedPort;
}

export function parseBooleanEnv(rawValue: string | undefined): boolean | undefined {
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

export function createBaseDatabaseOptions(env: DatabaseEnv): DataSourceOptions {
  const databaseUrl = env.DATABASE_URL?.trim();
  const databaseHost = env.DB_HOST?.trim();
  const isProduction = env.NODE_ENV === 'production';
  const explicitSync = parseBooleanEnv(env.DB_SYNCHRONIZE);
  const shouldSynchronize = explicitSync ?? !isProduction;

  // 🔴 高风险防护：生产环境绝对禁止 synchronize=true
  // TypeORM synchronize 会在启动时自动执行 DDL（建表/改列/删列），
  // 在生产环境可能静默删除字段、触发数据丢失，必须使用 migration 管理结构变更。
  if (isProduction && shouldSynchronize) {
    throw new Error(
      '[SecureNotes] DB_SYNCHRONIZE=true is FORBIDDEN in production. ' +
      'Use migrations instead: npm run migration:run. ' +
      'Set DB_SYNCHRONIZE=false or remove it from your production environment.',
    );
  }

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
          port: getDatabasePort(env.DB_PORT),
          username: env.DB_USER || 'postgres',
          password: env.DB_PASSWORD || 'postgres',
          database: env.DB_NAME || 'securenotes',
        }),
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
    entities: databaseEntities,
    synchronize: shouldSynchronize,
    logging: env.NODE_ENV === 'development',
    extra: {
      max: 10,
      connectionTimeoutMillis: 10000,
    },
  };
}