let verbsData = [];
let activeQuestions = [];
let mistakes = [];
let currentVerb = null;
let currentQuestionIndex = 0;
let inputs = [];
let keys = ['present', 'present_participle', 'past', 'past_participle'];
let madeMistakeOnCurrent = false;

// progress-manager.js が読み込み済みかチェック
const _hasProgressManager = () => typeof ProgressManager !== 'undefined';

// We assume diff_match_patch is loaded globally via CDN
const dmp = new diff_match_patch();

document.addEventListener('DOMContentLoaded', () => {
    // Initialize inputs unconditionally so file import works even if default CSV fails
    inputs = keys.map(key => document.getElementById(`input-${key}`));
    setupEventListeners();

    // 進捗データ読み込み
    loadProgressOnInit();

    // Load Default CSV
    Papa.parse('verbs.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.data && results.data.length > 0) {
                verbsData = results.data;
                document.getElementById('total-questions').textContent = verbsData.length;
            } else {
                document.getElementById('total-questions').textContent = '0';
            }
        },
        error: function() {
            document.getElementById('total-questions').textContent = 'エラー';
        }
    });
});

function setupEventListeners() {
    // CSV Upload
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            document.getElementById('file-name-display').textContent = file.name;

            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (!results.data || results.data.length === 0) {
                        alert("エラー: CSVのデータが空か、正しく読み取れませんでした。");
                        return;
                    }
                    
                    const firstRow = results.data[0];
                    const headers = Object.keys(firstRow);
                    const hasJapanese = headers.some(h => h.includes('japanese'));
                    const hasPresent = headers.some(h => h.includes('present'));

                    if (!hasJapanese || !hasPresent) {
                        alert("エラー: CSVのヘッダーが正しくありません。\n1行目は japanese,present,present_participle,past,past_participle としてください。\n\n読み取ったヘッダー:\n" + headers.join(", "));
                        return;
                    }

                    const cleanedData = results.data.map(row => {
                        const newRow = {};
                        for (let key in row) {
                            const cleanKey = key.replace(/^\uFEFF/, '').trim();
                            newRow[cleanKey] = row[key];
                        }
                        return newRow;
                    });

                    verbsData = cleanedData;
                    document.getElementById('total-questions').textContent = verbsData.length;
                }
            });
        });
    }

    // Start Button
    document.getElementById('btn-start').addEventListener('click', () => {
        if (verbsData.length === 0) {
            alert("CSVデータがありません。");
            return;
        }
        
        let count = parseInt(document.getElementById('question-count').value, 10);
        if (isNaN(count) || count < 1) count = 10;
        if (count > verbsData.length) count = verbsData.length;

        // Shuffle and pick
        let shuffled = [...verbsData].sort(() => 0.5 - Math.random());
        activeQuestions = shuffled.slice(0, count);
        
        startDrill();
    });

    // Skip Button
    document.getElementById('btn-skip').addEventListener('click', skipQuestion);

    // Input Events
    inputs.forEach((input, index) => {
        input.addEventListener('input', () => {
            checkCurrentInput(index);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitInput(index);
            }
        });
        
        input.addEventListener('blur', () => {
            if (input.value.trim() !== '' && !input.classList.contains('correct')) {
                showDiff(index);
            }
        });
    });

    // Result Screen Buttons
    document.getElementById('btn-retry-mistakes').addEventListener('click', () => {
        activeQuestions = [...mistakes];
        startDrill();
    });

    document.getElementById('btn-back-home').addEventListener('click', () => {
        showScreen('screen-setup');
    });
}

function showScreen(screenId) {
    document.getElementById('screen-setup').style.display = 'none';
    document.getElementById('screen-drill').style.display = 'none';
    document.getElementById('screen-result').style.display = 'none';
    document.getElementById(screenId).style.display = 'block';
}

function startDrill() {
    mistakes = [];
    currentQuestionIndex = 0;
    showScreen('screen-drill');
    loadNextQuestion();
}

