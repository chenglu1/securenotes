import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleAuthColumns1775952000000 implements MigrationInterface {
  name = 'AddGoogleAuthColumns1775952000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await this.ensureNullablePasswordHash(queryRunner);
    await this.ensureColumn(
      queryRunner,
      'users',
      new TableColumn({
        name: 'googleSub',
        type: 'character varying',
        isNullable: true,
        isUnique: true,
      }),
    );
    await this.ensureColumn(
      queryRunner,
      'users',
      new TableColumn({
        name: 'emailVerified',
        type: 'boolean',
        default: false,
      }),
    );
    await this.ensureColumn(
      queryRunner,
      'users',
      new TableColumn({
        name: 'keyVerifier',
        type: 'text',
        isNullable: true,
      }),
    );

    await queryRunner.query(
      'UPDATE "users" SET "emailVerified" = COALESCE("emailVerified", false)',
    );
  }

  public async down(): Promise<void> {
    // This migration is intentionally irreversible to avoid destructive schema rollback.
  }

  private async ensureNullablePasswordHash(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const passwordHashColumn = table?.findColumnByName('passwordHash');

    if (!passwordHashColumn || passwordHashColumn.isNullable) {
      return;
    }

    await queryRunner.changeColumn(
      'users',
      'passwordHash',
      new TableColumn({
        name: 'passwordHash',
        type: 'character varying',
        isNullable: true,
      }),
    );
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