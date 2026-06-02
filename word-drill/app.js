let wordsData = [];
let activeQuestions = [];
let mistakes = [];
let currentWord = null;
let currentQuestionIndex = 0;
let inputAnswer;
let answerInputs = [];
let madeMistakeOnCurrent = false;
let isAnswerRevealed = false;

// ── 中断・再開用のキー ──
const SUSPEND_KEY = 'word_drill_suspend';
let progressFileHandle = null;

// We assume diff_match_patch is loaded globally via CDN
const dmp = new diff_match_patch();

function populateVoices() {
    const voiceSelect = document.getElementById('voice-select');
    if (!voiceSelect || !window.speechSynthesis) return;
    
    const enVoices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en-US'));
    voiceSelect.innerHTML = '<option value="random">ランダム (US)</option>';
    
    enVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        
        let chara = '';
        const knownChars = {
            'Microsoft David': '男性、少し低め',
            'Microsoft Zira': '女性、標準的',
            'Microsoft Mark': '男性、少し高め',
            'Google US English': '女性、標準的',
            'Google UK English Female': '女性、イギリス',
            'Google UK English Male': '男性、イギリス',
            'Aria': '女性、クリアで自然',
            'Guy': '男性、落ち着いた・自然',
            'Jenny': '女性、明るい・自然',
            'Ana': '子供(女の子)',
            'Christopher': '男性、自然',
            'Eric': '男性、標準的',
            'Michelle': '女性、少し低め',
            'Roger': '男性、少し高め',
            'Steffan': '男性、標準的',
            'Ava': '女性、自然',
            'Andrew': '男性、自然',
            'Brian': '男性、自然',
            'Emma': '女性、自然',
            'Natasha': '女性、自然',
            'William': '男性、自然',
            'Cora': '女性、自然',
            'Elizabeth': '女性、自然',
            'Ryan': '男性、自然',
            'Sonia': '女性、自然',
            'Ashley': '女性、自然',
            'Libby': '女性、自然',
            'Liam': '男性、自然',
            'Luke': '男性、自然',
            'Sam': '男性、自然',
            'Thomas': '男性、自然',
            'George': '男性、イギリス',
            'Hazel': '女性、イギリス',
            'Susan': '女性、イギリス'
        };
        for (const [key, value] of Object.entries(knownChars)) {
            if (voice.name.includes(key)) {
                chara = value;
                break;
            }
        }
        if (!chara) {
            chara = voice.localService ? 'ローカル' : 'オンライン';
        }
        
        option.textContent = `${voice.name} (${chara})`;
        voiceSelect.appendChild(option);
    });
}

if (window.speechSynthesis) {
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = populateVoices;
    }
    setTimeout(populateVoices, 100);
}

document.addEventListener('DOMContentLoaded', async () => {
    inputAnswer = document.getElementById('input-answer');
    setupEventListeners();
    
    // 進捗データのロード
    await loadProgressOnInit();
    checkSuspendData();

    // Default CSV file path
    Papa.parse('../english-questions/TRIPLE-ECHO/中学生/英単語.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.data && results.data.length > 0) {
                // Remove BOM from keys if present and filter
                const cleanedData = cleanCSVData(results.data);
                wordsData = cleanedData.filter(row => row.format_type === '英単語');
                if (wordsData.length === 0) wordsData = cleanedData; // fallback
                
                updateUnitCheckboxes(wordsData);
                document.getElementById('file-name-display').textContent = '英単語.csv (デフォルト)';
            } else {
                document.getElementById('total-questions').textContent = '0';
            }
        },
        error: function() {
            document.getElementById('total-questions').textContent = 'ファイル未選択';
            document.getElementById('file-name-display').textContent = 'CSVを選択してください';
        }
    });
});

function cleanCSVData(data) {
    return data.map(row => {
        const newRow = {};
        for (let key in row) {
            const cleanKey = key.replace(/^\uFEFF/, '').trim();
            newRow[cleanKey] = row[key];
        }
        return newRow;
    });
}

