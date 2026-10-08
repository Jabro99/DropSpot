# DropSpot

DropSpot is a location-based virtual geocaching web app where users can leave digital spots at real-world locations and discover spots left by other users.

If several spots are created close together, they are grouped into a hotspot. Spots within a hotspot can then become comments, allowing users to add to the location rather than creating lots of separate markers.

**Live:** https://dropspot.uk

## Features

- Create and view location-based spots
- Interactive map using Leaflet
- Automatically group nearby spots into hotspots
- Comment on hotspots
- User registration and login
- User accounts showing their spots and comments
- Location-based searches
- Responsive interface

## Tech Stack

**Frontend**
- HTML
- CSS
- JavaScript
- Leaflet
- Carto

**Backend**
- Node.js
- Express
- TypeScript
- Zod
- bcrypt
- Helmet
- Express Rate Limit

**Database**
- PostgreSQL
- PostGIS
- Drizzle ORM

**Deployment**
- Railway
- Custom domain: dropspot.uk

## Security

I carried out a security review of the application and implemented a number of protections, including:

- bcrypt password hashing
- Server-side session management
- HTTP-only and SameSite cookies
- Zod input validation
- Parameterised database queries through Drizzle ORM
- XSS protection through escaping user-generated content
- Rate limiting on login, registration and API endpoints
- Helmet security headers and Content Security Policy
- Authentication and authorisation checks on protected routes
- Environment variables for database credentials and other configuration
- Generic error responses to avoid exposing internal server information

## Project Structure

```text
DropSpot/
├── backend/
│   ├── server.ts
│   └── schema.ts
├── frontend/
│   ├── css/
│   ├── html/
│   └── js/
├── scripts/
│   └── build-config.js
├── package.json
├── tsconfig.json
└── .gitignore
