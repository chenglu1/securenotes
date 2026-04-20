import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createBaseDatabaseOptions } from './database.config';
import { InitSchema1712371200000 } from './migrations/1712371200000-InitSchema';
import { AddGoogleAuthColumns1775952000000 } from './migrations/1775952000000-AddGoogleAuthColumns';
import { AddNoteChangeCursor1775955600000 } from './migrations/1775955600000-AddNoteChangeCursor';
import { AddNoteShares1775959200000 } from './migrations/1775959200000-AddNoteShares';

export default new DataSource({
  ...createBaseDatabaseOptions(process.env),
  synchronize: false,
  migrationsTableName: 'typeorm_migrations',
  migrations: [
    InitSchema1712371200000,
    AddGoogleAuthColumns1775952000000,
    AddNoteChangeCursor1775955600000,
    AddNoteShares1775959200000,
  ],
});