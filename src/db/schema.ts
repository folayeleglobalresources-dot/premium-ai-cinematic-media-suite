import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * LUMIÈRE — production database.
 * Media binaries live on-device (IndexedDB, like a local media cache / proxy store),
 * while every project, asset record, slate, AI analysis and broadcast session is
 * persisted here so a production keeps an authoritative catalogue.
 */

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  logline: text("logline").notNull().default(""),
  width: integer("width").notNull().default(1920),
  height: integer("height").notNull().default(1080),
  fps: doublePrecision("fps").notNull().default(24),
  aspect: text("aspect").notNull().default("16:9"),
  timeline: jsonb("timeline").$type<Record<string, unknown>>().notNull().default({}),
  poster: text("poster"),
  status: text("status").notNull().default("development"),
  durationSec: doublePrecision("duration_sec").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // video | audio | image
  mime: text("mime").notNull().default(""),
  source: text("source").notNull().default("import"), // camera | screen | broadcast | import | export | photo
  durationSec: doublePrecision("duration_sec").notNull().default(0),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  sizeBytes: doublePrecision("size_bytes").notNull().default(0),
  thumbnail: text("thumbnail"),
  filmstrip: jsonb("filmstrip").$type<string[]>().notNull().default([]),
  peaks: jsonb("peaks").$type<number[]>().notNull().default([]),
  slate: jsonb("slate").$type<Record<string, string>>().notNull().default({}),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  analysis: jsonb("analysis").$type<Record<string, unknown>>().notNull().default({}),
  captions: jsonb("captions").$type<{ start: number; end: number; text: string }[]>().notNull().default([]),
  rating: integer("rating").notNull().default(0),
  favorite: boolean("favorite").notNull().default(false),
  projectId: text("project_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const streamDestinations = pgTable("stream_destinations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  platform: text("platform").notNull().default("custom"),
  whipUrl: text("whip_url").notNull(),
  streamKey: text("stream_key").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const streamSessions = pgTable("stream_sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Untitled broadcast"),
  destinationIds: jsonb("destination_ids").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("live"), // live | ended | failed | rehearsal
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSec: doublePrecision("duration_sec").notNull().default(0),
  peakKbps: doublePrecision("peak_kbps").notNull().default(0),
  avgFps: doublePrecision("avg_fps").notNull().default(0),
  resolution: text("resolution").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export const shotlists = pgTable("shotlists", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  logline: text("logline").notNull(),
  genre: text("genre").notNull().default("drama"),
  tone: text("tone").notNull().default(""),
  engine: text("engine").notNull().default("lumiere-local"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type StreamDestinationRow = typeof streamDestinations.$inferSelect;
export type StreamSessionRow = typeof streamSessions.$inferSelect;
export type ShotlistRow = typeof shotlists.$inferSelect;
