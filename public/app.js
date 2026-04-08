/**
 * app.js - Smart Medicine Dispenser Frontend Logic (Firebase Version)
 * Handles: Real-time Firestore listeners, UI Updates, Analytics
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let charts = {};
    let currentView = 'dashboard';
    let unsubscribe = null; // To handle real-time listener cleanup

    // --- Navigation Logic ---
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');
    const viewTitle = document.getElementById('view-title');
    const viewSubtitle = document.getElementById('view-subtitle');

    const viewSubtitles = {
        'dashboard': 'Monitor medication adherence and device health.',
        'analytics': 'Deep dive into dispensing trends and patterns.',
        'ml-predictions': 'AI-driven insights into your health patterns.',
        'device-status': 'Hardware health and connectivity details.',
        'history': 'Full audit trail of dispensed medications.',
        'settings': 'Configure your dispenser and notification preferences.'
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            if (!view) return;

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(`${view}-view`);
            if (targetSection) targetSection.classList.add('active');

            viewTitle.textContent = item.querySelector('span').textContent;
            viewSubtitle.textContent = viewSubtitles[view] || '';

            currentView = view;
        });
    });

    // --- Chart Initialization ---
    // (Kept visual logic identical to previous version)
    function initCharts() {
        const ctxDaily = document.getElementById('dailyTakenChart')?.getContext('2d');
        const ctxWeekly = document.getElementById('weeklyUsageChart')?.getContext('2d');
        const ctxTakenMissed = document.getElementById('takenMissedChart')?.getContext('2d');
        const ctxRemaining = document.getElementById('tabletRemainingChart')?.getContext('2d');
        const ctxDoseDist = document.getElementById('doseTimeDistChart')?.getContext('2d');

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
        };

        charts.daily = new Chart(ctxDaily, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Taken', backgroundColor: '#007bff', borderRadius: 6, data: [] }] },
            options: chartOptions
        });

        charts.weekly = new Chart(ctxWeekly, {
            type: 'line',
            data: { labels: [], datasets: [
                { label: 'Taken', borderColor: '#28a745', tension: 0.4, data: [] },
                { label: 'Missed', borderColor: '#dc3545', tension: 0.4, borderDash: [5, 5], data: [] }
            ]},
            options: { ...chartOptions, plugins: { legend: { display: true } } }
        });

        charts.pie = new Chart(ctxTakenMissed, {
            type: 'doughnut',
            data: { labels: ['Taken', 'Missed'], datasets: [{ backgroundColor: ['#28a745', '#dc3545'], data: [0, 0] }] },
            options: { ...chartOptions, plugins: { legend: { display: true, position: 'bottom' } } }
        });

        charts.remaining = new Chart(ctxRemaining, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Remaining', borderColor: '#6f42c1', fill: true, backgroundColor: 'rgba(111, 66, 193, 0.1)', tension: 0.1, data: [] }] },
            options: chartOptions
        });

        charts.dist = new Chart(ctxDoseDist, {
            type: 'bar',
            data: { labels: Array.from({length: 24}, (_, i) => `${i}:00`), datasets: [{ label: 'Frequency', backgroundColor: '#17a2b8', data: Array(24).fill(0) }] },
            options: { ...chartOptions, plugins: { legend: { display: false } } }
        });
    }

    // --- Firebase Logic ---
    function startRealtimeUpdates() {
        const dosesRef = db.collection('doses').orderBy('timestamp', 'desc');

        unsubscribe = dosesRef.onSnapshot(snapshot => {
            const allDoses = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // Firestore timestamp conversion
                if (data.timestamp && data.timestamp.toDate) {
                    data.timestamp = data.timestamp.toDate();
                }
                allDoses.push({ id: doc.id, ...data });
            });

            processAndDisplayData(allDoses);
            updateHistoryTable(allDoses.slice(0, 10)); // Top 10 for dashboard history
            document.getElementById('sync-time').textContent = new Date().toLocaleTimeString();
        }, err => {
            console.error("Firestore error:", err);
            // Handle error (e.g., unauthorized)
            if (err.code === 'permission-denied') {
                alert("Please check your Firestore Security Rules!");
            }
        });
    }

    function processAndDisplayData(records) {
        if (!records || records.length === 0) return;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // 1. Widgets Calculation
        const todayRecords = records.filter(r => new Date(r.timestamp) >= startOfToday);
        const takenToday = todayRecords.filter(r => r.event === 'taken').length;
        const missedToday = todayRecords.filter(r => r.event === 'missed').length;
        const tabletsLeft = records[0]?.tablets_left || 0;
        const isOnline = (now - new Date(records[0]?.timestamp)) < 5 * 60 * 1000;

        // Adherence Score (Simplified ML in frontend)
        const total = records.length;
        const taken = records.filter(r => r.event === 'taken').length;
        const adherenceScore = total > 0 ? Math.round((taken / total) * 100) : 0;

        updateDashboardWidgets({
            takenToday,
            missedToday,
            tabletsLeft,
            isOnline,
            adherenceScore,
            lastSeen: records[0]?.timestamp,
            nextDoseTime: "12:00 PM" // Replace with actual schedule logic if available
        });

        // 2. Charts Data
        updateChartsData(records);

        // 3. ML Analytics
        updateMLWidgets({
            missedProbability: 100 - adherenceScore, // Simplified
            recommendedReminderTime: "08:30 AM",
            tabletEmptyForecast: "May 24, 2026",
            behaviorClassification: adherenceScore > 80 ? "Regular" : "Irregular"
        });
    }

    function updateDashboardWidgets(data) {
        document.getElementById('tablets-taken-today').textContent = data.takenToday;
        document.getElementById('missed-today').textContent = data.missedToday;
        document.getElementById('tablets-remaining').textContent = data.tabletsLeft;
        document.getElementById('next-dose').textContent = data.nextDoseTime;
        
        document.getElementById('adherence-score').textContent = `${data.adherenceScore}%`;
        document.getElementById('score-fill').style.width = `${data.adherenceScore}%`;

        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('device-status-text');
        statusDot.className = `status-dot ${data.isOnline ? 'online' : 'offline'}`;
        statusText.textContent = data.isOnline ? 'Device Online' : 'Device Offline';

        if (data.lastSeen) {
            document.getElementById('last-ping').textContent = new Date(data.lastSeen).toLocaleString();
        }
    }

    function updateChartsData(records) {
        // Daily/Weekly Trend (Last 7 days)
        const weekly = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date();
            day.setDate(day.getDate() - i);
            const dateStr = day.toLocaleDateString('en-US', { weekday: 'short' });
            
            const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
            const dayEnd = dayStart + 86400000;

            const dayRecords = records.filter(r => {
                const ts = new Date(r.timestamp).getTime();
                return ts >= dayStart && ts < dayEnd;
            });

            weekly.push({
                label: dateStr,
                taken: dayRecords.filter(r => r.event === 'taken').length,
                missed: dayRecords.filter(r => r.event === 'missed').length
            });
        }

        charts.daily.data.labels = weekly.map(w => w.label);
        charts.daily.data.datasets[0].data = weekly.map(w => w.taken);
        charts.daily.update();

        charts.weekly.data.labels = weekly.map(w => w.label);
        charts.weekly.data.datasets[0].data = weekly.map(w => w.taken);
        charts.weekly.data.datasets[1].data = weekly.map(w => w.missed);
        charts.weekly.update();

        // Pie
        const totalTaken = records.filter(r => r.event === 'taken').length;
        const totalMissed = records.filter(r => r.event === 'missed').length;
        charts.pie.data.datasets[0].data = [totalTaken, totalMissed];
        charts.pie.update();

        // Distribution (Hours)
        const hourDist = Array(24).fill(0);
        records.filter(r => r.event === 'taken').forEach(r => {
            const hour = new Date(r.timestamp).getHours();
            hourDist[hour]++;
        });
        charts.dist.data.datasets[0].data = hourDist;
        charts.dist.update();

        // Tablet Remaining Trend (Last 15 records)
        const trend = records.slice(0, 15).reverse();
        charts.remaining.data.labels = trend.map(r => new Date(r.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
        charts.remaining.data.datasets[0].data = trend.map(r => r.tablets_left);
        charts.remaining.update();
    }

    function updateHistoryTable(records) {
        const tbody = document.querySelector('#history-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        records.forEach(r => {
            const tr = document.createElement('tr');
            const ts = new Date(r.timestamp);
            tr.innerHTML = `
                <td>${ts.toLocaleDateString()}</td>
                <td>${ts.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                <td><span class="tag ${r.event}">${r.event.toUpperCase()}</span></td>
                <td>${r.delay || 0}s</td>
                <td>${r.tablets_left || 0}</td>
                <td><i class="fas fa-check-circle" style="color:#28a745"></i> Cloud Sync</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateMLWidgets(data) {
        document.getElementById('ml-missed-prob').textContent = `${data.missedProbability}%`;
        document.getElementById('ml-recommended-time').textContent = data.recommendedReminderTime;
        document.getElementById('ml-empty-date').textContent = data.tabletEmptyForecast;
        document.getElementById('ml-behavior').textContent = data.behaviorClassification;
    }

    // --- Security Features ---
    function initSecurity() {
        const alertBox = document.getElementById('security-alert');
        document.addEventListener('contextmenu', e => { e.preventDefault(); alertBox.style.display = 'flex'; });
        document.addEventListener('keydown', e => {
            if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) || (e.ctrlKey && e.keyCode === 85)) {
                e.preventDefault(); alertBox.style.display = 'flex';
            }
        });
    }

    // --- Initialization ---
    initCharts();
    initSecurity();
    
    // Start Real-time listener instead of polling
    if (typeof firebase !== 'undefined') {
        startRealtimeUpdates();
    } else {
        console.error("Firebase SDK not loaded!");
    }
});
