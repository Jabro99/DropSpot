import express from "express";
import {Pool} from "pg";
import bcrypt from "bcrypt";
import crypt from "crypto";
import cookieParser from "cookie-parser";
import path from "path";
import rateLimit from "express-rate-limit";
import helmet from "helmet";



import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { spots, hotspots, hotspotComments, users, sessions } from "./schema.js";
import type { Request, Response, NextFunction } from "express";
import { fileURLToPath } from "url";

import { z } from "zod";


const NEARBY_RADIUS_METRES = 75;
const CLUSTER_RADIUS_METRES = 20;
const HOTSPOT_THRESHOLD = 5;
const HOTSPOT_DEDUPE_RADIUS_METRES = 20;

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

const __dirname = path.dirname(fileURLToPath(import.meta.url));

declare global {
    namespace Express {
        interface Request {
            user? : { id: number; email: string};
        }
    }
}

import dotenv from "dotenv";
dotenv.config({
    path: path.resolve(__dirname, "../../np.env")
});




const createSpotSchema = z.object({
    title: z.string().min(1, "Title is required").max(100, "Title is too long"),
    description: z.string().max(1000, "Description is too long").optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
});


const registerSchema = z.object({
    email: z.email(),
    username: z.string().min(3, "Username must be at least 3 characters").max(20, "Username must be 20 characters or fewer"),
    password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be 128 characters or fewer"),
})


const loginSchema = z.object({
    email: z.email(),
    password: z.string().max(128),
})

const hotspotIdSchema = z.coerce.number().int().positive();

const locationQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
});

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT) || 3000;

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
})

const db = drizzle(pool);


pool.query("SELECT NOW()")
    .then(result => console.log("DB connected, server time", result.rows[0]))
    .catch(err => console.error("DB connection failed:", err));


app.use(express.json()); 
app.use(cookieParser());

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://unpkg.com"],
        styleSrc: ["'self'", "https://unpkg.com", "https://fonts.googleapis.com", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
      },
    },
  })
);

app.use(express.static(path.join(__dirname, "../../frontend")));

app.get("/", (req, res) => {
    res.redirect("/home");
});

app.get("/home", requirePageAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend/html/home.html"));
}); 

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend/html/login.html"));
})

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend/html/register.html"));
})

app.get("/account", requirePageAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend/html/account.html"));
})


const loginLimiter  = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: {
        error: "Too many login attempts. Please try again later."
    },
    standardHeaders: "draft-8",
    legacyHeaders: false,
});


const registerLimiter = rateLimit({
    windowMs: 60*60*1000,
    limit: 5,
    message: {
        error: "Too many registration attempts. Please try again later."
    },
    standardHeaders: "draft-8",
    legacyHeaders: false,
});

const spotLimiter = rateLimit({
    windowMs: 60*60*1000,
    limit: 3,
    message: {
        error: "Too many spots created. Please try again later."
    },
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.user!.id.toString(),
})

const nearbySpotsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    message: { error: "Too many requests. Please try again later." },
    standardHeaders: "draft-8",
    legacyHeaders: false,
});

const publicReadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    message: { error: "Too many requests. Please try again later." },
    standardHeaders: "draft-8",
    legacyHeaders: false,
});

// checks if 5 spots in vicinity (hotspot condition) and creates hotspot if so

