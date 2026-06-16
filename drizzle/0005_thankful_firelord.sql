CREATE TABLE "banned_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"banned_by" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"invite_id" uuid,
	"action" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_invite_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"user_id" uuid,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dm_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "dm_messages" CASCADE;--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_channel_id_channels_id_fk";
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "auto_translate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "preferred_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "banned_members" ADD CONSTRAINT "banned_members_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banned_members" ADD CONSTRAINT "banned_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banned_members" ADD CONSTRAINT "banned_members_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_audit_log" ADD CONSTRAINT "invite_audit_log_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_audit_log" ADD CONSTRAINT "invite_audit_log_invite_id_server_invitations_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."server_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_audit_log" ADD CONSTRAINT "invite_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_audit_logs" ADD CONSTRAINT "server_audit_logs_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_audit_logs" ADD CONSTRAINT "server_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_invite_uses" ADD CONSTRAINT "server_invite_uses_invite_id_server_invitations_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."server_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_invite_uses" ADD CONSTRAINT "server_invite_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "banned_members_server_user_idx" ON "banned_members" USING btree ("server_id","user_id");--> statement-breakpoint
CREATE INDEX "banned_members_server_id_idx" ON "banned_members" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "invite_audit_log_invite_id_idx" ON "invite_audit_log" USING btree ("invite_id");--> statement-breakpoint
CREATE INDEX "invite_audit_log_server_id_idx" ON "invite_audit_log" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_audit_logs_server_id_idx" ON "server_audit_logs" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_audit_logs_created_at_idx" ON "server_audit_logs" USING btree ("server_id","created_at");--> statement-breakpoint
CREATE INDEX "server_invite_uses_invite_id_idx" ON "server_invite_uses" USING btree ("invite_id");