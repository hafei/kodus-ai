import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationEngine1778257600650 implements MigrationInterface {
    name = 'NotificationEngine1778257600650'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "kodus_notifications"."notification_deliveries_criticality_enum" AS ENUM('critical', 'transactional', 'informational')
        `);
        await queryRunner.query(`
            CREATE TYPE "kodus_notifications"."notification_deliveries_channel_enum" AS ENUM('email', 'in_app', 'slack', 'discord', 'webhook')
        `);
        await queryRunner.query(`
            CREATE TYPE "kodus_notifications"."notification_deliveries_deliverystatus_enum" AS ENUM('pending', 'delivered', 'failed')
        `);
        await queryRunner.query(`
            CREATE TABLE "kodus_notifications"."notification_deliveries" (
                "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone,
                "organizationId" uuid NOT NULL,
                "event" character varying(100) NOT NULL,
                "criticality" "kodus_notifications"."notification_deliveries_criticality_enum" NOT NULL,
                "channel" "kodus_notifications"."notification_deliveries_channel_enum" NOT NULL,
                "title" character varying(255) NOT NULL,
                "body" text NOT NULL,
                "ctaUrl" character varying(512),
                "category" character varying(50) NOT NULL,
                "recipientEmail" character varying(255),
                "recipientUserId" uuid,
                "deliveryStatus" "kodus_notifications"."notification_deliveries_deliverystatus_enum" NOT NULL DEFAULT 'pending',
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "correlationId" character varying(100) NOT NULL,
                "lastError" text,
                "deliveredAt" TIMESTAMP,
                CONSTRAINT "PK_bba06c20dfde205865d43744f67" PRIMARY KEY ("uuid")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_nd_created" ON "kodus_notifications"."notification_deliveries" ("createdAt")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_nd_correlation" ON "kodus_notifications"."notification_deliveries" ("correlationId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_nd_channel_status" ON "kodus_notifications"."notification_deliveries" ("channel", "deliveryStatus")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_nd_org_event" ON "kodus_notifications"."notification_deliveries" ("organizationId", "event")
        `);
        await queryRunner.query(`
            CREATE TABLE "kodus_notifications"."user_notifications" (
                "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone,
                "userId" uuid NOT NULL,
                "deliveryId" uuid NOT NULL,
                "readAt" TIMESTAMP,
                CONSTRAINT "UQ_un_delivery" UNIQUE ("deliveryId"),
                CONSTRAINT "PK_18d6bfca410a4746bfc6525cc93" PRIMARY KEY ("uuid")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_un_user_created" ON "kodus_notifications"."user_notifications" ("userId", "createdAt")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_un_user_read" ON "kodus_notifications"."user_notifications" ("userId", "readAt")
        `);
        await queryRunner.query(`
            CREATE TABLE "kodus_notifications"."notification_routing_rules" (
                "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone,
                "organizationId" uuid NOT NULL,
                "event" character varying(100) NOT NULL,
                "category" character varying(50),
                "role" character varying(30) NOT NULL,
                "channels" jsonb NOT NULL DEFAULT '{}',
                CONSTRAINT "UQ_nrr_org_event_role" UNIQUE ("organizationId", "event", "role"),
                CONSTRAINT "PK_3fd38ae8e072ce571109d8fcf6f" PRIMARY KEY ("uuid")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_nrr_org" ON "kodus_notifications"."notification_routing_rules" ("organizationId")
        `);
        await queryRunner.query(`
            ALTER TABLE "cli_auth_sessions"
            ALTER COLUMN "createdAt"
            SET DEFAULT ('now'::text)::timestamp(6) with time zone
        `);
        await queryRunner.query(`
            ALTER TABLE "cli_auth_sessions"
            ALTER COLUMN "updatedAt"
            SET DEFAULT ('now'::text)::timestamp(6) with time zone
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_automation_exec_inprogress_lookup" ON "automation_execution" (
                "team_automation_id",
                "status",
                "repositoryId",
                "pullRequestNumber"
            )
            WHERE "repositoryId" IS NOT NULL
                AND "pullRequestNumber" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_team_automations_team_auto" ON "team_automations" ("teamUuid", "automationUuid")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_integration_configs_key_team_int" ON "integration_configs" ("configKey", "team_id", "integration_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_workflow_jobs_type_updated" ON "kodus_workflow"."workflow_jobs" ("workflowType", "updatedAt")
        `);
        await queryRunner.query(`
            ALTER TABLE "cli_auth_sessions"
            ADD CONSTRAINT "FK_3689de00b6f9a4bcc3870dfdc20" FOREIGN KEY ("user_id") REFERENCES "users"("uuid") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "kodus_notifications"."user_notifications"
            ADD CONSTRAINT "FK_2fc44b73e79370ba5b6e50fabe6" FOREIGN KEY ("deliveryId") REFERENCES "kodus_notifications"."notification_deliveries"("uuid") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "kodus_notifications"."user_notifications" DROP CONSTRAINT "FK_2fc44b73e79370ba5b6e50fabe6"
        `);
        await queryRunner.query(`
            ALTER TABLE "cli_auth_sessions" DROP CONSTRAINT "FK_3689de00b6f9a4bcc3870dfdc20"
        `);
        await queryRunner.query(`
            DROP INDEX "kodus_workflow"."idx_workflow_jobs_type_updated"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_integration_configs_key_team_int"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_team_automations_team_auto"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_automation_exec_inprogress_lookup"
        `);
        await queryRunner.query(`
            ALTER TABLE "cli_auth_sessions"
            ALTER COLUMN "updatedAt"
            SET DEFAULT now()
        `);
        await queryRunner.query(`
            ALTER TABLE "cli_auth_sessions"
            ALTER COLUMN "createdAt"
            SET DEFAULT now()
        `);
        await queryRunner.query(`
            DROP INDEX "kodus_notifications"."IDX_nrr_org"
        `);
        await queryRunner.query(`
            DROP TABLE "kodus_notifications"."notification_routing_rules"
        `);
        await queryRunner.query(`
            DROP INDEX "kodus_notifications"."IDX_un_user_read"
        `);
        await queryRunner.query(`
            DROP INDEX "kodus_notifications"."IDX_un_user_created"
        `);
        await queryRunner.query(`
            DROP TABLE "kodus_notifications"."user_notifications"
        `);
        await queryRunner.query(`
            DROP INDEX "kodus_notifications"."IDX_nd_org_event"
        `);
        await queryRunner.query(`
            DROP INDEX "kodus_notifications"."IDX_nd_channel_status"
        `);
        await queryRunner.query(`
            DROP INDEX "kodus_notifications"."IDX_nd_correlation"
        `);
        await queryRunner.query(`
            DROP INDEX "kodus_notifications"."IDX_nd_created"
        `);
        await queryRunner.query(`
            DROP TABLE "kodus_notifications"."notification_deliveries"
        `);
        await queryRunner.query(`
            DROP TYPE "kodus_notifications"."notification_deliveries_deliverystatus_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "kodus_notifications"."notification_deliveries_channel_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "kodus_notifications"."notification_deliveries_criticality_enum"
        `);
    }

}
