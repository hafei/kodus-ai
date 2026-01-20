import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateIndexIntegrations1768919290453 implements MigrationInterface {
    name = 'UpdateIndexIntegrations1768919290453';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_integrations_platform_org_team" ON "integrations" ("platform", "organization_id", "team_id")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_integration_configs_value_gin" ON "integration_configs" ("configValue")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS "public"."IDX_integration_configs_value_gin"
        `);
        await queryRunner.query(`
            DROP INDEX IF EXISTS "public"."IDX_integrations_platform_org_team"
        `);
    }
}