async function checkAndCreateHotspot(lat: number, lng: number) {
    const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM spots
        WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${CLUSTER_RADIUS_METRES})
        AND created_at > NOW() - INTERVAL '24 hours'`);

    const countRow = countResult.rows[0];
    
    if (!countRow) {
        throw new Error("Count query returned no rows");
    }

    const nearbyCount = Number(countRow.count);

    if (nearbyCount < HOTSPOT_THRESHOLD) {
        return null;
    }

    const centroidResult = await db.execute(sql`
        SELECT AVG(latitude) AS lat, AVG(longitude) AS lng
        FROM spots
        WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${CLUSTER_RADIUS_METRES})
        AND created_at > NOW() - INTERVAL '24 hours'`);
    
    const centroidRow = centroidResult.rows[0];

    if (!centroidRow) {
        throw new Error("Centroid query returned no rows");
    }

    const centroidLat = Number(centroidRow.lat);
    const centroidLng = Number(centroidRow.lng);

    const contributingSpotsResult = await db.execute(sql`
        SELECT id, description, created_at, user_id
        FROM spots
        WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${CLUSTER_RADIUS_METRES})
        AND created_at > NOW() - INTERVAL '24 hours'
    `);

    const hotspotAddress = await reverseGeocode(
        Number(centroidRow.lat),
        Number(centroidRow.lng)
    )

    const [newHotspot] = await db
        .insert(hotspots)
        .values({
            latitude: Number(centroidRow.lat),
            longitude: Number(centroidRow.lng),
            location: sql`ST_SetSRID(ST_MakePoint(${centroidRow.lng}, ${centroidRow.lat}), 4326)::geography`,
            spotCount: nearbyCount,
            address: hotspotAddress,
        })
        .returning();
    if (!newHotspot) {
        throw new Error("Hotspot insert returned no row");
    }

    // Convert each contributing spot into a comment, preserving its original timestamp
    for (const row of contributingSpotsResult.rows) {
        await db.execute(sql`
        INSERT INTO hotspot_comments (hotspot_id, comment, created_at, user_id)
        VALUES (${newHotspot.id}, ${row.description}, ${row.created_at}, ${row.user_id})
        `);
    }

    // Delete the now-converted spots
    const contributingIds = contributingSpotsResult.rows.map(r => Number(r.id));
    if (contributingIds.length > 0) {
        await db
            .delete(spots)
            .where(inArray(spots.id, contributingIds))
    }

    return newHotspot;
}

app.get("/api/hotspots", publicReadLimiter, async (req, res) => {


    try {
        const allHotspots = await db.execute(sql`
            SELECT id, title, latitude, longitude, address, spot_count, created_at
            FROM hotspots
            ORDER BY created_at DESC`)

        res.json(allHotspots.rows);
    } catch (err) {
        console.error("Error fetching hotspots", err);
        res.status(500).json( { error: "Failed to fetch hotspots"});
    }
});


app.get("/api/hotspots/:id/comments", publicReadLimiter, async (req, res) => {
    const parsed = hotspotIdSchema.safeParse(req.params.id);

    if (!parsed.success) {
        return res.status(400).json({error: "Invalid hotspot ID"});
    }

    const hotspotId = parsed.data;

    if (Number.isNaN(hotspotId)) {
        return res.status(400).json( { error: "Invalid hotspot id"});
    }

    try {
        const commentsResult = await db.execute(sql`
            SELECT s.id, s.comment, s.created_at, u.username  
            FROM hotspot_comments s
            JOIN users u ON u.id = s.user_id
            WHERE s.hotspot_id = ${hotspotId}
            AND s.created_at > NOW() - INTERVAL '24 hours'
            ORDER BY s.created_at DESC
        `);
        res.json(commentsResult.rows);
    } catch (err) {
        console.error("Error fetching hotspot comments", err);
        res.status(500).json({ error : "Failed to fetch hotspot comments"});
    }
});


app.get("/api/spots/", nearbySpotsLimiter, async (req, res) => {
    const parsed = locationQuerySchema.safeParse(req.query);

    if (!parsed.success) {
        return res.status(400).json({error: "Invalid location"});
    }

    const { lat, lng } = parsed.data;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({ error: "lat and lng query params are required" });
    }


    try {
        const nearbySpots = await db.execute(sql`
            SELECT s.id, s.title, s.description, s.latitude, s.longitude, s.created_at, u.username,
                ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_metres
            FROM spots s
            JOIN users u ON u.id = s.user_id
            WHERE ST_DWithin(
                location,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                ${NEARBY_RADIUS_METRES}
            )
            ORDER BY distance_metres ASC
        `);
        res.json(nearbySpots.rows);
    } catch (err) {
        console.error("Error fetching spots ", err);
        res.status(500).json( { error: "Failed to fetch spots"});
    }
});

// ch

app.post("/api/spots", requireAuth, spotLimiter, async (req, res) => {
    const parsed = createSpotSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
    }

    const { title, description, latitude, longitude } = parsed.data;


    try { // checks if hotspot in vicinity first
        const existingHotspotResult = await db.execute(sql`
            SELECT id FROM hotspots
            WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, ${HOTSPOT_DEDUPE_RADIUS_METRES})
            LIMIT 1
        `);

        if (existingHotspotResult.rows.length > 0) {
            const existingHotspotRow = existingHotspotResult.rows[0];

            if (!existingHotspotRow) {
                throw new Error("Expected a hotspot row but got none");
            }

            const hotspotId = Number(existingHotspotRow.id);

            const [newComment] = await db
                .insert(hotspotComments)
                .values({ hotspotId, comment: description ?? "", userId: req.user!.id })
                .returning();

            return res.status(201).json({
                kind: "comment",
                message: "Comment added to hotspot",
                comment: newComment,
            });
        }


        const [newSpot] = await db
            .insert(spots)
            .values({ title, description, latitude, longitude, location: sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`, userId: req.user!.id })
            .returning();

        const newHotspot = await checkAndCreateHotspot(latitude, longitude);

        res.status(201).json({
            kind: "spot",
            message: "Spot saved",
            spot: newSpot,
            hotspotCreated: newHotspot,
        });
            
    } catch (err) {
        console.log ("Error saving spots:", err);
        res.status(500).json({ error: "Failed to save spot" });
    }

})


