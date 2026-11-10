import { mysqlTable, int, varchar, text, timestamp } from "drizzle-orm/mysql-core";

export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
