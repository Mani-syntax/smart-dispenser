/**
 * app.js - Smart Medicine Dispenser Frontend Logic
 * Handles: API interaction, Charts, Navigation, Security
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let charts = {};
    let currentView = 'dashboard';

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

            // Update UI
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(`${view}-view`);
            if (targetSection) targetSection.classList.add('active');

            // Update Header
            viewTitle.textContent = item.querySelector('span').textContent;
            viewSubtitle.textContent = viewSubtitles[view] || '';

            currentView = view;

            // Refresh data when switching views
            fetchData();
        });
    });

    // --- Chart Initialization ---
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

        // Daily Taken Chart
        charts.daily = new Chart(ctxDaily, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Taken', backgroundColor: '#007bff', borderRadius: 6, data: [] }] },
            options: chartOptions
        });

        // Weekly Usage Chart
        charts.weekly = new Chart(ctxWeekly, {
            type: 'line',
            data: { labels: [], datasets: [
                { label: 'Taken', borderColor: '#28a745', tension: 0.4, data: [] },
                { label: 'Missed', borderColor: '#dc3545', tension: 0.4, borderDash: [5, 5], data: [] }
            ]},
            options: { ...chartOptions, plugins: { legend: { display: true } } }
        });

        // Taken vs Missed (Pie)
        charts.pie = new Chart(ctxTakenMissed, {
            type: 'doughnut',
            data: { labels: ['Taken', 'Missed'], datasets: [{ backgroundColor: ['#28a745', '#dc3545'], data: [0, 0] }] },
            options: { ...chartOptions, plugins: { legend: { display: true, position: 'bottom' } } }
        });

        // Remaining Trend
        charts.remaining = new Chart(ctxRemaining, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Remaining', borderColor: '#6f42c1', fill: true, backgroundColor: 'rgba(111, 66, 193, 0.1)', tension: 0.1, data: [] }] },
            options: chartOptions
        });

        // Dose Time Distribution
        charts.dist = new Chart(ctxDoseDist, {
            type: 'bar',
            data: { labels: Array.from({length: 24}, (_, i) => `${i}:00`), datasets: [{ label: 'Frequency', backgroundColor: '#17a2b8', data: Array(24).fill(0) }] },
            options: { ...chartOptions, plugins: { legend: { display: false } } }
        });
    }

    // --- API Interactions ---
    async function fetchData() {
        try {
            // Stats & Charts Data
            const statsRes = await fetch('/api/stats');
            const stats = await statsRes.json();
            updateDashboardWidgets(stats);
            updateCharts(stats);

            // History Data
            const historyRes = await fetch('/api/history?limit=10');
            const history = await historyRes.json();
            updateHistoryTable(history.records);

            // ML Data
            const mlRes = await fetch('/api/ml');
            const mlData = await mlRes.json();
            updateMLWidgets(mlData);

            document.getElementById('sync-time').textContent = new Date().toLocaleTimeString();
        } catch (err) {
            console.error('Fetch error:', err);
        }
    }

    function updateDashboardWidgets(data) {
        document.getElementById('tablets-taken-today').textContent = data.takenToday || 0;
        document.getElementById('missed-today').textContent = data.missedToday || 0;
        document.getElementById('tablets-remaining').textContent = data.tabletsLeft || 0;
        document.getElementById('next-dose').textContent = data.nextDoseTime || '--:--';
        
        const adherenceText = document.getElementById('adherence-score');
        const adherenceFill = document.getElementById('score-fill');
        const score = data.adherenceScore || 0;
        adherenceText.textContent = `${score}%`;
        adherenceFill.style.width = `${score}%`;

        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('device-status-text');
        if (data.isOnline) {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Device Online';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Device Offline';
        }

        const lastPingField = document.getElementById('last-ping');
        if (lastPingField && data.lastSeen) {
            lastPingField.textContent = new Date(data.lastSeen).toLocaleString();
        }
    }

    function updateCharts(data) {
        // Daily Chart
        if (data.weekly) {
            charts.daily.data.labels = data.weekly.map(d => d.date);
            charts.daily.data.datasets[0].data = data.weekly.map(d => d.taken);
            charts.daily.update();

            charts.weekly.data.labels = data.weekly.map(d => d.date);
            charts.weekly.data.datasets[0].data = data.weekly.map(d => d.taken);
            charts.weekly.data.datasets[1].data = data.weekly.map(d => d.missed);
            charts.weekly.update();
        }

        // Pie Chart
        charts.pie.data.datasets[0].data = [data.totalTaken || 0, data.totalMissed || 0];
        charts.pie.update();

        // Remaining Trend
        if (data.tabletTrend) {
            charts.remaining.data.labels = data.tabletTrend.map(t => t.time);
            charts.remaining.data.datasets[0].data = data.tabletTrend.map(t => t.tablets);
            charts.remaining.update();
        }

        // Distribution
        if (data.hourDist) {
            charts.dist.data.datasets[0].data = data.hourDist;
            charts.dist.update();
        }
    }

    function updateHistoryTable(records) {
        const tbody = document.querySelector('#history-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        if (!records || records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No records found</td></tr>';
            return;
        }

        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.date}</td>
                <td>${r.time}</td>
                <td><span class="tag ${r.event}">${r.event.toUpperCase()}</span></td>
                <td>${r.delay}s</td>
                <td>${r.tablets_left}</td>
                <td><i class="fas fa-check-circle" style="color:#28a745"></i> Verified</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateMLWidgets(data) {
        if (!data) return;
        document.getElementById('ml-missed-prob').textContent = `${data.missedProbability}%`;
        document.getElementById('ml-recommended-time').textContent = data.recommendedReminderTime;
        document.getElementById('ml-empty-date').textContent = data.tabletEmptyForecast;
        document.getElementById('ml-behavior').textContent = data.behaviorClassification;
    }

    // --- Security Features ---
    function initSecurity() {
        const alertBox = document.getElementById('security-alert');

        // Block Context Menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showAlert();
        });

        // Block Shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U)
        document.addEventListener('keydown', (e) => {
            if (
                e.keyCode === 123 || // F12
                (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) || // Ctrl+Shift+I/J
                (e.ctrlKey && e.keyCode === 85) // Ctrl+U
            ) {
                e.preventDefault();
                showAlert();
            }
        });

        function showAlert() {
            alertBox.style.display = 'flex';
        }
    }

    // --- Initialization ---
    initCharts();
    initSecurity();
    fetchData();

    // Auto Refresh every 5 seconds
    setInterval(fetchData, 5000);
});
