import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  boolean,
  uuid,
  serial,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"), // "admin", "company_admin", "user"
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant table for multi-tenant support
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().notNull().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  domain: varchar("domain"),
  maxDispatchUsers: integer("max_dispatch_users"),
  maxCompletions: integer("max_completions"),
  globalExpiration: timestamp("global_expiration"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Course table
export const courses = pgTable("courses", {
  id: varchar("id").primaryKey().notNull().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  version: varchar("version").notNull(),
  description: text("description"),
  ownerId: varchar("owner_id").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  fileCount: integer("file_count").notNull(),
  storagePath: varchar("storage_path").notNull(),
  structure: jsonb("structure").notNull(), // Course structure from manifest
  scormType: varchar("scorm_type").notNull(), // "scorm_1_2", "scorm_2004", "aicc", "xapi"
  tags: text("tags").array(), // Course tags for filtering and categorization
  isDisabled: boolean("is_disabled").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// NOTE: Disabled dispatches do not block new dispatches. They act only as historical receipts.
// Only active (non-disabled) dispatches are used in uniqueness checks.
// Dispatch table
export const dispatches = pgTable("dispatches", {
  id: varchar("id").primaryKey().notNull().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  name: varchar("name").notNull(),
  launchToken: varchar("launch_token").unique().notNull().default(sql`gen_random_uuid()`),
  maxUsers: integer("max_users"), // Maximum unique users (null = unlimited)
  maxCompletions: integer("max_completions"), // Maximum total completions (null = unlimited)
  expiresAt: timestamp("expires_at"),
  status: varchar("status").notNull().default("active"), // "active", "expired", "paused"
  isDisabled: boolean("is_disabled").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Dispatch User table
export const dispatchUsers = pgTable("dispatch_users", {
  id: varchar("id").primaryKey().notNull().default(sql`gen_random_uuid()`),
  dispatchId: varchar("dispatch_id").notNull(),
  email: varchar("email"),
  launchToken: varchar("launch_token").unique().notNull(),
  launchedAt: timestamp("launched_at"),
  completedAt: timestamp("completed_at"),
  lastAccessedAt: timestamp("last_accessed_at"),
  progress: jsonb("progress"), // SCORM progress data
  createdAt: timestamp("created_at").defaultNow(),
});

// xAPI Statements table
export const xapiStatements = pgTable("xapi_statements", {
  id: varchar("id").primaryKey().notNull().default(sql`gen_random_uuid()`),
  dispatchId: varchar("dispatch_id").notNull(),
  actorEmail: varchar("actor_email").notNull(),
  verb: varchar("verb").notNull(),
  objectId: varchar("object_id").notNull(),
  result: jsonb("result"),
  context: jsonb("context"),
  timestamp: timestamp("timestamp").defaultNow(),
  stored: timestamp("stored").defaultNow(),
});

// Define relations
export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  ownedCourses: many(courses),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  courses: many(courses),
  dispatches: many(dispatches),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  owner: one(users, {
    fields: [courses.ownerId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [courses.tenantId],
    references: [tenants.id],
  }),
  dispatches: many(dispatches),
}));

export const dispatchesRelations = relations(dispatches, ({ one, many }) => ({
  course: one(courses, {
    fields: [dispatches.courseId],
    references: [courses.id],
  }),
  tenant: one(tenants, {
    fields: [dispatches.tenantId],
    references: [tenants.id],
  }),
  users: many(dispatchUsers),
  xapiStatements: many(xapiStatements),
}));

export const dispatchUsersRelations = relations(dispatchUsers, ({ one }) => ({
  dispatch: one(dispatches, {
    fields: [dispatchUsers.dispatchId],
    references: [dispatches.id],
  }),
}));

export const xapiStatementsRelations = relations(xapiStatements, ({ one }) => ({
  dispatch: one(dispatches, {
    fields: [xapiStatements.dispatchId],
    references: [dispatches.id],
  }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tags: z.array(z.string()).optional(), // Allow optional tags array for course creation
});

export const insertDispatchSchema = createInsertSchema(dispatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDispatchUserSchema = createInsertSchema(dispatchUsers).omit({
  id: true,
  createdAt: true,
});

export const insertXapiStatementSchema = createInsertSchema(xapiStatements).omit({
  id: true,
  timestamp: true,
  stored: true,
});

// Type exports
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;
export type InsertDispatch = z.infer<typeof insertDispatchSchema>;
export type Dispatch = typeof dispatches.$inferSelect;
export type InsertDispatchUser = z.infer<typeof insertDispatchUserSchema>;
export type DispatchUser = typeof dispatchUsers.$inferSelect;
export type InsertXapiStatement = z.infer<typeof insertXapiStatementSchema>;
export type XapiStatement = typeof xapiStatements.$inferSelect;