app.post("/api/register", registerLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
    }

    const { email, username, password } = parsed.data;


    try { 
        const passwordHash = await bcrypt.hash(password, 10);

        const [ newUser ] = await db
            .insert(users)
            .values( { email, username, passwordHash })
            .returning( { id: users.id, email: users.email, username: users.username })

        res.status(201).json( { message: "Registered", user: newUser });
    } catch (err:any) {
        if (err.code === "23505") {
            if (err.constraint?.includes("email")) {
                return res.status(409).json({error: "Email already registered"});
            }
            if (err.constraint?.includes("username")) {
                return res.status(409).json({error: "Username already taken"})
            }
            return res.status(409).json({error: "Already registered"})
        }
        console.error("Error registering user:", err);
        res.status(500).json( { error: "Failed to register "});
    }

})


app.post("/api/login", loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({error: parsed.error.format()});
    }

    const { email, password}  = parsed.data;

    try {
        const userResult = await db.select().from(users).where(eq(users.email, email));
        const user = userResult[0];

        if (!user) {
            return res.status(401).json({error: "Invalid email or password"});
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);

        if (!passwordMatches) {
            return res.status(401).json({error: "Invalid email or password"});
        }

        const sessionId = crypt.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

        await db.insert(sessions).values( { id: sessionId, userId : user.id, expiresAt });

        res.cookie("session_id", sessionId, {
            httpOnly: true,
            expires: expiresAt,
            sameSite: "lax",
            secure: true,
        });

        res.json({ message: "Logged in ", user: { id: user.id, email: user.email}});
        
    } catch (err) {
        console.error("Error logging in ", err);
        res.status(500).json({error: "Failed to log in"});
    };
});


app.post("/api/logout", async (req, res) => {
    const sessionId = req.cookies.session_id;

    if (sessionId) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
    }

    res.clearCookie("session_id", {sameSite: "lax", secure: true});
    res.json({ message : "Logged out"});
})


app.get("/api/me", requireAuth, (req, res) => {
    res.json({ id: req.user!.id, email: req.user!.email });
})

