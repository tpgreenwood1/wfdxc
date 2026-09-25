CREATE TYPE "public"."position_ack_kind" AS ENUM('tie', 'gap');--> statement-breakpoint
CREATE TYPE "public"."race_school_state" AS ENUM('done', 'no_runners');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "race_position_acks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "position_ack_kind" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_position_acks_race_id_position_kind_unique" UNIQUE("race_id","position","kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "race_school_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"state" "race_school_state" NOT NULL,
	"set_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_school_status_race_id_school_id_unique" UNIQUE("race_id","school_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "race_position_acks" ADD CONSTRAINT "race_position_acks_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "race_school_status" ADD CONSTRAINT "race_school_status_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "race_school_status" ADD CONSTRAINT "race_school_status_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
