CREATE TABLE "server_emojis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "slowmode" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_message_id" uuid;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "verification_level" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "system_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "rules_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "default_notification_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "voice_region" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "media_scan_level" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "link_filter_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "bad_words_filter_level" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "custom_bad_words" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "is_community" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "announcements_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "server_emojis" ADD CONSTRAINT "server_emojis_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_emojis" ADD CONSTRAINT "server_emojis_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_stickers" ADD CONSTRAINT "server_stickers_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_stickers" ADD CONSTRAINT "server_stickers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_emojis_server_id_idx" ON "server_emojis" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_emojis_name_idx" ON "server_emojis" USING btree ("server_id","name");--> statement-breakpoint
CREATE INDEX "server_stickers_server_id_idx" ON "server_stickers" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_stickers_name_idx" ON "server_stickers" USING btree ("server_id","name");--> statement-breakpoint
CREATE INDEX "webhooks_server_id_idx" ON "webhooks" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "webhooks_channel_id_idx" ON "webhooks" USING btree ("channel_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_messages_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_system_channel_id_channels_id_fk" FOREIGN KEY ("system_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_rules_channel_id_channels_id_fk" FOREIGN KEY ("rules_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_default_notification_channel_id_channels_id_fk" FOREIGN KEY ("default_notification_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_announcements_channel_id_channels_id_fk" FOREIGN KEY ("announcements_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_reply_to_message_id_idx" ON "messages" USING btree ("reply_to_message_id");