function updateUnitCheckboxes(data) {
    const container = document.getElementById('unit-checkboxes');
    if (!container) return;
    container.innerHTML = '';
    
    const units = new Set();
    data.forEach(row => {
        if (row.unit_category) {
            units.add(row.unit_category.trim());
        }
    });
    
    [...units].sort().forEach(unit => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = unit;
        cb.checked = true; // default to checked
        
        cb.addEventListener('change', updateQuestionCount);
        
        const span = document.createElement('span');
        span.textContent = unit;
        
        label.appendChild(cb);
        label.appendChild(span);
        container.appendChild(label);
    });
    
    updateQuestionCount();
}

function updateQuestionCount() {
    if (!wordsData) return;
    const checkedBoxes = document.querySelectorAll('#unit-checkboxes input[type="checkbox"]:checked');
    const selectedUnits = Array.from(checkedBoxes).map(cb => cb.value);
    
    let count = 0;
    if (selectedUnits.length > 0) {
        count = wordsData.filter(row => {
            return selectedUnits.includes(row.unit_category?.trim());
        }).length;
    }
    document.getElementById('total-questions').textContent = count;
}

function setupEventListeners() {
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
                    
                    const cleanedData = cleanCSVData(results.data);
                    const firstRow = cleanedData[0];
                    const headers = Object.keys(firstRow);
                    const hasQuestion = headers.some(h => h.includes('question_text'));
                    const hasAnswer = headers.some(h => h.includes('correct_answer'));

                    if (!hasQuestion || !hasAnswer) {
                        alert("エラー: CSVのヘッダーが正しくありません。\n必須カラム: question_text, correct_answer\n\n読み取ったヘッダー:\n" + headers.join(", "));
                        return;
                    }

                    if (cleanedData[0].format_type) {
                        wordsData = cleanedData.filter(r => r.format_type === '英単語');
                        if (wordsData.length === 0) wordsData = cleanedData;
                    } else {
                        wordsData = cleanedData;
                    }
                    
                    updateUnitCheckboxes(wordsData);
                }
            });
        });
    }

    const btnSelectAll = document.getElementById('btn-select-all-units');
    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            document.querySelectorAll('#unit-checkboxes input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
            });
            updateQuestionCount();
        });
    }

    const btnDeselectAll = document.getElementById('btn-deselect-all-units');
    if (btnDeselectAll) {
        btnDeselectAll.addEventListener('click', () => {
            document.querySelectorAll('#unit-checkboxes input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            updateQuestionCount();
        });
    }

    document.getElementById('btn-start').addEventListener('click', () => {
        if (wordsData.length === 0) {
            alert("CSVデータがありません。");
            return;
        }
        
        let filteredData = wordsData;
        const checkedBoxes = document.querySelectorAll('#unit-checkboxes input[type="checkbox"]:checked');
        const selectedUnits = Array.from(checkedBoxes).map(cb => cb.value);
        
        if (selectedUnits.length === 0) {
            alert("単元を1つ以上選択してください。");
            return;
        }
        
        filteredData = wordsData.filter(row => {
            return selectedUnits.includes(row.unit_category?.trim());
        });
        
        if (filteredData.length === 0) {
            alert("選択した単元のデータがありません。");
            return;
        }
        
        let count = parseInt(document.getElementById('question-count').value, 10);
        if (isNaN(count) || count < 1) count = filteredData.length;
        if (count > filteredData.length) count = filteredData.length;

        const pData = ProgressManager.getData();
        if (Object.keys(pData).length > 0) {
            activeQuestions = ProgressManager.weightedSample(filteredData, count, pData, 'item_id');
        } else {
            let shuffled = [...filteredData].sort(() => 0.5 - Math.random());
            activeQuestions = shuffled.slice(0, count);
        }
        
        startDrill();
    });

    document.getElementById('btn-skip').addEventListener('click', skipQuestion);
    document.getElementById('btn-next').addEventListener('click', () => {
        currentQuestionIndex++;
        loadNextQuestion();
    });


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

    currentWord = activeQuestions[currentQuestionIndex];
    madeMistakeOnCurrent = false;
    isAnswerRevealed = false;
    
    const qText = currentWord.question_text || '';
    const lastOpenParen = Math.max(qText.lastIndexOf('('), qText.lastIndexOf('（'));
    if (lastOpenParen !== -1) {
        const engText = qText.substring(0, lastOpenParen).trim();
        const jpnText = qText.substring(lastOpenParen).trim();
        document.getElementById('question-text').innerHTML = `
            <div class="eng-sentence">${engText}</div>
            <div class="jpn-sentence">${jpnText}</div>
        `;
    } else {
        document.getElementById('question-text').textContent = qText;
    }
    document.getElementById('question-progress').textContent = `問題 ${currentQuestionIndex + 1} / ${activeQuestions.length}`;
    
    const tagsDiv = document.getElementById('question-tags');
    tagsDiv.innerHTML = '';
    
    if (currentWord.item_id) {
        const span = document.createElement('span');
        span.className = 'tag item-id-tag';
        span.style.background = '#f1f5f9';
        span.style.color = '#475569';
        span.style.border = '1px solid #cbd5e1';
        span.textContent = currentWord.item_id;
        tagsDiv.appendChild(span);
    }
    
    if (currentWord.unit_category) {
        const span = document.createElement('span');
        span.className = 'tag unit-tag';
        span.textContent = currentWord.unit_category;
        tagsDiv.appendChild(span);
    }

    // 進捗バッジ（共通関数）
    const progressBadgeArea = document.getElementById('progress-badge-area');
    if (progressBadgeArea && currentWord.item_id) {
        progressBadgeArea.innerHTML = ProgressManager.getProgressBadgeHtml(currentWord.item_id);
    }
    
    const container = document.getElementById('inputs-container');
    container.innerHTML = '';

    const blankCount = (qText.match(/\(\s*\)|（\s*）/g) || []).length;
    const answer = currentWord.correct_answer || '';
    const answerParts = answer.split('/').map(s => s.trim());
    
    let isMultiInput = false;
    let targetAnswers = [answer];
    
    if (blankCount > 1 && answerParts.length === blankCount) {
        isMultiInput = true;
        targetAnswers = answerParts;
    }
    
    if (isMultiInput) {
        container.style.gridTemplateColumns = `repeat(${blankCount}, 1fr)`;
        container.style.maxWidth = `${Math.min(blankCount * 220, 700)}px`;
    } else {
        container.style.gridTemplateColumns = '1fr';
        container.style.maxWidth = '440px';
    }
    
    answerInputs = [];
    
    targetAnswers.forEach((ansPart, idx) => {
        const group = document.createElement('div');
        group.className = 'input-group';
        
        const label = document.createElement('label');
        label.textContent = isMultiInput ? `Word ${idx + 1}` : 'Answer';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.id = isMultiInput ? `input-answer-${idx}` : 'input-answer';
        
        const feedback = document.createElement('div');
        feedback.className = 'feedback';
        feedback.id = isMultiInput ? `feedback-answer-${idx}` : 'feedback-answer';
        
        group.appendChild(label);
        group.appendChild(input);
        group.appendChild(feedback);
        container.appendChild(group);
        
        answerInputs.push(input);
    });
    
    inputAnswer = answerInputs[0];
    
    // Attach event listeners dynamically to each input
    answerInputs.forEach((input, idx) => {
        input.addEventListener('input', () => {
            if (isAnswerRevealed) return;
            
            const val = input.value.trim().toLowerCase();
            const expected = targetAnswers[idx].toLowerCase();
            
            if (val === expected) {
                input.classList.add('correct');
                input.classList.remove('error');
                const feedbackId = isMultiInput ? `feedback-answer-${idx}` : 'feedback-answer';
                document.getElementById(feedbackId).innerHTML = '';
                
                // Auto focus next input if there is one
                if (idx + 1 < answerInputs.length) {
                    answerInputs[idx + 1].focus();
                }
            } else {
                input.classList.remove('correct');
            }
            
            // Check if all inputs are correct
            const allCorrect = answerInputs.every((inp, i) => inp.value.trim().toLowerCase() === targetAnswers[i].toLowerCase());
            if (allCorrect) {
                handleCorrect();
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (isAnswerRevealed) {
                    document.getElementById('btn-next').click();
                    return;
                }
                
                const val = input.value.trim().toLowerCase();
                const expected = targetAnswers[idx].toLowerCase();
                
                if (val === expected) {
                    input.classList.add('correct');
                    input.classList.remove('error');
                    // Focus next
                    if (idx + 1 < answerInputs.length) {
                        answerInputs[idx + 1].focus();
                    } else {
                        // Check if all are correct
                        const allCorrect = answerInputs.every((inp, i) => inp.value.trim().toLowerCase() === targetAnswers[i].toLowerCase());
                        if (allCorrect) {
                            handleCorrect();
                        }
                    }
                } else {
                    input.classList.add('error');
                    input.classList.add('shake');
                    setTimeout(() => input.classList.remove('shake'), 300);
                    
                    const feedbackId = isMultiInput ? `feedback-answer-${idx}` : 'feedback-answer';
                    showDiffForInput(input, targetAnswers[idx], document.getElementById(feedbackId));
                    recordMistake();
                }
            }
        });
        
        input.addEventListener('blur', () => {
            if (isAnswerRevealed) return;
            const val = input.value.trim().toLowerCase();
            const expected = targetAnswers[idx].toLowerCase();
            if (val !== '' && val !== expected) {
                const feedbackId = isMultiInput ? `feedback-answer-${idx}` : 'feedback-answer';
                showDiffForInput(input, targetAnswers[idx], document.getElementById(feedbackId));
            }
        });
    });
    
    const explContainer = document.getElementById('explanation-container');
    if (explContainer) {
        explContainer.classList.remove('revealed');
    }
    const placeholder = document.getElementById('explanation-placeholder');
    if (placeholder) {
        placeholder.style.display = 'flex';
    }
    const content = document.getElementById('explanation-content');
    if (content) {
        content.style.display = 'none';
    }
    
    document.getElementById('btn-skip').style.display = 'inline-block';
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('drill-controls').style.display = 'block';
    
    const playBtnsContainer = document.getElementById('play-buttons-container');
    if (playBtnsContainer) playBtnsContainer.innerHTML = '';
    
    inputAnswer.focus();
}

