import { pgTable, serial, text, doublePrecision, boolean, timestamp, customType, integer } from "drizzle-orm/pg-core";

const geography = customType<{ data: string }>({
    dataType() {
        return "geography(Point, 4326)";
    }
})

export const spots = pgTable("spots", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    location: geography("location"),
    userId: integer("user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hotspots = pgTable("hotspots", {
    id: serial("id").primaryKey(),
    title: text("title"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    location: geography("location"),
    spotCount: integer("spot_count").notNull(),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


export const hotspotComments = pgTable("hotspot_comments", {
  id: serial("id").primaryKey(),
  hotspotId: integer("hotspot_id").notNull().references(() => hotspots.id),
  comment: text("comment").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone : true}).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
    id: text("id").primaryKey(),
    userId: integer("user_id").notNull().references( () => users.id),
    expiresAt: timestamp("expires_at", { withTimezone : true}).notNull(),
})

