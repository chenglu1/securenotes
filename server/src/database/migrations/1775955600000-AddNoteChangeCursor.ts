import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddNoteChangeCursor1775955600000 implements MigrationInterface {
  name = 'AddNoteChangeCursor1775955600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const notesTable = await queryRunner.getTable('notes');
    if (notesTable && !notesTable.findColumnByName('changeVersion')) {
      await queryRunner.addColumn(
        'notes',
        new TableColumn({
          name: 'changeVersion',
          type: 'integer',
          default: 0,
        }),
      );
    }

    const usersTable = await queryRunner.getTable('users');
    if (usersTable && !usersTable.findColumnByName('latestNoteChangeVersion')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'latestNoteChangeVersion',
          type: 'integer',
          default: 0,
        }),
      );
    }

    await queryRunner.query(`UPDATE notes SET "changeVersion" = COALESCE("syncVersion", 0) WHERE "changeVersion" = 0`);
    await queryRunner.query(`
      UPDATE users
      SET "latestNoteChangeVersion" = COALESCE(source.max_change_version, 0)
      FROM (
        SELECT "userId", MAX("changeVersion") AS max_change_version
        FROM notes
        GROUP BY "userId"
      ) AS source
      WHERE users.id = source."userId"
    `);
  }

  public async down(): Promise<void> {
    return;
  }
}