function recordMistake() {
    if (!madeMistakeOnCurrent) {
        madeMistakeOnCurrent = true;
        mistakes.push(currentWord);
        if (currentWord.item_id) {
            ProgressManager.update(currentWord.item_id, false);
            logActivity();
        }
    }
}

function showDiffForInput(input, expected, feedbackDiv) {
    const value = input.value.trim();
    if (value === '') return;
    
    const diffs = dmp.diff_main(value.toLowerCase(), expected.toLowerCase());
    dmp.diff_cleanupSemantic(diffs);
    
    let html = '';
    diffs.forEach(part => {
        const op = part[0];
        const text = part[1];
        
        if (op === 1) { 
            html += `<span class="diff-incorrect">${text}</span>`;
        } else if (op === 0) { 
            html += `<span class="diff-correct">${text}</span>`;
        }
    });
    
    feedbackDiv.innerHTML = `Hint: ${html}`;
}

function handleCorrect() {
    answerInputs.forEach(input => {
        input.classList.add('correct');
        input.classList.remove('error');
        input.disabled = true;
    });
    isAnswerRevealed = true;
    
    if (!madeMistakeOnCurrent && currentWord.item_id) {
        ProgressManager.update(currentWord.item_id, true);
        logActivity();
    }
    
    if (currentWord.full_sentence) {
        speakWords(currentWord.full_sentence, 1.0);
    } else {
        speakWords(currentWord.correct_answer.split('/')[0].trim(), 1.0);
    }
    
    showExplanation();
    
    // Auto-advance to next question after 1.0 seconds
    setTimeout(() => {
        currentQuestionIndex++;
        loadNextQuestion();
    }, 1000);
}