function loadNextQuestion() {
    if (currentQuestionIndex >= activeQuestions.length) {
        showResult();
        return;
    }

    currentVerb = activeQuestions[currentQuestionIndex];
    madeMistakeOnCurrent = false;
    
    document.getElementById('japanese-word').textContent = currentVerb.japanese;
    document.getElementById('question-progress').textContent = `問題 ${currentQuestionIndex + 1} / ${activeQuestions.length}`;

    // 進捗バッジ（共通関数）
    const badgeArea = document.getElementById('progress-info-area');
    if (badgeArea && currentVerb.item_id && _hasProgressManager()) {
        badgeArea.innerHTML = ProgressManager.getProgressBadgeHtml(currentVerb.item_id);
    }
    
    // Reset UI
    inputs.forEach(input => {
        input.value = '';
        input.className = '';
        input.disabled = false;
        document.getElementById(`feedback-${input.id.replace('input-', '')}`).innerHTML = '';
    });
    
    inputs[0].focus();
}

function checkCurrentInput(index) {
    const input = inputs[index];
    const key = keys[index];
    const answer = currentVerb[key];
    
    if (input.value.trim().toLowerCase() === answer.toLowerCase()) {
        input.classList.add('correct');
        input.classList.remove('error');
        document.getElementById(`feedback-${key}`).innerHTML = '';
        
        checkAllCorrect();
    } else {
        input.classList.remove('correct');
    }
}

function submitInput(index) {
    const input = inputs[index];
    const key = keys[index];
    const answer = currentVerb[key];
    const value = input.value.trim().toLowerCase();
    
    if (value === answer.toLowerCase()) {
        // Move to next input if available
        if (index < inputs.length - 1) {
            inputs[index + 1].focus();
        }
    } else {
        // Wrong
        input.classList.add('error');
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 300);
        showDiff(index);
        
        recordMistake();
    }
}

function recordMistake() {
    if (!madeMistakeOnCurrent) {
        madeMistakeOnCurrent = true;
        mistakes.push(currentVerb);
        if (window.ProgressManager) {
            ProgressManager.update(currentVerb.item_id, false, 'verb-drill');
        }
    }
}

function showDiff(index) {
    const input = inputs[index];
    const key = keys[index];
    const answer = currentVerb[key];
    const value = input.value.trim().toLowerCase();
    const feedbackDiv = document.getElementById(`feedback-${key}`);
    
    if (value === '') return;
    
    const diffs = dmp.diff_main(value, answer);
    dmp.diff_cleanupSemantic(diffs);
    
    let html = '';
    diffs.forEach(part => {
        const op = part[0];    // Operation (insert, delete, equal)
        const text = part[1];  // Text of change
        
        if (op === 1) { // Insert (Missing in user input)
            html += `<span class="diff-incorrect">${text}</span>`;
        } else if (op === 0) { // Equal
            html += `<span class="diff-correct">${text}</span>`;
        }
    });
    
    feedbackDiv.innerHTML = `Hint: ${html}`;
}

function checkAllCorrect() {
    const allCorrect = inputs.every(input => input.classList.contains('correct'));
    
    if (allCorrect) {
        inputs.forEach(input => input.disabled = true);

        // 正解時に進捗を更新（間違えがなかった場合のみ）
        if (window.ProgressManager && !madeMistakeOnCurrent && currentVerb.item_id) {
            ProgressManager.update(currentVerb.item_id, true, 'verb-drill');
        }
        
        speakWords([
            currentVerb.present,
            currentVerb.present_participle,
            currentVerb.past,
            currentVerb.past_participle
        ]);
        
        currentQuestionIndex++;
        setTimeout(loadNextQuestion, 1200);
    }
}

function skipQuestion() {
    recordMistake();
    
    inputs.forEach((input, index) => {
        const key = keys[index];
        input.value = currentVerb[key];
        input.classList.add('correct');
        input.classList.remove('error');
        document.getElementById(`feedback-${key}`).innerHTML = '';
        input.disabled = true;
    });
    
    speakWords([
        currentVerb.present,
        currentVerb.present_participle,
        currentVerb.past,
        currentVerb.past_participle
    ]);
    
    currentQuestionIndex++;
    setTimeout(loadNextQuestion, 2000);
}

function speakWords(words) {
    if (!window.speechSynthesis) return;
    
    const validWords = words.filter(w => w);
    if (validWords.length === 0) return;

    let text = validWords.join(', ');
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    
    window.speechSynthesis.speak(utterance);
}

