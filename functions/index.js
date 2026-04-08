/**
 * functions/index.js - Cloud Functions for Smart Med Dispenser
 * Acts as the API gateway for the ESP32 and handles Firestore updates.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");

admin.initializeApp();
const db = admin.firestore();
const app = express();

app.use(express.json());

/**
 * POST /api/addData
 * Replaces the Express server endpoint. 
 * Allows the ESP32 to send data to the Cloud 24/7.
 */
app.post("/api/addData", async (req, res) => {
  try {
    const { device, event, time, tablets, delay } = req.body;

    if (!event || !['taken', 'missed'].includes(event)) {
      return res.status(400).send({ error: "Invalid event" });
    }

    const payload = {
      device_id: device || "disp1",
      event: event,
      time: time || new Date().toISOString().substring(11, 16),
      taken: event === "taken",
      delay: parseInt(delay) || 0,
      tablets_left: parseInt(tablets) || 0,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection("doses").add(payload);

    res.status(201).send({
      success: true,
      id: docRef.id,
      message: "Data synced to Firebase"
    });
  } catch (error) {
    console.error("Cloud Function Error:", error);
    res.status(500).send({ error: error.message });
  }
});

// Export the API as a Cloud Function
exports.api = functions.https.onRequest(app);
