import express from 'express';
import { MongoClient } from 'mongodb';
import cors from 'cors';
import { customAlphabet } from 'nanoid';
import { SmsService } from 'sms-lib';
import 'dotenv/config';

const app = express();
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/";

app.use(cors());
app.use(express.json());

// MongoDB Setup
const client = new MongoClient(MONGO_URI);
let db, urlsCollection, subscriptionsCollection, smsTemplatesCollection;

async function connectDB() {
    if (db) return { db, urlsCollection, subscriptionsCollection };
    try {
        await client.connect();
        db = client.db("url_shortener");
        urlsCollection = db.collection("urls");
        subscriptionsCollection = db.collection("subscriptions");
        smsTemplatesCollection = db.collection("sms_templates");

        // Create indexes
        await urlsCollection.createIndex({ long_url: 1, application_id: 1, base_url: 1 });
        await subscriptionsCollection.createIndex({ organization_id: 1, location_id: 1 });
        await smsTemplatesCollection.createIndex({ name: 1 });

        return { db, urlsCollection, subscriptionsCollection };
    } catch (err) {
        console.error("MongoDB connection error:", err);
        throw err;
    }
}

// Middleware to ensure DB is connected
async function dbMiddleware(req, res, next) {
    try {
        const { urlsCollection: coll, subscriptionsCollection: subColl, smsTemplatesCollection: tmpColl } = await connectDB();
        req.urlsCollection = coll;
        req.subscriptionsCollection = subColl;
        req.smsTemplatesCollection = tmpColl;
        next();
    } catch (err) {
        console.error("Database connection failed:", err);
        res.status(500).json({ error: "Database connection failed" });
    }
}

app.use(dbMiddleware);

// Helper for short code generation
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 3);

function parseIsoDate(dateStr) {
    if (!dateStr) return null;
    try {
        return new Date(dateStr);
    } catch (e) {
        return null;
    }
}

