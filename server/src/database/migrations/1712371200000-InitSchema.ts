import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';
import { randomBytes } from 'node:crypto';

export class InitSchema1712371200000 implements MigrationInterface {
  name = 'InitSchema1712371200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await this.ensureUsersTable(queryRunner);
    await this.ensureNotesTable(queryRunner);
    await this.ensureImagesTable(queryRunner);
  }

  public async down(): Promise<void> {
    // This migration is intentionally irreversible to avoid destructive schema rollback.
  }

  private async ensureUsersTable(queryRunner: QueryRunner): Promise<void> {
    const hasUsersTable = await queryRunner.hasTable('users');

    if (!hasUsersTable) {
      await queryRunner.createTable(
        new Table({
          name: 'users',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'gen_random_uuid()',
            },
            {
              name: 'email',
              type: 'character varying',
              isUnique: true,
            },
            {
              name: 'passwordHash',
              type: 'character varying',
            },
            {
              name: 'publicKey',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'keySalt',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
      );
      return;
    }

    await this.ensureColumn(
      queryRunner,
      'users',
      new TableColumn({
        name: 'publicKey',
        type: 'text',
        isNullable: true,
      }),
    );
    await this.ensureColumn(
      queryRunner,
      'users',
      new TableColumn({
        name: 'keySalt',
        type: 'text',
        isNullable: true,
      }),
    );

    await queryRunner.query(
      'UPDATE "users" SET "keySalt" = $1 WHERE "keySalt" IS NULL',
      [randomBytes(16).toString('base64')],
    );
  }

  private async ensureNotesTable(queryRunner: QueryRunner): Promise<void> {
    const hasNotesTable = await queryRunner.hasTable('notes');

    if (!hasNotesTable) {
      await queryRunner.createTable(
        new Table({
          name: 'notes',
          columns: [
            {
              name: 'id',
              type: 'character varying',
              isPrimary: true,
            },
            {
              name: 'userId',
              type: 'character varying',
            },
            {
              name: 'encryptedTitle',
              type: 'text',
              default: "''",
            },
            {
              name: 'encryptedContent',
              type: 'text',
              default: "''",
            },
            {
              name: 'yjsState',
              type: 'bytea',
              isNullable: true,
            },
            {
              name: 'syncVersion',
              type: 'integer',
              default: '0',
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'now()',
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'now()',
            },
            {
              name: 'deletedAt',
              type: 'timestamp',
              isNullable: true,
            },
          ],
        }),
      );
      return;
    }

    await this.ensureColumn(
      queryRunner,
      'notes',
      new TableColumn({
        name: 'yjsState',
        type: 'bytea',
        isNullable: true,
      }),
    );
    await this.ensureColumn(
      queryRunner,
      'notes',
      new TableColumn({
        name: 'deletedAt',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  private async ensureImagesTable(queryRunner: QueryRunner): Promise<void> {
    const hasImagesTable = await queryRunner.hasTable('images');

    if (!hasImagesTable) {
      await queryRunner.createTable(
        new Table({
          name: 'images',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'gen_random_uuid()',
            },
            {
              name: 'filename',
              type: 'character varying',
            },
            {
              name: 'mimetype',
              type: 'character varying',
            },
            {
              name: 'size',
              type: 'integer',
            },
            {
              name: 'data',
              type: 'bytea',
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
      );
    }
  }

  private async ensureColumn(
    queryRunner: QueryRunner,
    tableName: string,
    column: TableColumn,
  ): Promise<void> {
    if (!(await queryRunner.hasColumn(tableName, column.name))) {
      await queryRunner.addColumn(tableName, column);
    }
  }
}