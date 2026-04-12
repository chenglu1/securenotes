import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createBaseDatabaseOptions } from './database.config';
import { InitSchema1712371200000 } from './migrations/1712371200000-InitSchema';
import { AddGoogleAuthColumns1775952000000 } from './migrations/1775952000000-AddGoogleAuthColumns';

export default new DataSource({
  ...createBaseDatabaseOptions(process.env),
  synchronize: false,
  migrationsTableName: 'typeorm_migrations',
  migrations: [InitSchema1712371200000, AddGoogleAuthColumns1775952000000],
});