function skipQuestion() {
    recordMistake();
    
    const qText = currentWord.question_text || '';
    const blankCount = (qText.match(/\(\s*\)|（\s*）/g) || []).length;
    const answer = currentWord.correct_answer || '';
    const answerParts = answer.split('/').map(s => s.trim());
    
    let isMultiInput = false;
    let targetAnswers = [answer];
    
    if (blankCount > 1 && answerParts.length === blankCount) {
        isMultiInput = true;
        targetAnswers = answerParts;
    }
    
    answerInputs.forEach((input, idx) => {
        input.value = targetAnswers[idx];
        input.classList.add('correct');
        input.classList.remove('error');
        input.disabled = true;
        
        const feedbackId = isMultiInput ? `feedback-answer-${idx}` : 'feedback-answer';
        const fb = document.getElementById(feedbackId);
        if (fb) fb.innerHTML = '';
    });
    
    isAnswerRevealed = true;
    
    if (currentWord.full_sentence) {
        speakWords(currentWord.full_sentence, 1.0);
    } else {
        speakWords(currentWord.correct_answer.split('/')[0].trim(), 1.0);
    }
    
    showExplanation();
}

function showExplanation() {
    const explContainer = document.getElementById('explanation-container');
    const explText = document.getElementById('explanation-text');
    const fullSentText = document.getElementById('full-sentence-text');
    const playBtnsContainer = document.getElementById('play-buttons-container');
    
    if (explContainer) {
        explContainer.classList.add('revealed');
    }
    const placeholder = document.getElementById('explanation-placeholder');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    const content = document.getElementById('explanation-content');
    if (content) {
        content.style.display = 'block';
    }
    
    document.getElementById('btn-skip').style.display = 'none';
    document.getElementById('btn-next').style.display = 'inline-block';
    
    if (currentWord.explanation) {
        explText.textContent = currentWord.explanation;
        explText.style.display = 'block';
    } else {
        explText.style.display = 'none';
    }
    
    if (currentWord.full_sentence) {
        fullSentText.textContent = currentWord.full_sentence;
        fullSentText.style.display = 'block';
    } else {
        fullSentText.style.display = 'none';
    }
    
    if (playBtnsContainer) {
        const textToSpeak = currentWord.full_sentence || currentWord.correct_answer.split('/')[0].trim();
        const escapedText = textToSpeak.replace(/'/g, "\\'");
        playBtnsContainer.innerHTML = `
            <button onclick="speakWords('${escapedText}', 1.0)" class="btn-audio">1.0x</button>
            <button onclick="speakWords('${escapedText}', 0.75)" class="btn-audio">0.75x</button>
            <button onclick="speakWords('${escapedText}', 0.5)" class="btn-audio">0.5x</button>
            <button onclick="speakWords('${escapedText}', 0.25)" class="btn-audio">0.25x</button>
        `;
    }
    
    setTimeout(() => {
        document.getElementById('btn-next').focus();
    }, 100);
}

function speakWords(text, rate = 1.0) {
    if (!window.speechSynthesis) return;
    if (!text) return;

    // stop any ongoing speech before starting a new one
    stopAnyAudio();

    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    
    const voiceSelect = document.getElementById('voice-select');
    if (voiceSelect) {
        const val = voiceSelect.value;
        const enVoices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en-US'));
        if (enVoices.length > 0) {
            if (val === 'random') {
                utterance.voice = enVoices[Math.floor(Math.random() * enVoices.length)];
            } else {
                const idx = parseInt(val, 10);
                if (!isNaN(idx) && enVoices[idx]) {
                    utterance.voice = enVoices[idx];
                }
            }
        }
    }
    
    window.speechSynthesis.speak(utterance);
}

function showResult() {
    showScreen('screen-result');
    
    const correctCount = activeQuestions.length - mistakes.length;
    document.getElementById('score-correct').textContent = correctCount;
    document.getElementById('score-total').textContent = activeQuestions.length;
    
    // 進捗CSVを自動保存（上書き）
    if (ProgressManager.getFileHandle()) {
        ProgressManager.saveToFile(true).catch(() => {});
    }
    
    const mistakesContainer = document.getElementById('mistakes-container');
    const mistakesList = document.getElementById('mistakes-list');
    const retryBtn = document.getElementById('btn-retry-mistakes');
    
    if (mistakes.length > 0) {
        mistakesContainer.style.display = 'block';
        retryBtn.style.display = 'inline-block';
        
        mistakesList.innerHTML = '';
        mistakes.forEach(word => {
            const li = document.createElement('li');
            const qText = word.question_text || '';
            const lastOpenParen = Math.max(qText.lastIndexOf('('), qText.lastIndexOf('（'));
            let displayHtml = '';
            if (lastOpenParen !== -1) {
                const engText = qText.substring(0, lastOpenParen).trim();
                const jpnText = qText.substring(lastOpenParen).trim();
                displayHtml = `
                    <span class="eng-sentence-small" style="font-weight: 700; font-family: 'Outfit', sans-serif; font-size: 1.1rem; color: var(--text-dark); display: block; margin-bottom: 4px; word-break: normal; overflow-wrap: break-word;">${engText}</span>
                    <span class="jp" style="color: var(--text-gray); font-size: 0.9rem; display: block; margin-bottom: 8px; word-break: normal; overflow-wrap: break-word;">${jpnText}</span>
                `;
            } else {
                displayHtml = `<span class="jp" style="word-break: normal; overflow-wrap: break-word;">${qText}</span>`;
            }
            li.innerHTML = `
                ${displayHtml}
                <strong>${word.correct_answer}</strong>
                <div class="mistake-expl">${word.explanation || ''}</div>
            `;
            mistakesList.appendChild(li);
        });
    } else {
        mistakesContainer.style.display = 'none';
        retryBtn.style.display = 'none';
    }
}

// ── 音声停止 ──
function stopAnyAudio() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

// ── Hub連携 ──
function logActivity() {
    if (typeof logHubActivity === 'function') {
        logHubActivity('word-drill');
    }
}

// ── 進捗ロード＆初期化 ──
async function loadProgressOnInit() {
    await ProgressManager.initProgress('progress-loaded-indicator', () => updateDashboardButtonVisibility());
}

// ── 手動ファイル操作 ──
function loadProgressFromFile() {
    ProgressManager.loadProgressFromFile('progress-loaded-indicator', () => updateDashboardButtonVisibility());
}

async function exportProgressCSVManual() {
    await ProgressManager.saveToFile(false, () => ProgressManager.showSaveToast());
}

async function clearProgressData() {
    await ProgressManager.clearProgressData('progress-loaded-indicator', () => updateDashboardButtonVisibility());
}

// ── 中断・再開機能 ──
function checkSuspendData() {
    const resumeCard = document.getElementById('resume-card');
    if (!resumeCard) return;
    const raw = localStorage.getItem(SUSPEND_KEY);
    if (!raw) {
        resumeCard.style.display = 'none';
        return;
    }
    try {
        const data = JSON.parse(raw);
        const detail = document.getElementById('resume-card-detail');
        const savedDate = new Date(data.savedAt);
        const dateStr = savedDate.toLocaleDateString('ja-JP') + ' ' + savedDate.toLocaleTimeString('ja-JP', { hour12: false });
        detail.innerHTML = `保存日時: ${dateStr}<br>進捗: ${data.currentIndex}問済み / 全${data.totalQuestions}問<br>正解: ${data.correctCount}問`;
        resumeCard.style.display = 'block';
    } catch (e) {
        console.error(e);
        localStorage.removeItem(SUSPEND_KEY);
        resumeCard.style.display = 'none';
    }
}

function suspendQuiz() {
    stopAnyAudio();
    const suspendData = {
        activeQuestions: activeQuestions,
        currentIndex: currentQuestionIndex,
        correctCount: (activeQuestions.length - mistakes.length),
        totalQuestions: activeQuestions.length,
        mistakes: mistakes,
        savedAt: new Date().toISOString()
    };
    try {
        localStorage.setItem(SUSPEND_KEY, JSON.stringify(suspendData));
    } catch (e) {
        alert('保存に失敗しました。');
        return;
    }
    if (ProgressManager.getFileHandle()) {
        ProgressManager.saveToFile(true).catch(() => {});
    }
    showScreen('screen-setup');
    checkSuspendData();
}

function resumeQuiz() {
    const raw = localStorage.getItem(SUSPEND_KEY);
    if (!raw) {
        alert('中断データがありません。');
        return;
    }
    try {
        const data = JSON.parse(raw);
        activeQuestions = data.activeQuestions;
        currentQuestionIndex = data.currentIndex;
        mistakes = data.mistakes || [];
        
        localStorage.removeItem(SUSPEND_KEY);
        checkSuspendData();
        
        showScreen('screen-drill');
        loadNextQuestion();
    } catch (e) {
        console.error(e);
        alert('データの復元に失敗しました。');
        localStorage.removeItem(SUSPEND_KEY);
        checkSuspendData();
    }
}

function deleteSuspendData() {
    if (!confirm('中断データを削除しますか？')) return;
    localStorage.removeItem(SUSPEND_KEY);
    checkSuspendData();
}

// ── ダッシュボード機能 ──
let masteryChartInstance = null;
let accuracyChartInstance = null;

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
        alert('グラフを読み込み中です。');
        return;
    }
    document.getElementById('dashboard-modal').style.display = 'flex';
    
    // 直近学習日 (HubCore から取得、なければTripleEchoなどを参照)
    const lastDateEl = document.getElementById('last-learning-date');
    const lastPlayedStr = localStorage.getItem('EnglishHubLastActivity_word-drill') || localStorage.getItem('TripleEchoLastPlayed');
    if (lastPlayedStr) {
        const d = new Date(lastPlayedStr);
        lastDateEl.textContent = '直近の学習: ' + d.toLocaleDateString('ja-JP') + ' ' + d.toLocaleTimeString('ja-JP', { hour12: false });
    } else {
        lastDateEl.textContent = '直近の学習: 記録なし';
    }
    
    const pData = ProgressManager.getData();
    let mastered = 0, learning = 0, struggling = 0;
    Object.values(pData).forEach(p => {
        if (p.streak >= 3) mastered++;
        else if (p.streak < 0) struggling++;
        else learning++;
    });
    
    const masteryCtx = document.getElementById('mastery-chart').getContext('2d');
    if (masteryChartInstance) masteryChartInstance.destroy();
    masteryChartInstance = new Chart(masteryCtx, {
        type: 'doughnut',
        data: {
            labels: ['マスター済 (3連続正解)', '学習中 (0〜2回)', '苦手 (連続不正解)'],
            datasets: [{
                data: [mastered, learning, struggling],
                backgroundColor: ['#34d399', '#fcd34d', '#f87171'],
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
                    color: '#fff', font: { weight: 'bold', size: 14 },
                    formatter: (value, ctx) => {
                        const sum = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b, 0);
                        if (sum === 0 || value === 0) return null;
                        return (value * 100 / sum).toFixed(1) + '%';
                    }
                }
            }
        }
    });
    
    // 品詞別の正答率
    const formatStats = {};
    if (wordsData) {
        wordsData.forEach(q => {
            const fmt = q.part_of_speech || 'その他';
            if (!formatStats[fmt]) formatStats[fmt] = { correct: 0, total: 0 };
            const p = pData[q.item_id];
            if (p && p.totalCount > 0) {
                formatStats[fmt].correct += p.correctCount;
                formatStats[fmt].total += p.totalCount;
            }
        });
    }
    
    const labels = [];
    const accuracies = [];
    Object.entries(formatStats).forEach(([fmt, stats]) => {
        if (stats.total > 0) {
            labels.push(fmt);
            accuracies.push(Math.round((stats.correct / stats.total) * 100));
        }
    });
    
    const accuracyCtx = document.getElementById('accuracy-chart').getContext('2d');
    if (accuracyChartInstance) accuracyChartInstance.destroy();
    accuracyChartInstance = new Chart(accuracyCtx, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['データなし'],
            datasets: [{
                label: '正解率 (%)',
                data: accuracies.length > 0 ? accuracies : [0],
                backgroundColor: '#60a5fa',
                borderRadius: 4
            }]
        },
        plugins: [ChartDataLabels],
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 100 } },
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'top', color: '#60a5fa',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value) => value + '%'
                }
            }
        }
    });
}

function closeDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
}

// ── 重み付きサンプリング（苦手優先） ──
// weightedSample は ProgressManager.weightedSample(q, n, pData, 'item_id') を使用
