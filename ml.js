/**
 * ml.js — Smart Medicine Dispenser ML Analytics Module
 * Implements: Missed Dose Prediction, Adherence Scoring,
 *             Tablet Empty Forecast, Behavior Classification
 */

/**
 * Calculate adherence score (0–100) from history records.
 * Score = (taken events / total events) * 100, with time-delay penalty.
 */
function calculateAdherenceScore(records) {
  if (!records || records.length === 0) return 0;

  const total = records.length;
  const takenRecords = records.filter(r => r.event === 'taken');
  const taken = takenRecords.length;

  // Base score from taken ratio
  let baseScore = (taken / total) * 100;

  // Delay penalty: average delay > 120s reduces score
  if (takenRecords.length > 0) {
    const avgDelay = takenRecords.reduce((sum, r) => sum + (r.delay || 0), 0) / takenRecords.length;
    const delayPenalty = Math.min(avgDelay / 600, 0.2) * 100; // max 20pt penalty
    baseScore = Math.max(0, baseScore - delayPenalty);
  }

  return Math.round(baseScore);
}

/**
 * Predict missed dose probability (%) for the next dose.
 * Uses a sliding window of the last N records.
 */
function predictMissedDose(records) {
  if (!records || records.length === 0) return 50;

  const window = records.slice(-20); // last 20 records
  const missedCount = window.filter(r => r.event === 'missed').length;
  const total = window.length;

  // Base probability from historical miss rate
  let probability = (missedCount / total) * 100;

  // Pattern analysis: 3 consecutive misses increases probability
  let consecutiveMisses = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].event === 'missed') {
      consecutiveMisses++;
    } else {
      break;
    }
  }
  if (consecutiveMisses >= 3) {
    probability = Math.min(95, probability + consecutiveMisses * 5);
  }

  // Time-of-day analysis: high-delay times predict misses
  const recentDelays = records.slice(-5).map(r => r.delay || 0);
  const avgRecentDelay = recentDelays.reduce((a, b) => a + b, 0) / recentDelays.length;
  if (avgRecentDelay > 300) {
    probability = Math.min(95, probability + 10);
  }

  return Math.round(probability);
}

/**
 * Recommend optimal reminder time based on historical dose times.
 * Returns formatted time string.
 */
function recommendReminderTime(records) {
  if (!records || records.length === 0) return '09:00 AM';

  const takenRecords = records.filter(r => r.event === 'taken' && r.time);
  if (takenRecords.length === 0) return '09:00 AM';

  // Convert time strings to minutes from midnight
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hh, mm] = timeStr.split(':').map(Number);
    return (hh || 0) * 60 + (mm || 0);
  };

  const minutesList = takenRecords.map(r => timeToMinutes(r.time));
  minutesList.sort((a, b) => a - b);

  // Use median time as recommended reminder
  const medianMinutes = minutesList[Math.floor(minutesList.length / 2)];

  // Subtract average delay to fire reminder earlier
  const avgDelay = takenRecords.reduce((sum, r) => sum + (r.delay || 0), 0) / takenRecords.length;
  const reminderMinutes = Math.max(0, medianMinutes - Math.round(avgDelay / 60) - 5);

  const hours = Math.floor(reminderMinutes / 60) % 24;
  const mins = reminderMinutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${String(displayHour).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
}

/**
 * Forecast date when tablets will run out.
 * Based on current tablets_left and average daily consumption.
 */
function forecastEmptyDate(records) {
  if (!records || records.length === 0) return 'Unknown';

  const takenRecords = records.filter(r => r.event === 'taken');
  if (takenRecords.length === 0) return 'Unknown';

  // Get latest tablets_left
  const sorted = [...records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const latestTablets = sorted[0]?.tablets_left || 0;
  if (latestTablets <= 0) return 'Already Empty!';

  // Calculate daily consumption from data span
  const oldestDate = new Date(sorted[sorted.length - 1].timestamp);
  const newestDate = new Date(sorted[0].timestamp);
  const daySpan = Math.max(1, (newestDate - oldestDate) / (1000 * 60 * 60 * 24));
  const dailyRate = takenRecords.length / daySpan;

  if (dailyRate <= 0) return 'Unknown';

  const daysLeft = Math.ceil(latestTablets / dailyRate);
  const forecastDate = new Date();
  forecastDate.setDate(forecastDate.getDate() + daysLeft);

  return forecastDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Classify user behavior as Regular or Irregular.
 * Based on adherence score and variance in dose times.
 */
function classifyBehavior(records) {
  if (!records || records.length < 5) return 'Insufficient Data';

  const adherence = calculateAdherenceScore(records);
  const missed = predictMissedDose(records);

  if (adherence >= 80 && missed < 25) return 'Regular';
  if (adherence >= 60 && missed < 40) return 'Mostly Regular';
  if (adherence >= 40) return 'Irregular';
  return 'High Risk';
}

/**
 * Generate full ML analytics report from records.
 */
function generateMLReport(records) {
  return {
    adherenceScore: calculateAdherenceScore(records),
    missedProbability: predictMissedDose(records),
    recommendedReminderTime: recommendReminderTime(records),
    tabletEmptyForecast: forecastEmptyDate(records),
    behaviorClassification: classifyBehavior(records),
    totalRecords: records.length,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  calculateAdherenceScore,
  predictMissedDose,
  recommendReminderTime,
  forecastEmptyDate,
  classifyBehavior,
  generateMLReport
};
