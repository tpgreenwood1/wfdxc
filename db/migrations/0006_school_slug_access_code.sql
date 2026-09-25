ALTER TABLE "schools" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "access_code" text;--> statement-breakpoint
-- Backfill slugs for existing schools: lower-case, non-alphanumeric runs collapsed to
-- "-", apostrophes dropped (so "St Mary's" -> "st-marys", matching lib/schools.ts
-- slugify), with -2/-3 suffixes if two names collapse to the same slug.
WITH base AS (
  SELECT id,
    coalesce(nullif(trim(both '-' from lower(regexp_replace(replace(name, '''', ''), '[^A-Za-z0-9]+', '-', 'g'))), ''), 'school') AS slug
  FROM "schools"
), numbered AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY id) AS n FROM base
)
UPDATE "schools" s
SET "slug" = CASE WHEN numbered.n = 1 THEN numbered.slug ELSE numbered.slug || '-' || numbered.n END
FROM numbered
WHERE numbered.id = s.id;--> statement-breakpoint
-- Same unambiguous alphabet as lib/schools.ts generateAccessCode (no 0/O/1/I/L). The
-- subquery references s.id so Postgres re-evaluates it (and random()) per row.
UPDATE "schools" s
SET "access_code" = (
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 31)::int + 1, 1), '')
  FROM generate_series(1, 6)
  WHERE s.id IS NOT NULL
);--> statement-breakpoint
ALTER TABLE "schools" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ALTER COLUMN "access_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_slug_unique" UNIQUE("slug");
