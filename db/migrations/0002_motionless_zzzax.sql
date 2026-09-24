CREATE TABLE IF NOT EXISTS "event_school_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_school_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "event_school_tokens_event_id_school_id_unique" UNIQUE("event_id","school_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_school_tokens" ADD CONSTRAINT "event_school_tokens_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_school_tokens" ADD CONSTRAINT "event_school_tokens_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
