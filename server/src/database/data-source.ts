import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createBaseDatabaseOptions } from './database.config';
import { InitSchema1712371200000 } from './migrations/1712371200000-InitSchema';

export default new DataSource({
  ...createBaseDatabaseOptions(process.env),
  synchronize: false,
  migrationsTableName: 'typeorm_migrations',
  migrations: [InitSchema1712371200000],
});