function showResult() {
    showScreen('screen-result');
    
    const correctCount = activeQuestions.length - mistakes.length;
    document.getElementById('score-correct').textContent = correctCount;
    document.getElementById('score-total').textContent = activeQuestions.length;
    
    const mistakesContainer = document.getElementById('mistakes-container');
    const mistakesList = document.getElementById('mistakes-list');
    const retryBtn = document.getElementById('btn-retry-mistakes');
    
    if (mistakes.length > 0) {
        mistakesContainer.style.display = 'block';
        retryBtn.style.display = 'inline-block';
        
        mistakesList.innerHTML = '';
        mistakes.forEach(verb => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="jp">${verb.japanese}</span>
                ${verb.present} - ${verb.present_participle} - ${verb.past} - ${verb.past_participle}
            `;
            mistakesList.appendChild(li);
        });
    } else {
        mistakesContainer.style.display = 'none';
        retryBtn.style.display = 'none';
    }
}

// ── 進捗ロード＆初期化 ──
async function loadProgressOnInit() {
    if (_hasProgressManager()) {
        await ProgressManager.initProgress('progress-loaded-indicator', () => updateDashboardButtonVisibility());
    }
}

// ── 手動ファイル操作 ──
function loadProgressFromFile() {
    if (_hasProgressManager()) ProgressManager.loadProgressFromFile('progress-loaded-indicator', () => updateDashboardButtonVisibility());
}

async function exportProgressCSVManual() {
    if (_hasProgressManager()) await ProgressManager.saveToFile(false, () => ProgressManager.showSaveToast());
}

async function clearProgressData() {
    if (_hasProgressManager()) await ProgressManager.clearProgressData('progress-loaded-indicator', () => updateDashboardButtonVisibility());
}

// ── ダッシュボード機能 ──
let masteryChartInstance = null;

function updateDashboardButtonVisibility() {
    const btn = document.getElementById('dashboard-btn');
    if (!btn) return;
    const pData = ProgressManager.getData();
    if (Object.keys(pData).length > 0) {
        btn.style.display = 'inline-block';
    } else {
        btn.style.display = 'none';
    }
}

function showDashboard() {
    if (typeof Chart === 'undefined') {
        alert('グラフ描画ライブラリを読み込み中です。少々お待ちください。');
        return;
    }
    
    document.getElementById('dashboard-modal').style.display = 'flex';
    
    const lastDateEl = document.getElementById('last-learning-date');
    const lastPlayedStr = localStorage.getItem('EnglishHubLastActivity_verb-drill') || localStorage.getItem('TripleEchoLastPlayed');
    if (lastPlayedStr) {
        const d = new Date(lastPlayedStr);
        lastDateEl.textContent = '直近の学習: ' + d.toLocaleDateString('ja-JP') + ' ' + d.toLocaleTimeString('ja-JP', { hour12: false });
    } else {
        lastDateEl.textContent = '直近の学習: 記録なし';
    }
    
    const pData = ProgressManager.getData();
    const masteryCtx = document.getElementById('mastery-chart').getContext('2d');
    
    if (masteryChartInstance) masteryChartInstance.destroy();

    let mastered = 0;
    let learning = 0;
    let struggling = 0;
    let unanswered = 0;
    
    (verbsData || []).forEach(q => {
        const p = pData[q.item_id];
        if (p && p.totalCount > 0) {
            if (p.streak >= 3) mastered++;
            else if (p.streak < 0) struggling++;
            else learning++;
        } else {
            unanswered++;
        }
    });
    
    masteryChartInstance = new Chart(masteryCtx, {
        type: 'doughnut',
        data: {
            labels: ['マスター済 (3連続正解以上)', '学習中 (0〜2回)', '苦手 (連続不正解)', '未学習'],
            datasets: [{
                data: [mastered, learning, struggling, unanswered],
                backgroundColor: ['#4ade80', '#fbbf24', '#f87171', '#4b5563'],
                borderWidth: 2,
                borderColor: '#2a2f3a'
            }]
        },
        plugins: [ChartDataLabels],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { color: '#e2e8f0' }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 14 },
                    formatter: (value, ctx) => {
                        let sum = 0;
                        let dataArr = ctx.chart.data.datasets[0].data;
                        dataArr.forEach(data => { sum += data; });
                        if (sum === 0 || value === 0) return null;
                        let percentage = (value * 100 / sum).toFixed(1) + '%';
                        return percentage;
                    }
                }
            }
        }
    });
}

function closeDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
}