function renderErrorPage(title, message, statusCode = 404) {
    const isExpired = statusCode === 410;
    const accentColor = isExpired ? '#FF6B6B' : '#4ECDC4';

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title} | iklo</title>
            <link rel="icon" type="image/png" href="/favicon.png" />
            <link href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                :root {
                    --primary: #FF6B6B;
                    --secondary: #4ECDC4;
                    --text: #2F3E46;
                    --glass: rgba(255, 255, 255, 0.84);
                    --shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.1);
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Inter', sans-serif;
                    background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);
                    color: var(--text);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    padding: 20px;
                }
                .card {
                    background: var(--glass);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border-radius: 32px;
                    padding: 3.5rem 2rem;
                    box-shadow: var(--shadow);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    max-width: 500px;
                    width: 100%;
                    text-align: center;
                    animation: slideUp 0.6s cubic-bezier(0.23, 1, 0.32, 1);
                }
                .logo {
                    height: 50px;
                    width: auto;
                    max-width: 180px;
                    object-fit: contain;
                    margin-bottom: 2rem;
                    display: inline-block;
                }
                .icon-box {
                    width: 80px;
                    height: 80px;
                    background: ${accentColor}15;
                    border-radius: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                    color: ${accentColor};
                    font-size: 2.5rem;
                }
                h1 {
                    font-family: 'Comic Neue', cursive;
                    font-size: 2.2rem;
                    margin-bottom: 1rem;
                    color: var(--text);
                }
                p {
                    font-size: 1.1rem;
                    line-height: 1.6;
                    margin-bottom: 1rem;
                    color: #5A6D77;
                }
                .footer {
                    margin-top: 3rem;
                    font-family: 'Comic Neue', cursive;
                    font-weight: 700;
                    color: #00A676;
                    font-size: 1rem;
                }
                .footer a {
                    color: #00A676;
                    text-decoration: none;
                    border-bottom: 2px solid transparent;
                    transition: all 0.3s ease;
                }
                .footer a:hover {
                    border-bottom-color: #00A676;
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        </head>
        <body>
            <div class="card">
                <img src="https://live.aeye.camera/logo.png" alt="iklo Logo" class="logo">
                <div class="icon-box">
                    ${isExpired ? '⌛' : '🔍'}
                </div>
                <h1>${title}</h1>
                <p>${message}</p>
                <div class="footer">
                    Powered by <a href="https://aeye.camera/">aeye.camera</a>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Shortener Endpoint
// Template Resolution and SMS Sending Helper
async function resolveTemplateAndSend(templateId, mobileNo, variables, req) {
    const templatesCollection = req.smsTemplatesCollection;
    const template = await templatesCollection.findOne({ _id: templateId });

    if (!template) {
        throw new Error(`Template not found with ID: ${templateId}`);
    }

    let expandedMessage = template.text;
    for (const [key, value] of Object.entries(variables)) {
        expandedMessage = expandedMessage.replace(`[${key}]`, value);
    }

    return await SmsService.sendSms({
        apiKey: process.env.SMS_API_KEY,
        mobileNo,
        message: expandedMessage,
        senderId: template.senderId || process.env.DEFAULT_SENDER_ID,
        peid: template.peid || process.env.PEID,
        dltTemplateId: template._id,
        serviceName: process.env.DEFAULT_SERVICE_NAME || 'TEMPLATE_BASED'
    });
}

// Shortener Endpoint
app.post('/api/shorten', async (req, res) => {
    const urlsCollection = req.urlsCollection;
    const {
        url: long_url,
        application_id = 'default_app',
        client_id = 'unknown_client',
        base_url = 'https://l.aeye.camera/v?c=',
        service_type = 'live',
        cam_count = 1,
        cam_urls = [],
        mask_url = false,
        expiry_days = 0,
        expiry_hours = 0,
        expiry_minutes = 0,
        expiry_seconds = 0,
        creation_time: client_creation_time_str,
        expiry_time: client_expiry_time_str,
        mobileNo,
        templateId
    } = req.body;

    if (!long_url) {
        return res.status(400).json({ error: "URL is required" });
    }

    let formattedBaseUrl = base_url;
    if (!formattedBaseUrl.endsWith('/') && !formattedBaseUrl.includes('?')) {
        formattedBaseUrl += '/';
    }

    // Check for existing link
    let existing = await urlsCollection.findOne({
        long_url,
        application_id,
        base_url: formattedBaseUrl,
        service_type,
        mask_url
    });

    let short_code, short_url;
    if (existing) {
        const now = new Date();
        if (!existing.expiry_time || existing.expiry_time > now) {
            short_code = existing._id;
            short_url = existing.short_url;
        }
    }

    if (!short_code) {
        // Generate short code
        while (true) {
            short_code = nanoid();
            const conflict = await urlsCollection.findOne({ _id: short_code });
            if (!conflict) break;
        }

        short_url = `${formattedBaseUrl}${short_code}`;
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
    }

    // Handle SMS sending if requested
    let sms_status = 'NOT_REQUESTED';
    if (mobileNo && templateId) {
        try {
            const smsResponse = await resolveTemplateAndSend(templateId, mobileNo, { URL: short_url }, req);
            sms_status = smsResponse.status;
        } catch (err) {
            console.error("Combined SMS sending failed:", err);
            sms_status = `FAILED: ${err.message}`;
        }
    }

    res.json({
        short_url,
        short_code,
        application_id,
        client_id,
        service_type,
        cam_count,
        sms_status
    });
});

// SMS Sending Endpoint
app.post('/api/send-sms', async (req, res) => {
    const {
        mobileNo,
        message,
        templateId,
        variables = {},
        apiKey = process.env.SMS_API_KEY,
        senderId = process.env.DEFAULT_SENDER_ID,
        peid = process.env.PEID,
        dltTemplateId = process.env.DEFAULT_TEMPLATE_ID,
        serviceName = process.env.DEFAULT_SERVICE_NAME || 'TEMPLATE_BASED',
        unicode = false,
        scheduleDate
    } = req.body;

    if (!mobileNo) {
        return res.status(400).json({ error: "mobileNo is required" });
    }

    try {
        let response;
        if (templateId) {
            response = await resolveTemplateAndSend(templateId, mobileNo, variables, req);
        } else if (message) {
            response = await SmsService.sendSms({
                apiKey,
                mobileNo,
                message,
                senderId,
                serviceName,
                peid,
                dltTemplateId,
                unicode,
                scheduleDate
            });
        } else {
            return res.status(400).json({ error: "message or templateId is required" });
        }

        if (response.status === 'SUCCESS') {
            res.json(response);
        } else {
            res.status(500).json(response);
        }
    } catch (err) {
        console.error("SMS Sending Error:", err);
        res.status(500).json({ status: 'FAILED', error: err.message });
    }
});

// Template Management Endpoint
app.post('/api/templates', async (req, res) => {
    const templatesCollection = req.smsTemplatesCollection;
    const { _id, text, peid, senderId, name } = req.body;

    if (!_id || !text) {
        return res.status(400).json({ error: "_id (Template ID) and text are required" });
    }

    try {
        await templatesCollection.updateOne(
            { _id },
            { $set: { text, peid, senderId, name, updated_at: new Date() } },
            { upsert: true }
        );
        res.json({ message: "Template saved successfully", _id });
    } catch (err) {
        console.error("Template Save Error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Subscription Check Endpoint
app.get('/api/subscription-check', async (req, res) => {
    const { orgId, locId } = req.query;

    if (!orgId || !locId) {
        return res.status(400).json({ error: "orgId and locId are required as query parameters" });
    }

    try {
        const subscription = await req.subscriptionsCollection.findOne({
            organization_id: orgId,
            location_id: locId
        });

        res.json({
            subscribed: subscription ? !!subscription.subscribed : false
        });
    } catch (err) {
        console.error("Error checking subscription:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Helper function to resolve short code
async function resolveShortCode(short_code, req, res) {
    const urlsCollection = req.urlsCollection;

    if (!short_code) {
        res.setHeader('Content-Type', 'text/html');
        return res.status(400).send(renderErrorPage(
            "Oops! Missing Code",
            "Please provide a valid camera code to access the stream.",
            400
        ));
    }

    const existing = await urlsCollection.findOne({ _id: short_code });

    if (existing) {
        const now = new Date();
        if (existing.expiry_time && existing.expiry_time < now) {
            res.setHeader('Content-Type', 'text/html');
            return res.status(410).send(renderErrorPage(
                "Oops! Link timedout",
                "This shared camera link has expired. Please request a new one if you feel this is an error",
                410
            ));
        }

        if (existing.mask_url) {
            const expiryParam = existing.expiry_time ? `expires=${encodeURIComponent(existing.expiry_time.toISOString())}` : '';

            let maskedUrl = existing.long_url;
            if (expiryParam) {
                const separator = maskedUrl.includes('?') ? '&' : '?';
                maskedUrl = `${maskedUrl}${separator}${expiryParam}`;
            }

            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>iklo</title>
                    <link rel="icon" type="image/png" href="/favicon.png" />
                    <style>
                        body, html { margin: 0; padding: 0; height: 100%; overflow-y: auto; }
                        iframe { width: 100%; height: 100%; border: none; display: block; }
                    </style>
                </head>
                <body>
                    <iframe src="${maskedUrl}"></iframe>
                </body>
                </html>  
            `);
        }

        return res.redirect(existing.long_url);
    } else {
        res.setHeader('Content-Type', 'text/html');
        return res.status(404).send(renderErrorPage(
            "Oops! Invalid Link",
            "The camera link you're trying to access is invalid or has been removed. Please check the URL and try again.",
            404
        ));
    }
}

// Short Code Resolver (/v?c=short_code)
app.get('/v', async (req, res) => {
    const { c: short_code } = req.query;
    await resolveShortCode(short_code, req, res);
});

// Short Code Resolver (/:short_code)
app.get('/:short_code', async (req, res) => {
    const { short_code } = req.params;
    await resolveShortCode(short_code, req, res);
});

// Export for Vercel
export default app;
