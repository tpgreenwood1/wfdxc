import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  unique,
} from "drizzle-orm/pg-core";

export const yearGroupEnum = pgEnum("year_group", [
  "reception",
  "y1",
  "y2",
  "y3",
  "y4",
  "y5",
  "y6",
]);

export const genderEnum = pgEnum("gender", ["boys", "girls"]);

export const raceStatusEnum = pgEnum("race_status", [
  "open",
  "closed",
  "cancelled",
]);

export const schools = pgTable("schools", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
});

export const seasons = pgTable("seasons", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  minRacesRequired: integer("min_races_required").notNull().default(4),
});

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  date: date("date").notNull(),
  location: text("location"),
});

// Additions beyond the spec's literal schema: published_at / published_result_count
// support the admin "diverged from published snapshot" warning (see plan Phase 3).
export const races = pgTable(
  "races",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    yearGroup: yearGroupEnum("year_group").notNull(),
    gender: genderEnum("gender").notNull(),
    status: raceStatusEnum("status").notNull().default("open"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedResultCount: integer("published_result_count"),
  },
  (table) => ({
    eventYearGenderUnique: unique().on(
      table.eventId,
      table.yearGroup,
      table.gender
    ),
  })
);

export const runners = pgTable("runners", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
});

export const runnerAliases = pgTable("runner_aliases", {
  id: uuid("id").defaultRandom().primaryKey(),
  runnerId: uuid("runner_id")
    .notNull()
    .references(() => runners.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
});

export const results = pgTable(
  "results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    runnerId: uuid("runner_id")
      .notNull()
      .references(() => runners.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    submittedBy: text("submitted_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    raceRunnerUnique: unique().on(table.raceId, table.runnerId),
  })
);

export const submissionTokens = pgTable(
  "submission_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    token: uuid("token").defaultRandom().notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    raceSchoolUnique: unique().on(table.raceId, table.schoolId),
  })
);

// One row per (school, event) — created lazily the first time a hub link is needed,
// not pre-generated for every school when the event is set up (unlike submissionTokens).
export const eventSchoolTokens = pgTable(
  "event_school_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    token: uuid("token").defaultRandom().notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventSchoolUnique: unique().on(table.eventId, table.schoolId),
  })
);

export const publishedIndividualResults = pgTable(
  "published_individual_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    yearGroup: yearGroupEnum("year_group").notNull(),
    gender: genderEnum("gender").notNull(),
    runnerId: uuid("runner_id").references(() => runners.id, {
      onDelete: "set null",
    }),
    runnerName: text("runner_name").notNull(),
    schoolId: uuid("school_id").references(() => schools.id, {
      onDelete: "set null",
    }),
    schoolName: text("school_name").notNull(),
    position: integer("position").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);

export const publishedTeamResults = pgTable("published_team_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  raceId: uuid("race_id")
    .notNull()
    .references(() => races.id, { onDelete: "cascade" }),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  yearGroup: yearGroupEnum("year_group").notNull(),
  gender: genderEnum("gender").notNull(),
  schoolId: uuid("school_id").references(() => schools.id, {
    onDelete: "set null",
  }),
  schoolName: text("school_name").notNull(),
  scoringCount: integer("scoring_count").notNull(),
  scoreSum: integer("score_sum").notNull(),
  rank: integer("rank").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
