# DropSpot

[![Live Demo](https://img.shields.io/badge/Live_Demo-dropspot.uk-success?style=for-the-badge)](https://dropspot.uk)
[![Stack](https://img.shields.io/badge/Stack-Node.js_|_Express_|_TypeScript-blue?style=for-the-badge)]()
[![Database](https://img.shields.io/badge/Database-PostgreSQL_|_PostGIS-336791?style=for-the-badge&logo=postgresql&logoColor=white)]()

DropSpot is a full-stack, location-based web application that lets people leave digital content at real-world locations and discover what others have left behind. 

Starting as a hackathon concept, it has evolved into a robust geospatial application. Instead of functioning as a simple map with permanent markers, DropSpot's core mechanic is dynamic: individual contributions (Spots) automatically cluster and transform into shared community locations (Hotspots) when enough activity happens in a single area.

## Core Concepts

1. **Spots:** The basic unit of contribution. A user leaves a title and description at specific geographic coordinates. 
2. **Hotspots:** When a threshold of spots (currently 5) accumulate within a specific geographic radius within 24 hours, the system automatically aggregates them into a shared Hotspot.
3. **Hotspot Comments:** Upon Hotspot creation, the original triggering Spots are dissolved and converted into comments on the shared Hotspot. User attribution (creator ID) and original timestamps are strictly preserved.

## Technology Stack

DropSpot is built as a conventional full-stack application with a heavy emphasis on geospatial data and secure architecture.

### Frontend
* **HTML / CSS / JavaScript:** Vanilla web technologies for structure, styling, and client-side behavior.
* **Leaflet.js:** Powers the interactive map interface, markers, and popups.
* **Carto:** Provides the underlying visual map tiles.

### Backend
* **Node.js & Express:** Handles HTTP routing, API endpoints, and middleware.
* **TypeScript:** Ensures static typing and maintainable backend logic.
* **Drizzle ORM:** Manages database schemas, queries, and SQL parameterization.
* **Security & Validation:** `zod` for strict request validation, `bcrypt` for password hashing, `helmet` for HTTP headers, and `express-rate-limit`.

### Database
* **PostgreSQL:** Primary relational database.
* **PostGIS:** Extension for advanced spatial data types and geographic operations (e.g., dynamic radius clustering).

## Technical Highlights

### Geospatial Computing
Unlike applications that treat latitude and longitude as simple Cartesian coordinates, DropSpot uses PostGIS for true geographic proximity searches. Hotspot generation relies on specialized spatial queries:

```sql
ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    CLUSTER_RADIUS_METRES
)
```

When a hotspot triggers, the backend calculates the geographic center of all contributing spots, performs reverse geocoding to assign a physical address, and executes a database migration turning individual geographic points into relational comments.

### Security by Design
Security is baked into the application rather than bolted on:
* **Authentication:** Handled entirely via server-side sessions and secure, HTTP-only, `SameSite=Lax` cookies. 
* **Data Integrity:** Client-side input is never trusted. All data is sanitized, and Drizzle ORM enforces parameterized queries to prevent SQL injection.
* **Throttling:** Route-specific rate limiters (e.g., max 10 spots/hour) prevent spam and automated abuse.
* **Headers & CSP:** Helmet enforces strict Content Security Policies and masks server identity.

### Infrastructure & Deployment
DropSpot is deployed live on **Railway** under a custom domain, utilizing a continuous deployment pipeline from the `main` GitHub branch.
* Production API requests share the frontend origin (`/api/...`) to prevent CORS friction.
* Browser-facing configurations (like Carto API keys) are generated dynamically at build time to keep secrets out of version control.

## Local Development Setup

To run DropSpot locally, you will need Node.js and a PostgreSQL instance with the PostGIS extension enabled.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/dropspot.git
   cd dropspot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory. You will need:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/dropspot
   SESSION_SECRET=your_secure_random_string
   CARTO_API_KEY=your_carto_key
   PORT=3000
   ```

4. **Database Migrations:**
   Run the Drizzle migrations to set up the tables (Users, Sessions, Spots, Hotspots, Comments).
   ```bash
   npm run db:push
   ```

5. **Start the application:**
   ```bash
   npm run dev
   ```