app.get("/api/me/spots", requireAuth, async (req, res) => {
    try {
        const mySpots = await db.execute(sql`
            SELECT id, title, description, latitude, longitude, created_at, (created_at > NOW() - INTERVAL '24 hours') AS is_active
            FROM spots
            WHERE user_id = ${req.user!.id}
            ORDER BY created_at DESC`);

        res.json(mySpots.rows);
    } catch (err) {
        console.error("Error fetching user's spots:", err);
        res.status(500).json({error: "Failed to fetch your spots"});
    }

});

app.get("/api/me/comments", requireAuth, async (req, res) => {
  try {
    const myComments = await db.execute(sql`
      SELECT hc.id, hc.comment, hc.created_at, hc.hotspot_id, h.title AS hotspot_title,
        (hc.created_at > NOW() - INTERVAL '24 hours') AS is_active
      FROM hotspot_comments hc
      JOIN hotspots h ON h.id = hc.hotspot_id
      WHERE hc.user_id = ${req.user!.id}
      ORDER BY hc.created_at DESC
    `);

    res.json(myComments.rows);
  } catch (err) {
    console.error("Error fetching user's comments:", err);
    res.status(500).json({ error: "Failed to fetch your comments" });
  }
});

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
        const url = new URL("https://nominatim.openstreetmap.org/reverse");

        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lon", String(lng));
        url.searchParams.set("zoom", "18");
        url.searchParams.set("addressdetails", "1");

        const response = await fetch(url, {
            headers: {
                "User-Agent": "DropSpot/1.0"
            }
        });

        if (!response.ok) {
            throw new Error(`Nominatim returned ${response.status}`);
        }

        const data = await response.json();

        const address = data.address;

        if (!address) {
            return data.display_name ?? null;
        }

        const parts = [
            address.house_number,
            address.road,
            address.neighbourhood,
            address.suburb,
            address.city || address.town || address.village,
            address.postcode,
        ].filter(Boolean);

        return parts.join(", ") || data.display_name || null;

        

    } catch (err) {
        console.error("Reverse geocoding failed:", err);
        return null;
    }
}


async function requireAuth(req: Request, res:Response, next:NextFunction) {
    const sessionId = req.cookies.session_id;

    if (!sessionId) {
        return res.status(401).json({error:"Not logged in"});
    }

    try {
        const sessionResult = await db
            .select()
            .from(sessions)
            .where(eq(sessions.id, sessionId));

        const session = sessionResult[0]

        if (!session) {
            return res.status(401).json({error: "Invalid session"});
        }

        if (session.expiresAt < new Date()) {
            await db.delete(sessions).where(eq(sessions.id, sessionId));
            return res.status(401).json({ error: "Session expired" });
        }

        const userResult = await db
            .select({id: users.id, email: users.email })
            .from(users)
            .where(eq(users.id, session.userId));
        
        const user = userResult[0];

        if (!user) {
            return res.status(401).json({error: "User not found"});
        }

        req.user = user;
        next();
        
    } catch (err) {
        console.error("Error checking auth", err);
        res.status(500).json({ error : "Failed to check authentication"});
    }
}


async function requirePageAuth(req: Request, res: Response, next: NextFunction) {
    const sessionId = req.cookies.session_id;

    if (!sessionId) {
        return res.redirect("/login");
    }

    const sessionResult = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    const session = sessionResult[0];

    if (!session || session.expiresAt < new Date()) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        return res.redirect("/login");
    }

    next();
}

/*
async function cleanupExpiredRows() { 
    try {
        const deletedSpots = await db.execute(sql`
            DELETE FROM spots WHERE created_at < NOW() - INTERVAL '24 hours'`);
        
        const deletedComments = await db.execute(sql`
            DELETE FROM hotspot_comments WHERE created_at < NOW() - INTERVAL '24 hours'`);
        console.log(`Cleanup: removed ${deletedSpots.rowCount} expired spots and ${deletedComments.rowCount} expired comments`);
    } catch (err) {
        console.error("Cleanup job failed", err);
    }
}
*/

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);

  res.status(500).json({
    error: "Internal server error"
  });
});

app.listen(port, () => {
    console.log(`DropSpot server running on port ${port}`);
});
