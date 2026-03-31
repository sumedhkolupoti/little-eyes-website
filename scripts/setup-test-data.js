import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/";
const client = new MongoClient(MONGO_URI);

async function createTestData() {
    try {
        await client.connect();
        const db = client.db("url_shortener");
        const subscriptionsCollection = db.collection("subscriptions");

        const testData = {
            organization_id: "testOrg",
            location_id: "testLoc",
            subscribed: true
        };

        const result = await subscriptionsCollection.updateOne(
            { organization_id: testData.organization_id, location_id: testData.location_id },
            { $set: testData },
            { upsert: true }
        );

        console.log("Test data created successfully:");
        console.log("orgId: testOrg, locId: testLoc, subscribed: true");
    } catch (err) {
        console.error("Error creating test data:", err);
    } finally {
        await client.close();
    }
}

createTestData();
