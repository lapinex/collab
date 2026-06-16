CREATE TABLE "dm_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user1_id" uuid NOT NULL,
	"user2_id" uuid NOT NULL,
	"last_message_id" uuid,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dm_channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"edited_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "server_invitations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "server_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"nickname" text,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "channel_permissions" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "channel_permissions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "channel_permissions" ALTER COLUMN "channel_id" SET DATA TYPE uuid USING channel_id::uuid;--> statement-breakpoint
ALTER TABLE "channel_permissions" ALTER COLUMN "role_id" SET DATA TYPE uuid USING role_id::uuid;--> statement-breakpoint
ALTER TABLE "channel_permissions" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "server_id" SET DATA TYPE uuid USING server_id::uuid;--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "parent_id" SET DATA TYPE uuid USING parent_id::uuid;--> statement-breakpoint
ALTER TABLE "developer_codes" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "developer_codes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "developer_codes" ALTER COLUMN "used_by" SET DATA TYPE uuid USING used_by::uuid;--> statement-breakpoint
ALTER TABLE "email_whitelist" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "email_whitelist" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "channel_id" SET DATA TYPE uuid USING channel_id::uuid;--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "message_id" SET DATA TYPE uuid USING message_id::uuid;--> statement-breakpoint
ALTER TABLE "message_edits" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "message_edits" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "message_edits" ALTER COLUMN "message_id" SET DATA TYPE uuid USING message_id::uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "channel_id" SET DATA TYPE uuid USING channel_id::uuid;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "presence" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "message_id" SET DATA TYPE uuid USING message_id::uuid;--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "server_id" SET DATA TYPE uuid USING server_id::uuid;--> statement-breakpoint
ALTER TABLE "servers" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "servers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "servers" ALTER COLUMN "owner_id" SET DATA TYPE uuid USING owner_id::uuid;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "role_id" SET DATA TYPE uuid USING role_id::uuid;--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "server_id" SET DATA TYPE uuid USING server_id::uuid;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "voice_sessions" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "voice_sessions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "voice_sessions" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;--> statement-breakpoint
ALTER TABLE "voice_sessions" ALTER COLUMN "channel_id" SET DATA TYPE uuid USING channel_id::uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "global_role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_channels" ADD CONSTRAINT "dm_channels_user1_id_users_id_fk" FOREIGN KEY ("user1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_channels" ADD CONSTRAINT "dm_channels_user2_id_users_id_fk" FOREIGN KEY ("user2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_dm_channel_id_dm_channels_id_fk" FOREIGN KEY ("dm_channel_id") REFERENCES "public"."dm_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_invitations" ADD CONSTRAINT "server_invitations_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_invitations" ADD CONSTRAINT "server_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_profiles" ADD CONSTRAINT "server_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_profiles" ADD CONSTRAINT "server_profiles_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dm_channels_user1_id_idx" ON "dm_channels" USING btree ("user1_id");--> statement-breakpoint
CREATE INDEX "dm_channels_user2_id_idx" ON "dm_channels" USING btree ("user2_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_channels_user_pair_idx" ON "dm_channels" USING btree ("user1_id","user2_id");--> statement-breakpoint
CREATE INDEX "dm_messages_dm_channel_id_idx" ON "dm_messages" USING btree ("dm_channel_id");--> statement-breakpoint
CREATE INDEX "dm_messages_user_id_idx" ON "dm_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dm_messages_created_at_idx" ON "dm_messages" USING btree ("dm_channel_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "server_invitations_code_idx" ON "server_invitations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "server_invitations_server_id_idx" ON "server_invitations" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "server_profiles_user_server_idx" ON "server_profiles" USING btree ("user_id","server_id");--> statement-breakpoint
CREATE INDEX "server_profiles_user_id_idx" ON "server_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "server_profiles_server_id_idx" ON "server_profiles" USING btree ("server_id");