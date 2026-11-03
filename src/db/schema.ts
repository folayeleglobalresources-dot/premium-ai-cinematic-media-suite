import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  real,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  aspect: text("aspect").default("16:9").notNull(),
  fps: real("fps").default(24).notNull(),
  width: integer("width").default(1920).notNull(),
  height: integer("height").default(1080).notNull(),
  lookId: text("look_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // video | image | audio
  mime: text("mime").notNull(),
  size: bigint("size", { mode: "number" }).default(0).notNull(),
  durationMs: integer("duration_ms").default(0).notNull(),
  width: integer("width").default(0).notNull(),
  height: integer("height").default(0).notNull(),
  fps: real("fps").default(0).notNull(),
  filePath: text("file_path"),
  thumbPath: text("thumb_path"),
  lookId: text("look_id"),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  favorite: boolean("favorite").default(false).notNull(),
  source: text("source").default("studio").notNull(), // studio | import | export | still
  status: text("status").default("pending").notNull(), // pending | ready
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const timelines = pgTable("timelines", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
  durationMs: integer("duration_ms").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const looks = pgTable("looks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").default("Custom").notNull(),
  description: text("description").default("").notNull(),
  grade: jsonb("grade").$type<Record<string, number>>().default({}).notNull(),
  cubeText: text("cube_text"),
  lutSize: integer("lut_size").default(0).notNull(),
  swatch: jsonb("swatch").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const broadcasts = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  protocol: text("protocol").default("whip").notNull(),
  endpoint: text("endpoint").default("").notNull(),
  status: text("status").default("live").notNull(), // live | ended | failed
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  stats: jsonb("stats").$type<Record<string, unknown>>().default({}).notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiSessions = pgTable("ai_sessions", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // analysis | director | autoedit | match
  title: text("title").default("").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().default({}).notNull(),
  output: jsonb("output").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").default("default").notNull().unique(),
  data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Timeline = typeof timelines.$inferSelect;
export type LookRow = typeof looks.$inferSelect;
export type Broadcast = typeof broadcasts.$inferSelect;
export type AiSession = typeof aiSessions.$inferSelect;
