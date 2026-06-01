document.addEventListener('DOMContentLoaded', () => {
    initCalendar();
    // 初期状態は今月のサマリーを表示
    showMonthlyDashboard(currentDate.getFullYear(), currentDate.getMonth());
});

let currentDate = new Date(); // 表示中の月を管理
let activityLog = {};

function initCalendar() {
    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');
    const monthLabel = document.getElementById('cal-month-label');

    try {
        const stored = localStorage.getItem('EnglishHubActivityLog');
        if (stored) {
            activityLog = JSON.parse(stored);
        }
    } catch (e) {
        console.error(e);
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
            showMonthlyDashboard(currentDate.getFullYear(), currentDate.getMonth());
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
            showMonthlyDashboard(currentDate.getFullYear(), currentDate.getMonth());
        });
    }

    // 月ラベルをクリックしたら月間表示に戻る
    if (monthLabel) {
        monthLabel.style.cursor = 'pointer';
        monthLabel.addEventListener('click', () => {
            showMonthlyDashboard(currentDate.getFullYear(), currentDate.getMonth());
            // 選択状態のセルがあれば解除
            document.querySelectorAll('.calendar-cell.selected').forEach(c => c.classList.remove('selected'));
        });
    }

    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('cal-month-label');
    const summaryLabel = document.getElementById('calendar-summary');
    
    if (!grid || !monthLabel || !summaryLabel) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthLabel.textContent = `${year}年${month + 1}月`;
    grid.innerHTML = '';

    const days = ['日', '月', '火', '水', '木', '金', '土'];
    days.forEach(day => {
        const d = document.createElement('div');
        d.className = 'calendar-day-label';
        d.textContent = day;
        grid.appendChild(d);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let studiedDaysCount = 0;

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        cell.textContent = day;
        cell.style.cursor = 'pointer';
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cell.dataset.date = dateStr;
        
        const counts = activityLog[dateStr];
        let totalCount = 0;
        if (counts) {
            for (let app in counts) {
                totalCount += counts[app];
            }
        }
        
        if (totalCount > 0) {
            cell.classList.add('has-record');
            studiedDaysCount++;
        }

        // クリックイベントで日別ダッシュボードを表示
        cell.addEventListener('click', () => {
            document.querySelectorAll('.calendar-cell.selected').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            showDailyDashboard(dateStr);
        });

        grid.appendChild(cell);
    }

    summaryLabel.textContent = `学習記録: ${studiedDaysCount}日 / ${daysInMonth}日`;
}

function showMonthlyDashboard(year, month) {
    const title = document.getElementById('details-title');
    const stats = document.getElementById('details-stats');
    if (!title || !stats) return;

    title.textContent = `${year}年${month + 1}月の学習状況`;
    
    // その月の全アプリの合算を計算
    let appTotals = {};
    let totalQuestions = 0;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    
    for (let dateStr in activityLog) {
        if (dateStr.startsWith(prefix)) {
            const counts = activityLog[dateStr];
            for (let app in counts) {
                if (!appTotals[app]) appTotals[app] = 0;
                appTotals[app] += counts[app];
                totalQuestions += counts[app];
            }
        }
    }

    if (totalQuestions === 0) {
        stats.innerHTML = `<div>まだこの月の学習記録がありません。</div>`;
        drawEmptyChart(document.getElementById('hub-mastery-chart'), 'データなし');
    } else {
        let statsHtml = `<div style="font-weight:bold; margin-bottom: 8px;">総解答数: ${totalQuestions}問</div>`;
        for (let app in appTotals) {
            statsHtml += `<div>- ${app}: ${appTotals[app]}問</div>`;
        }
        stats.innerHTML = statsHtml;
        
        drawActivityChart(document.getElementById('hub-mastery-chart'), appTotals);
    }
}

function showDailyDashboard(dateStr) {
    const title = document.getElementById('details-title');
    const stats = document.getElementById('details-stats');
    if (!title || !stats) return;

    title.textContent = `${dateStr} の学習状況`;
    
    const counts = activityLog[dateStr];
    let totalQuestions = 0;
    
    if (counts) {
        for (let app in counts) {
            totalQuestions += counts[app];
        }
    }

    if (totalQuestions === 0) {
        stats.innerHTML = `<div>この日は学習していません。</div>`;
        drawEmptyChart(document.getElementById('hub-mastery-chart'), '学習なし');
    } else {
        let statsHtml = `<div style="font-weight:bold; margin-bottom: 8px;">総解答数: ${totalQuestions}問</div>`;
        for (let app in counts) {
            statsHtml += `<div>- ${app}: ${counts[app]}問</div>`;
        }
        stats.innerHTML = statsHtml;
        
        drawActivityChart(document.getElementById('hub-mastery-chart'), counts);
    }
}

// アクティビティ（アプリ別解答数）の円グラフ描画
function drawActivityChart(ctx, dataObj) {
    if (window.hubMasteryChartInstance) {
        window.hubMasteryChartInstance.destroy();
    }
    
    const labels = Object.keys(dataObj);
    const data = Object.values(dataObj);
    
    // カラーパレット（アプリが増えても対応できるようにいくつか用意）
    const colors = ['#60a5fa', '#34d399', '#fcd34d', '#f87171', '#a78bfa'];
    
    window.hubMasteryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0
            }]
        },
        plugins: [ChartDataLabels],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 14 },
                    formatter: (value) => {
                        return value + '問';
                    }
                }
            }
        }
    });
}

function drawEmptyChart(ctx, labelText) {
    if (!ctx) return;
    if (window.hubMasteryChartInstance) {
        window.hubMasteryChartInstance.destroy();
    }
    window.hubMasteryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [labelText],
            datasets: [{
                data: [1],
                backgroundColor: ['#e2e2e2'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { enabled: false },
                datalabels: { display: false }
            }
        }
    });
}
