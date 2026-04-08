/**
 * server.js — Smart Medicine Dispenser Backend
 * Express + MongoDB REST API
 * Endpoints: POST /api/addData, GET /api/stats, GET /api/history, GET /api/ml
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const ml = require('./ml');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/medicine_dispenser';

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MongoDB Schema & Model ────────────────────────────────────────────────────
const doseSchema = new mongoose.Schema({
  device_id:   { type: String, required: true, default: 'disp1' },
  event:       { type: String, enum: ['taken', 'missed'], required: true },
  time:        { type: String },                        // "HH:MM"
  taken:       { type: Boolean, default: false },
  delay:       { type: Number, default: 0 },            // seconds
  tablets_left:{ type: Number, default: 0 },
  timestamp:   { type: Date, default: Date.now }
});

const Dose = mongoose.model('Dose', doseSchema);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/addData
 * Accept JSON from ESP32 device.
 * Body: { device, event, time, tablets, delay }
 */
app.post('/api/addData', async (req, res) => {
  try {
    const { device, event, time, tablets, delay } = req.body;

    if (!event || !['taken', 'missed'].includes(event)) {
      return res.status(400).json({ error: 'Invalid event. Use "taken" or "missed".' });
    }

    console.log(`📥 Data received from ${device || 'disp1'}: ${event} - ${tablets} tablets left`);
    
    const record = new Dose({
      device_id:    device || 'disp1',
      event:        event,
      time:         time || new Date().toTimeString().slice(0, 5),
      taken:        event === 'taken',
      delay:        parseInt(delay) || 0,
      tablets_left: parseInt(tablets) || 0,
      timestamp:    new Date()
    });

    await record.save();

    res.status(201).json({
      success: true,
      message: 'Data recorded successfully',
      id: record._id
    });
  } catch (err) {
    console.error('addData error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * GET /api/stats
 * Returns dashboard summary statistics.
 */
app.get('/api/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Today's counts
    const todayAll   = await Dose.find({ timestamp: { $gte: today, $lte: todayEnd } });
    const takenToday = todayAll.filter(d => d.event === 'taken').length;
    const missedToday= todayAll.filter(d => d.event === 'missed').length;

    // Latest tablets count
    const latestRecord = await Dose.findOne().sort({ timestamp: -1 });
    const tabletsLeft  = latestRecord ? latestRecord.tablets_left : 0;
    const lastSeen     = latestRecord ? latestRecord.timestamp : null;

    // Device online: if last record < 5 minutes ago
    const isOnline = lastSeen
      ? (Date.now() - new Date(lastSeen).getTime()) < 5 * 60 * 1000
      : false;

    // All records for adherence score
    const allRecords = await Dose.find().sort({ timestamp: 1 });
    const adherence  = ml.calculateAdherenceScore(allRecords);

    // Weekly data (last 7 days)
    const weekly = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayRecords = await Dose.find({ timestamp: { $gte: dayStart, $lte: dayEnd } });
      weekly.push({
        date:   dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        taken:  dayRecords.filter(d => d.event === 'taken').length,
        missed: dayRecords.filter(d => d.event === 'missed').length
      });
    }

    // Dose time distribution (hours 0–23 taken count)
    const hourDist = Array(24).fill(0);
    allRecords.filter(r => r.event === 'taken' && r.time).forEach(r => {
      const hour = parseInt(r.time.split(':')[0]);
      if (!isNaN(hour)) hourDist[hour]++;
    });

    // Tablet remaining trend (last 14 records)
    const trendRecords = await Dose.find().sort({ timestamp: -1 }).limit(14);
    const tabletTrend  = trendRecords.reverse().map(r => ({
      time:    r.time || '--',
      tablets: r.tablets_left,
      date:    new Date(r.timestamp).toLocaleDateString()
    }));

    // Next scheduled dose (next round hour)
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    const nextDoseTime = nextHour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    res.json({
      takenToday,
      missedToday,
      tabletsLeft,
      isOnline,
      lastSeen,
      adherenceScore: adherence,
      nextDoseTime,
      weekly,
      hourDist,
      tabletTrend,
      totalTaken:  allRecords.filter(r => r.event === 'taken').length,
      totalMissed: allRecords.filter(r => r.event === 'missed').length
    });
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * GET /api/history
 * Returns paginated dose history logs.
 * Query params: page, limit
 */
app.get('/api/history', async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip  = (page - 1) * limit;

    const total   = await Dose.countDocuments();
    const records = await Dose.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      records: records.map(r => ({
        id:          r._id,
        device_id:   r.device_id,
        date:        new Date(r.timestamp).toLocaleDateString('en-US'),
        time:        r.time || new Date(r.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        event:       r.event,
        delay:       r.delay,
        tablets_left:r.tablets_left,
        timestamp:   r.timestamp
      }))
    });
  } catch (err) {
    console.error('history error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * GET /api/ml
 * Returns ML predictions and analytics.
 */
app.get('/api/ml', async (req, res) => {
  try {
    const allRecords = await Dose.find().sort({ timestamp: 1 });
    const report     = ml.generateMLReport(allRecords);
    res.json(report);
  } catch (err) {
    console.error('ml error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * GET /api/health
 * Simple health-check endpoint.
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Database Connection & Server Start ───────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected:', MONGO_URI);
    app.listen(PORT, () => {
      console.log(`🚀 Smart Medicine Dispenser server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('⚠️  Running in demo mode without database...');
    // Seed demo data and start without DB for testing
    app.listen(PORT, () => {
      console.log(`🚀 Server running (DEMO MODE) at http://localhost:${PORT}`);
    });
  });

module.exports = app;
