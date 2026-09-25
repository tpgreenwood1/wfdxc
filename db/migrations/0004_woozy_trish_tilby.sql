CREATE TABLE IF NOT EXISTS "dismissed_merge_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runner_a_id" uuid NOT NULL,
	"runner_b_id" uuid NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dismissed_merge_candidates_runner_a_id_runner_b_id_unique" UNIQUE("runner_a_id","runner_b_id")
);
--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dismissed_merge_candidates" ADD CONSTRAINT "dismissed_merge_candidates_runner_a_id_runners_id_fk" FOREIGN KEY ("runner_a_id") REFERENCES "public"."runners"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dismissed_merge_candidates" ADD CONSTRAINT "dismissed_merge_candidates_runner_b_id_runners_id_fk" FOREIGN KEY ("runner_b_id") REFERENCES "public"."runners"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
