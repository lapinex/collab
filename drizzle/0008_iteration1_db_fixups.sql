ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "license_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "license_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reply_to_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_reply_to_id" ON "messages" ("reply_to_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_server_user_idx" ON "user_roles" ("server_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_expires_idx" ON "sessions" ("user_id","expires_at");
