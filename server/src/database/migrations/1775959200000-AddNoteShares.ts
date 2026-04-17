import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddNoteShares1775959200000 implements MigrationInterface {
  name = 'AddNoteShares1775959200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasNoteSharesTable = await queryRunner.hasTable('note_shares');

    if (!hasNoteSharesTable) {
      await queryRunner.createTable(
        new Table({
          name: 'note_shares',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'gen_random_uuid()',
            },
            {
              name: 'noteId',
              type: 'character varying',
            },
            {
              name: 'ownerUserId',
              type: 'uuid',
            },
            {
              name: 'sharedWithUserId',
              type: 'uuid',
            },
            {
              name: 'role',
              type: 'character varying',
              default: "'viewer'",
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
          ],
          uniques: [
            {
              name: 'UQ_note_shares_note_recipient',
              columnNames: ['noteId', 'sharedWithUserId'],
            },
          ],
        }),
      );
    }

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_note_shares_ownerUserId" ON "note_shares" ("ownerUserId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_note_shares_sharedWithUserId" ON "note_shares" ("sharedWithUserId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_note_shares_noteId" ON "note_shares" ("noteId")',
    );
  }

  public async down(): Promise<void> {
    return;
  }
}