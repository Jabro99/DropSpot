import "dotenv/config";
import fs from "fs";
import path from "path";

const apiKey = process.env.CARTO_API_KEY;

if (apiKey) {
    const configPath = path.resolve("frontend/js/config.js");

    fs.writeFileSync(
        configPath,
        `window.CARTO_API_KEY = ${JSON.stringify(apiKey)};\n`
    );

    console.log("Generated frontend/js/config.js");
} else {
    console.log("CARTO_API_KEY not set — keeping existing config.js");
}