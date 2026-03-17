const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { customAlphabet } = require('nanoid');
require('dotenv').config();

const app = express();
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/";

app.use(cors());
app.use(express.json());

// MongoDB Setup
const client = new MongoClient(MONGO_URI);
let db, urlsCollection;

async function connectDB() {
    if (db) return { db, urlsCollection };
    try {
        await client.connect();
        db = client.db("url_shortener");
        urlsCollection = db.collection("urls");

        // Create indexes
        await urlsCollection.createIndex({ long_url: 1, application_id: 1, base_url: 1 });
        return { db, urlsCollection };
    } catch (err) {
        console.error("MongoDB connection error:", err);
        throw err;
    }
}

// Middleware to ensure DB is connected
async function dbMiddleware(req, res, next) {
    try {
        const { urlsCollection: coll } = await connectDB();
        req.urlsCollection = coll;
        next();
    } catch (err) {
        res.status(500).json({ error: "Database connection failed" });
    }
}

app.use(dbMiddleware);

// Helper for short code generation
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

function parseIsoDate(dateStr) {
    if (!dateStr) return null;
    try {
        return new Date(dateStr);
    } catch (e) {
        return null;
    }
}

// Shortener Endpoint
app.post('/api/shorten', async (req, res) => {
    const urlsCollection = req.urlsCollection;
    const {
        url: long_url,
        application_id = 'default_app',
        client_id = 'unknown_client',
        base_url = 'https://live.aeye.camera/',
        service_type = 'live',
        cam_count = 1,
        cam_urls = [],
        mask_url = false,
        expiry_days = 0,
        expiry_hours = 0,
        expiry_minutes = 0,
        expiry_seconds = 0,
        creation_time: client_creation_time_str,
        expiry_time: client_expiry_time_str
    } = req.body;

    if (!long_url) {
        return res.status(400).json({ error: "URL is required" });
    }

    let formattedBaseUrl = base_url;
    if (!formattedBaseUrl.endsWith('/')) {
        formattedBaseUrl += '/';
    }

    // Check for existing link
    const existing = await urlsCollection.findOne({
        long_url,
        application_id,
        base_url: formattedBaseUrl,
        service_type,
        mask_url
    });

    if (existing) {
        const now = new Date();
        if (!existing.expiry_time || existing.expiry_time > now) {
            return res.json({
                short_url: existing.short_url,
                short_code: existing._id,
                application_id,
                client_id,
                service_type,
                cam_count
            });
        }
    }

    // Generate short code
    let short_code;
    while (true) {
        short_code = nanoid();
        const conflict = await urlsCollection.findOne({ _id: short_code });
        if (!conflict) break;
    }

    const short_url = `${formattedBaseUrl}${short_code}`;
    const now = new Date();

    // Calculate expiry
    let expiry_time = parseIsoDate(client_expiry_time_str);
    if (!expiry_time && (expiry_days || expiry_hours || expiry_minutes || expiry_seconds)) {
        expiry_time = new Date(now.getTime());
        expiry_time.setDate(expiry_time.getDate() + parseInt(expiry_days));
        expiry_time.setHours(expiry_time.getHours() + parseInt(expiry_hours));
        expiry_time.setMinutes(expiry_time.getMinutes() + parseInt(expiry_minutes));
        expiry_time.setSeconds(expiry_time.getSeconds() + parseInt(expiry_seconds));
    }

    const new_entry = {
        _id: short_code,
        application_id,
        client_id,
        service_type,
        cam_count,
        cam_urls,
        base_url: formattedBaseUrl,
        long_url,
        short_url,
        creation_time: parseIsoDate(client_creation_time_str) || now,
        expiry_time,
        mask_url
    };

    await urlsCollection.insertOne(new_entry);

    res.json({
        short_url,
        short_code,
        application_id,
        client_id,
        service_type,
        cam_count
    });
});

// Short Code Resolver
app.get('/:short_code', async (req, res) => {
    const urlsCollection = req.urlsCollection;
    const { short_code } = req.params;

    // Only handle 6-character codes to minimize conflict with web routes
    if (short_code.length !== 6) {
        return res.status(404).json({ error: "Not found" });
    }

    const existing = await urlsCollection.findOne({ _id: short_code });

    if (existing) {
        const now = new Date();
        if (existing.expiry_time && existing.expiry_time < now) {
            return res.status(410).json({ error: "This short link has expired" });
        }

        if (existing.mask_url) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Live Stream</title>
                    <style>
                        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
                        iframe { width: 100%; height: 100%; border: none; }
                    </style>
                </head>
                <body>
                    <iframe src="${existing.long_url}"></iframe>
                </body>
                </html>
            `);
        }

        return res.redirect(existing.long_url);
    } else {
        res.status(404).json({ error: "Short URL not found" });
    }
});

// Export for Vercel
module.exports = app;
