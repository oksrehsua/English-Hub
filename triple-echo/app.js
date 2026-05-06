let allQuestions = [];
let currentQuestions = [];
let currentIndex = 0;
let correctCount = 0;
let mistakes = [];
let isReviewMode = false;
let isListeningMode = false;
let isDictationMode = false;
let loadedFileName = '';
let activePlayback = { type: null, rate: null, btn: null, timeoutId: null, currentCount: 0, text: '', autoNext: false, onRepeat: null };

let globalAudioCtx = null;
let isAudioUnlocked = false;

function initGlobalAudio() {
    if (!isAudioUnlocked) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            try {
                globalAudioCtx = new AudioContext();
            } catch (e) {
                console.error("AudioContext creation failed", e);
            }
        }
        isAudioUnlocked = true;
    }
    if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume().catch(() => {});
    }
}

const appAreaOriginalHTML = `
    <div id="progress"></div>
    <div class="badge-container" style="margin-bottom: 12px;">
        <span id="item-id-badge" class="badge item-id-badge"></span>
        <span id="format-badge" class="badge format-badge"></span>
        <span id="level-badge" class="badge level-badge"></span>
        <span id="unit-category-badge" class="badge unit-category-badge" style="display: none;"></span>
    </div>
    <h3 id="question-text"></h3>
    <div id="input-area"></div>
    <button id="check-btn" onclick="checkAnswer()">解答する</button>
    <div id="result-message" class="result-message"></div>
    <div id="explanation-area" class="explanation"></div>
    <button id="next-btn" onclick="nextQuestion()" style="display: none;">次の問題へ</button>
    <div style="margin-top: 40px; border-top: 2px dashed #000; padding-top: 20px;">
        <button onclick="resetToSetup()" class="secondary-btn">ファイル選択に戻る</button>
    </div>
`;

window.addEventListener('DOMContentLoaded', () => {
    const savedMistakes = localStorage.getItem('english_quiz_mistakes');
    if (savedMistakes) {
        mistakes = JSON.parse(savedMistakes);
        if (mistakes.length > 0) {
            document.getElementById('review-area').style.display = 'block';
            document.getElementById('review-btn').textContent = `間違えた問題に再挑戦する (${mistakes.length}問)`;
        }
    }

    const csvFileInput = document.getElementById('csv-file');
    const directoryInput = document.getElementById('directory-input');

    if (csvFileInput) {
        csvFileInput.addEventListener('change', (e) => {
            handleFileSelect(e.target.files);
            e.target.value = ''; // 同じファイルを再度選択してもchangeイベントが走るようにリセット
        });
    }
    if (directoryInput) {
        directoryInput.addEventListener('change', (e) => {
            handleFileSelect(e.target.files);
            e.target.value = ''; // 同上
        });
    }
});

async function handleFileSelect(files) {
    if (!files || files.length === 0) return;

    const csvFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.csv'));
    if (csvFiles.length === 0) {
        alert('CSVファイルが見つかりませんでした。');
        return;
    }

    const totalSize = csvFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    if (totalSize > 1024 * 1024) {
        const ok = confirm(`合計 ${csvFiles.length} 個・${totalSizeMB} MB のCSVを読み込みます。\n読み込みに少し時間がかかる可能性がありますが、続けますか？`);
        if (!ok) return;
    }

    const loadingStatus = document.getElementById('loading-status');
    const indicator = document.getElementById('loaded-file-indicator');
    if (loadingStatus) {
        loadingStatus.style.display = 'block';
        loadingStatus.textContent = 'ファイルを読み込み中...';
    }

    allQuestions = [];
    let loadedCount = 0;

    for (const file of csvFiles) {
        try {
            const text = await readFileAsText(file);
            const rows = parseCSV(text);

            if (rows.length > 0 && Array.isArray(rows[0])) {
                const firstCell = rows[0][0].replace(/^\ufeff/, '').trim().toLowerCase();
                if (firstCell === 'item_id') {
                    for (let i = 1; i < rows.length; i++) {
                        const r = rows[i];
                        if (r.length < 7) continue;
                        allQuestions.push({
                            id: r[0],
                            category: r[1] || '',
                            level: r[2] || '',
                            format: r[3] || '',
                            text: r[4] || '',
                            answer: r[5] || '',
                            explanation: r[6] || '',
                            fullSentence: r[7] || '',
                            tags: r[8] || '',
                            source: file.name
                        });
                    }
                } else {
                    console.warn(`Skipping ${file.name}: Missing item_id header.`);
                }
            }

            loadedCount++;
            if (loadingStatus) {
                loadingStatus.textContent = `読み込み中... (${loadedCount} / ${csvFiles.length} ファイル完了)`;
            }
        } catch (err) {
            console.error(`Error reading ${file.name}:`, err);
        }
    }

    if (loadingStatus) {
        loadingStatus.style.display = 'none';
    }

    if (allQuestions.length > 0) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ja-JP', { hour12: false });
        loadedFileName = csvFiles.length === 1 ? csvFiles[0].name : `選択フォルダ (${csvFiles.length} 個のCSV)`;
        if (indicator) {
            indicator.textContent = `読み込み済み: ${loadedFileName}（${allQuestions.length}問） - 読み込み完了: ${timeStr}`;
            indicator.style.display = 'block';
        }
        updateFilters();
    } else {
        alert('有効な問題データが見つかりませんでした。CSVの形式を確認してください。');
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

function updateFilters() {
    const tagsSet = new Set();
    const levelSet = new Set();
    const formatSet = new Set();
    const categorySet = new Set();

    allQuestions.forEach(q => {
        if (q.level) levelSet.add(q.level);
        if (q.format) formatSet.add(q.format);
        if (q.category) categorySet.add(q.category);
        if (q.tags) {
            const tags = q.tags.split(',').map(t => t.trim()).filter(Boolean);
            tags.forEach(t => tagsSet.add(t));
        }
    });

    const levelSelect = document.getElementById('level-select');
    if (levelSelect) {
        levelSelect.innerHTML = '<option value="all">すべてのレベル</option>';
        const sortedLevels = Array.from(levelSet).sort((a, b) => {
            const numA = Number(a);
            const numB = Number(b);
            return (!isNaN(numA) && !isNaN(numB)) ? numA - numB : a.localeCompare(b);
        });
        sortedLevels.forEach(lvl => {
            const option = document.createElement('option');
            option.value = lvl;
            option.textContent = !isNaN(Number(lvl)) ? `レベル ${lvl}` : lvl;
            levelSelect.appendChild(option);
        });
    }

    const formatSelect = document.getElementById('format-select');
    if (formatSelect) {
        formatSelect.innerHTML = '<option value="all">すべての形式</option>';
        const sortedFormats = Array.from(formatSet).sort();
        sortedFormats.forEach(fmt => {
            const option = document.createElement('option');
            option.value = fmt;
            option.textContent = fmt;
            formatSelect.appendChild(option);
        });
    }

    const categorySelect = document.getElementById('unit-category-select');
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="all">すべての単元（CSVから取得）</option>';
        const sortedCategories = Array.from(categorySet).sort();
        sortedCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
    }

    const tagSelect = document.getElementById('tag-select');
    if (tagSelect) {
        tagSelect.innerHTML = '<option value="">すべてのタグ（CSVから取得）</option>';
        const sortedTags = Array.from(tagsSet).sort();
        sortedTags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            tagSelect.appendChild(option);
        });
    }
}

function startReviewMode() {
    initGlobalAudio();
    if (mistakes.length === 0) return;
    isReviewMode = true;
    currentQuestions = [...mistakes];
    shuffleArray(currentQuestions);

    document.getElementById('setup-area').style.display = 'none';
    document.getElementById('app-area').style.display = 'block';

    currentIndex = 0;
    correctCount = 0;
    displayQuestion();
}

function resetMistakes() {
    if (confirm('間違えた問題の記録をすべて削除しますか？')) {
        mistakes = [];
        localStorage.removeItem('english_quiz_mistakes');
        document.getElementById('review-area').style.display = 'none';
    }
}

function resetToSetup() {
    stopAnyAudio();
    currentQuestions = [];
    const appArea = document.getElementById('app-area');
    appArea.innerHTML = appAreaOriginalHTML;
    appArea.style.display = 'none';
    document.getElementById('setup-area').style.display = 'block';

    if (loadedFileName) {
        const indicator = document.getElementById('loaded-file-indicator');
        if (indicator) {
            indicator.textContent = `読み込み済み: ${loadedFileName}（${allQuestions.length}問）`;
            indicator.style.display = 'block';
        }
    }

    const reviewArea = document.getElementById('review-area');
    const reviewBtn = document.getElementById('review-btn');

    if (mistakes.length > 0) {
        reviewArea.style.display = 'block';
        reviewBtn.textContent = `間違えた問題に再挑戦する (${mistakes.length}問)`
    } else {
        reviewArea.style.display = 'none';
    }
}

function parseCSV(text) {
    const rows = [];
    let curRow = [];
    let curCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const nextC = text[i + 1];
        if (c === '"' && inQuotes && nextC === '"') {
            curCell += '"';
            i++;
        } else if (c === '"') {
            inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
            curRow.push(curCell);
            curCell = '';
        } else if ((c === '\n' || c === '\r') && !inQuotes) {
            if (c === '\r' && nextC === '\n') i++;
            curRow.push(curCell);
            if (curRow.length > 1) rows.push(curRow);
            curRow = [];
            curCell = '';
        } else {
            curCell += c;
        }
    }

    if (curCell !== '' || curRow.length > 0) {
        curRow.push(curCell);
        rows.push(curRow);
    }

    return rows;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function startQuiz() {
    initGlobalAudio();
    const errorMsg = document.getElementById('setup-error');
    const selectedLevel = document.getElementById('level-select').value;
    const selectedFormat = document.getElementById('format-select').value;
    const selectedCategory = document.getElementById('unit-category-select').value;
    const tagSelectVal = document.getElementById('tag-select').value.trim().toLowerCase();
    const filterTags = tagSelectVal ? [tagSelectVal] : [];

    if (allQuestions.length === 0) {
        errorMsg.textContent = 'CSVファイルを選択、またはフォルダを読み込んでください。';
        errorMsg.style.display = 'inline-block';
        return;
    }

    errorMsg.style.display = 'none';
    startQuizWithQuestions(selectedLevel, selectedFormat, selectedCategory, filterTags);
}

function startQuizWithQuestions(selectedLevel, selectedFormat, selectedCategory, filterTags) {
    const errorMsg = document.getElementById('setup-error');

    currentQuestions = allQuestions.filter(q => {
        const levelMatch = selectedLevel === 'all' || q.level === selectedLevel;
        const formatMatch = selectedFormat === 'all' || q.format === selectedFormat;
        const categoryMatch = selectedCategory === 'all' || q.category === selectedCategory;
        let tagMatch = true;
        if (filterTags.length > 0) {
            const lowerQTags = q.tags.toLowerCase();
            tagMatch = filterTags.every(t => lowerQTags.includes(t));
        }
        return levelMatch && formatMatch && categoryMatch && tagMatch;
    });

    if (currentQuestions.length === 0) {
        errorMsg.textContent = '該当する条件の問題がありません。';
        errorMsg.style.display = 'inline-block';
        return;
    }

    shuffleArray(currentQuestions);

    const countInputVal = document.getElementById('count-input').value;
    if (countInputVal.trim() !== '') {
        const count = parseInt(countInputVal, 10);
        if (!isNaN(count) && count > 0) {
            currentQuestions = currentQuestions.slice(0, count);
        }
    }

    document.getElementById('setup-area').style.display = 'none';
    document.getElementById('app-area').style.display = 'block';

    currentIndex = 0;
    correctCount = 0;
    isReviewMode = false;
    isListeningMode = document.getElementById('listening-mode-toggle')?.checked ?? false;
    isDictationMode = document.getElementById('dictation-mode-toggle')?.checked ?? false;
    displayQuestion();
}

function displayQuestion() {
    const q = currentQuestions[currentIndex];

    document.getElementById('progress').textContent = '問題 ' + (currentIndex + 1) + ' / ' + currentQuestions.length;
    document.getElementById('item-id-badge').textContent = q.id || '';
    document.getElementById('format-badge').textContent = q.format;
    document.getElementById('level-badge').textContent = 'レベル ' + q.level;
    const unitBadge = document.getElementById('unit-category-badge');
    if (unitBadge) {
        unitBadge.textContent = q.category ? ('単元: ' + q.category) : '';
        unitBadge.style.display = q.category ? 'inline-block' : 'none';
    }

    document.getElementById('result-message').textContent = '';
    document.getElementById('explanation-area').style.display = 'none';
    const checkBtn = document.getElementById('check-btn');
    checkBtn.textContent = '解答する';
    checkBtn.style.display = 'inline-block';
    document.getElementById('next-btn').style.display = 'none';

    const qTextEl = document.getElementById('question-text');
    const inputArea = document.getElementById('input-area');
    inputArea.innerHTML = '';
    inputArea.style.display = 'block'; // Ensure visible by default
    qTextEl.style.color = 'var(--text)';
    qTextEl.style.fontSize = '';
    qTextEl.style.opacity = '1';

    if (isDictationMode) {
        qTextEl.textContent = 'Listen and Write!';
        qTextEl.style.color = 'var(--primary)';
        qTextEl.style.fontSize = '1.2rem';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'text-answer';
        input.className = 'text-input';
        input.placeholder = '聞こえた英文をタイピング...';
        input.autocomplete = 'off';
        inputArea.appendChild(input);

        const englishText = getEnglishText(q);
        const playBtnsHtml = getPlayButtonsHtml(englishText);
        const playBtnsDiv = document.createElement('div');
        playBtnsDiv.innerHTML = playBtnsHtml;
        inputArea.appendChild(playBtnsDiv);

        setTimeout(() => {
            playAudio(englishText);
        }, 500);

    } else if (isListeningMode) {
        // 再生モード：問題文（空欄あり）を表示し、その下に即座に解答を表示する
        qTextEl.textContent = q.text;

        const englishText = getEnglishText(q);
        const answerSentenceHtml = getAnswerSentenceHtml(q);
        const repeatCount = parseInt(document.getElementById('step-count-input')?.value || 3);

        // 解答エリアを最初は非表示にする (最後の回で表示)
        const resultMsg = document.getElementById('result-message');
        resultMsg.innerHTML = `<div id="listening-answer" class="result-sentence" style="display: none;">Answer: ${answerSentenceHtml}</div>`;

        // 一時停止ボタンを追加
        const stopBtnHtml = `
            <div style="margin-bottom: 20px; text-align: right;">
                <button id="pause-resume-btn" onclick="togglePauseResume()" class="secondary-btn" style="padding: 10px 20px; font-size: 0.9rem; background: var(--accent);">一時停止</button>
            </div>
        `;

        // 解説エリアを表示（再生ボタンのみ、和訳なし）
        const playBtnsHtml = getPlayButtonsHtml(englishText);
        const expArea = document.getElementById('explanation-area');
        expArea.innerHTML = `${stopBtnHtml}<strong style="font-size: 1.1em; color: #e95c8b;">Listening:</strong>${playBtnsHtml}`;
        expArea.style.display = 'block';

        checkBtn.style.display = 'none';
        document.getElementById('next-btn').style.display = 'inline-block';
        inputArea.style.display = 'none';

        // 音声を自動再生
        setTimeout(() => {
            playAudio(englishText, 1.0, repeatCount, null, true, (current, total) => {
                // 最後の回（currentは0始まりなので total-1）で解答を表示
                if (current === total - 1) {
                    const ansDiv = document.getElementById('listening-answer');
                    if (ansDiv) ansDiv.style.display = 'block';
                }
            });
        }, 500);

    } else if (q.format === '選択問題') {
        qTextEl.textContent = q.text;
        const match = q.text.match(/\(\s*(.*?)\s*\)/);
        if (match) {
            const options = match[1].split('/').map(s => s.trim());
            options.forEach(opt => {
                const label = document.createElement('label');
                label.className = 'option-label';
                label.innerHTML = `<input type="radio" name="answer" value="${opt}"> ${opt}`;
                inputArea.appendChild(label);
            });
        }
    } else if (q.format === '穴埋め' || q.format === '英単語') {
        const parts = q.text.split('( )');
        qTextEl.innerHTML = parts.join('<input type="text" class="text-answer inline-input" autocomplete="off">');
    } else if (q.format === '日本語訳') {
        qTextEl.textContent = q.text;
        checkBtn.textContent = '答えを見る';
    } else {
        qTextEl.textContent = q.text;
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'text-answer';
        input.className = 'text-input';
        input.placeholder = 'ここに解答を入力...';
        input.autocomplete = 'off';
        inputArea.appendChild(input);
    }

    setTimeout(() => {
        const firstInput = document.querySelector('input[type="text"]');
        if (firstInput) firstInput.focus();
    }, 10);
}

function getEnglishText(q) {
    if (q.fullSentence && q.fullSentence.trim().length > 0) {
        return q.fullSentence.trim();
    }
    const choiceRegex = /\([^)]*?\/[^)]*?\)/g;
    const blankCount = (q.text.match(/\(\s*\)/g) || []).length;
    const answerWords = q.answer.includes('/') ? q.answer.split('/') : q.answer.split(/[\s,]+/);

    function replaceBlanksByWord(text, replaceFn) {
        if (blankCount <= 1) return text.replace(/\(\s*\)/g, replaceFn(q.answer));
        let wordIdx = 0;
        return text.replace(/\(\s*\)/g, () => {
            const word = wordIdx < answerWords.length ? answerWords[wordIdx] : '';
            wordIdx++;
            return replaceFn(word);
        });
    }

    let englishText = '';
    const usePlainAnswerDisplay = ['和文英訳', '誤文訂正', '書き換え', 'Q&A作成'].includes(q.format);

    if (usePlainAnswerDisplay) {
        englishText = q.answer;
    } else {
        englishText = q.text.replace(choiceRegex, q.answer);
        englishText = replaceBlanksByWord(englishText, w => w);
        englishText = englishText.replace(/\[\s*.*?\s*\]/g, q.answer);
        englishText = englishText.replace(/\([^)]*[ぁ-んァ-ン一-龥]+[^)]*\)/g, '').trim();
        if (!englishText || englishText.length < 2) englishText = q.answer;
    }
    return englishText;
}

function getAnswerSentenceHtml(q) {
    const choiceRegex = /\([^)]*?\/[^)]*?\)/g;
    const blankCount = (q.text.match(/\(\s*\)/g) || []).length;
    const answerWords = q.answer.includes('/') ? q.answer.split('/') : q.answer.split(/[\s,]+/);

    function replaceBlanksByWord(text, replaceFn) {
        if (blankCount <= 1) return text.replace(/\(\s*\)/g, replaceFn(q.answer));
        let wordIdx = 0;
        return text.replace(/\(\s*\)/g, () => {
            const word = wordIdx < answerWords.length ? answerWords[wordIdx] : '';
            wordIdx++;
            return replaceFn(word);
        });
    }

    let answerSentenceHtml = '';
    const usePlainAnswerDisplay = ['和文英訳', '誤文訂正', '書き換え', 'Q&A作成'].includes(q.format);

    if (usePlainAnswerDisplay) {
        answerSentenceHtml = `<span class="highlight-answer">${q.answer}</span>`;
    } else {
        answerSentenceHtml = q.text.replace(choiceRegex, `<span class="highlight-answer">${q.answer}</span>`);
        answerSentenceHtml = replaceBlanksByWord(answerSentenceHtml, w => `<span class="highlight-answer">${w}</span>`);
        answerSentenceHtml = answerSentenceHtml.replace(/\[\s*.*?\s*\]/g, `<span class="highlight-answer">${q.answer}</span>`);
        answerSentenceHtml = answerSentenceHtml.replace(/\([^)]*[ぁ-んァ-ン一-龥]+[^)]*\)/g, '').trim();
        if (!answerSentenceHtml || answerSentenceHtml.length < 2) {
            answerSentenceHtml = `<span class="highlight-answer">${q.answer}</span>`;
        }
    }
    return answerSentenceHtml;
}

function getPlayButtonsHtml(text) {
    const escapedText = text.replace(/'/g, "\\'");
    return `
        <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
            <button onclick="playAudio('${escapedText}', 1.0, Infinity, this)" class="play-audio-btn">1.0x</button>
            <button onclick="playAudio('${escapedText}', 0.75, Infinity, this)" class="play-audio-btn">0.75x</button>
            <button onclick="playAudio('${escapedText}', 0.5, Infinity, this)" class="play-audio-btn">0.5x</button>
            <button onclick="playAudio('${escapedText}', 0.25, Infinity, this)" class="play-audio-btn">0.25x</button>
            <button onclick="playAudio('${escapedText}', 0.1, Infinity, this)" class="play-audio-btn">0.1x</button>
            <button onclick="playAudioStep('${escapedText}', this)" class="play-audio-btn" style="background: var(--primary); color: #fff;">0.1→1.0</button>
        </div>
    `;
}

function sanitize(str) {
    if (!str) return '';
    return str
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\/､,]/g, ' ')
        .replace(/[\.\?!'""`‘“”・\-—–]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getAcceptedAnswers(q, blankCount) {
    const rawAnswer = q.answer || '';

    if ((q.format === '穴埋め' || q.format === '英単語') && blankCount > 1 && rawAnswer.includes('/')) {
        return [sanitize(rawAnswer.replace(/\s*\/\s*/g, ' '))].filter(Boolean);
    }

    return rawAnswer.split('/').map(s => sanitize(s)).filter(Boolean);
}

function checkAnswer() {
    initGlobalAudio();
    const q = currentQuestions[currentIndex];
    let userAnswer = '';

    if (isDictationMode) {
        const inputEl = document.getElementById('text-answer');
        userAnswer = inputEl ? inputEl.value : '';
    } else if (q.format === '選択問題') {
        const selected = document.querySelector('input[name="answer"]:checked');
        userAnswer = selected ? selected.value : '';
    } else if (q.format === '穴埋め' || q.format === '英単語') {
        const inputs = document.querySelectorAll('.text-answer');
        const answers = [];
        inputs.forEach(input => {
            if (input.value.trim() !== '') answers.push(input.value.trim());
        });
        userAnswer = answers.join(' ');
    } else {
        const inputEl = document.getElementById('text-answer');
        userAnswer = inputEl ? inputEl.value : '';
    }

    const cleanUser = sanitize(userAnswer);
    const englishText = getEnglishText(q);
    const blankCount = (q.text.match(/\(\s*\)/g) || []).length;
    const acceptedAnswers = getAcceptedAnswers(q, blankCount);

    let isCorrect = false;
    if (isDictationMode) {
        isCorrect = (cleanUser === sanitize(englishText));
    } else {
        isCorrect = acceptedAnswers.includes(cleanUser);
    }

    const answerSentenceHtml = getAnswerSentenceHtml(q);

    const resultMsg = document.getElementById('result-message');
    const expArea = document.getElementById('explanation-area');

    if (q.format === '日本語訳' && !isDictationMode) {
        resultMsg.innerHTML = `<div class="result-sentence">正解: <span class="highlight-answer">${q.answer}</span></div>`;

        const escapedText = englishText.replace(/'/g, "\\'");
        const playBtnsHtml = getPlayButtonsHtml(englishText);

        const reviewCheckHtml = `
            <div style="margin-top: 20px; padding: 16px; background: #fffceb; border: 2px solid #000; border-radius: 16px; display: flex; align-items: center; gap: 12px; box-shadow: 4px 4px 0 #000;">
                <input type="checkbox" id="later-check" style="width: 24px; height: 24px; cursor: pointer; accent-color: #e95c8b;">
                <label for="later-check" style="cursor: pointer; font-weight: 900; color: #1a1a1a;">後で確認する（チェックを入れると不正解扱い）</label>
            </div>
        `;

        expArea.innerHTML = `<strong style="font-size: 1.1em; color: #e95c8b;">解説:</strong><br><div style="margin-top: 10px; margin-bottom: 10px; font-weight: 700;">${q.explanation || q.exp || '解説はありません。'}</div>${playBtnsHtml}${reviewCheckHtml}`;
        expArea.style.display = 'block';
        document.getElementById('check-btn').style.display = 'none';
        document.getElementById('next-btn').style.display = 'inline-block';

        const autoPlayEnabled = document.getElementById('auto-play-toggle')?.checked ?? true;
        if (autoPlayEnabled) {
            playAudio(englishText);
        }
        return;
    }

    if (isCorrect) {
        correctCount++;
        resultMsg.innerHTML = `<div class="result-correct">⭕ 正解！</div>`;
        mistakes = mistakes.filter(m => m.id !== q.id);
    } else {
        resultMsg.innerHTML = `
            <div class="result-incorrect">❌ 不正解</div>
            <div class="result-sentence">正解: ${answerSentenceHtml}</div>
        `;
        if (!mistakes.some(m => m.id === q.id)) mistakes.push(q);
    }

    localStorage.setItem('english_quiz_mistakes', JSON.stringify(mistakes));
    document.getElementById('next-btn').style.display = 'inline-block';

    const escapedText = englishText.replace(/'/g, "\\'");
    const playBtnsHtml = getPlayButtonsHtml(englishText);

    expArea.innerHTML = `<strong style="font-size: 1.1em; color: #e95c8b;">解説:</strong><br><div style="margin-top: 10px; margin-bottom: 10px; font-weight: 700;">${q.explanation || q.exp || '解説はありません。'}</div>${playBtnsHtml}`;
    expArea.style.display = 'block';
    document.getElementById('check-btn').style.display = 'none';

    const autoPlayEnabled = document.getElementById('auto-play-toggle')?.checked ?? true;
    if (autoPlayEnabled) {
        playAudio(englishText);
    }
}

function getRankData(accuracy) {
    const ranks = {
        S: {
            rank: 'S', className: 'rank-s', emoji: '🏆', commentColor: '#e67e22', // Orange-dark
            comments: ['Flawless!', 'Perfect score!', 'Incredible!']
        },
        A: {
            rank: 'A', className: 'rank-a', emoji: '🌟', commentColor: '#0984e3', // Blue
            comments: ['Awesome work!', 'Amazing!', 'So close!']
        },
        B: {
            rank: 'B', className: 'rank-b', emoji: '👍', commentColor: '#00b894', // Success Mint
            comments: ['Nice job!', 'Good effort!', 'Well done!']
        },
        C: {
            rank: 'C', className: 'rank-c', emoji: '📘', commentColor: '#f0932b', // Amber
            comments: ['Not bad!', 'Keep studying!', 'Room to grow!']
        },
        D: {
            rank: 'D', className: 'rank-d', emoji: '📝', commentColor: '#eb4d4b', // Red-soft
            comments: ['Review and try again!', 'Don\'t worry!', 'Keep going!']
        },
        E: {
            rank: 'E', className: 'rank-e', emoji: '🌱', commentColor: '#1a1a1a', // Black
            comments: ['This is where it begins!', 'Never give up!', 'You can do it!']
        }
    };

    if (accuracy === 100) return ranks.S;
    if (accuracy >= 80) return ranks.A;
    if (accuracy >= 60) return ranks.B;
    if (accuracy >= 40) return ranks.C;
    if (accuracy >= 20) return ranks.D;
    return ranks.E;
}

function nextQuestion() {
    stopAnyAudio();
    initGlobalAudio();
    const q = currentQuestions[currentIndex];
    if (q.format === '日本語訳') {
        const laterCheck = document.getElementById('later-check');
        if (laterCheck && laterCheck.checked) {
            if (!mistakes.some(m => m.id === q.id)) mistakes.push(q);
        } else {
            correctCount++;
            mistakes = mistakes.filter(m => m.id !== q.id);
        }
        localStorage.setItem('english_quiz_mistakes', JSON.stringify(mistakes));
    }

    currentIndex++;
    if (currentIndex < currentQuestions.length) {
        displayQuestion();
    } else {
        const accuracy = Math.round((correctCount / currentQuestions.length) * 100) || 0;
        const rankData = getRankData(accuracy);
        const comment = rankData.comments[Math.floor(Math.random() * rankData.comments.length)];

        const resultHtml = `
            <div class="result-screen">
                <h3 class="result-title">CONGRATULATIONS!</h3>
                <div class="result-card">
                    <div class="result-label">あなたの正答率</div>
                    <div class="result-accuracy">${accuracy}%</div>
                    <div class="result-detail">(${correctCount} / ${currentQuestions.length} 問中)</div>
                </div>
                
                <div class="rank-section">
                    <div class="result-label">ランク</div>
                    <div class="rank-badge ${rankData.className}">${rankData.rank}</div>
                </div>

                <div class="rank-comment" style="color: ${rankData.commentColor};">
                    ${rankData.emoji} ${comment}
                </div>
                <div class="result-footer">お疲れさまでした！</div>
                
                <button onclick="resetToSetup()" class="secondary-btn start-over-btn">最初に戻る</button>
            </div>
        `;
        document.getElementById('app-area').innerHTML = resultHtml;
    }
}

document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        if (document.activeElement.tagName === 'BUTTON') return;

        const appArea = document.getElementById('app-area');
        if (appArea && appArea.style.display !== 'none') {
            const checkBtn = document.getElementById('check-btn');
            const nextBtn = document.getElementById('next-btn');

            if (checkBtn && checkBtn.style.display !== 'none') {
                checkAnswer();
            } else if (nextBtn && nextBtn.style.display !== 'none') {
                nextQuestion();
            }
        }
    }
});

function playCountdown(callback) {
    if (!globalAudioCtx) {
        callback();
        return;
    }

    if (globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume().catch(() => {});
    }

    const bpm = 120;
    const interval = 60 / bpm; // 0.5秒

    function beep(time, freq = 880) {
        try {
            const osc = globalAudioCtx.createOscillator();
            const gain = globalAudioCtx.createGain();
            osc.connect(gain);
            gain.connect(globalAudioCtx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.4, time + 0.01); // 音量をアップ
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

            osc.start(time);
            osc.stop(time + 0.1);
        } catch (e) {
            console.error('Beep error:', e);
        }
    }

    const now = globalAudioCtx.currentTime;
    beep(now);
    beep(now + interval);
    beep(now + interval * 2);

    // 3回目の音の後に少し間を置いてから開始
    activePlayback.timeoutId = setTimeout(() => {
        callback();
    }, (interval * 3) * 1000);
}

function stopAnyAudio() {
    if ('speechSynthesis' in window) {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
        }
    }
    if (activePlayback.timeoutId) {
        clearTimeout(activePlayback.timeoutId);
        activePlayback.timeoutId = null;
    }
    if (activePlayback.btn) {
        activePlayback.btn.classList.remove('is-playing');
        activePlayback.btn = null;
    }
    activePlayback.type = null;
    activePlayback.rate = null;
    activePlayback.currentCount = 0;
    activePlayback.text = '';
    isPaused = false;
}

function playAudio(text, rate = 1.0, count = 3, btnElem = null, autoNext = false, onRepeat = null, startFrom = 0) {
    initGlobalAudio();
    if (!('speechSynthesis' in window)) {
        alert('お使いのブラウザは音声読み上げに対応していません。');
        return;
    }

    // 他の再生をすべて中断 (トグル停止の場合はここで終わる)
    if (btnElem && activePlayback.btn === btnElem && activePlayback.rate === rate && activePlayback.type === 'normal' && !isListeningMode) {
        stopAnyAudio();
        return;
    }
    stopAnyAudio();

    // 状態を更新
    activePlayback.text = text;
    activePlayback.rate = rate;
    activePlayback.autoNext = autoNext;
    activePlayback.onRepeat = onRepeat;
    activePlayback.type = 'normal';

    if (btnElem) {
        activePlayback.btn = btnElem;
        activePlayback.btn.classList.add('is-playing');
    }

    let currentIteration = startFrom;

    function speak() {
        if (currentIteration >= count) {
            stopAnyAudio();
            return;
        }

        activePlayback.currentCount = currentIteration;
        if (onRepeat) onRepeat(currentIteration, count);

        playCountdown(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            window.__currentUtterance = utterance; // Prevent GC
            utterance.lang = 'en-US';
            utterance.rate = rate;
            const selectedVoice = getSelectedVoice();
            if (selectedVoice) utterance.voice = selectedVoice;

            utterance.onend = () => {
                currentIteration++;
                if (count === Infinity || currentIteration < count) {
                    activePlayback.timeoutId = setTimeout(speak, 200);
                } else {
                    stopAnyAudio();
                    if (autoNext && isListeningMode) {
                        activePlayback.timeoutId = setTimeout(() => {
                            nextQuestion();
                        }, 1500);
                    }
                }
            };
            
            utterance.onerror = (e) => {
                console.error('SpeechSynthesis error:', e);
                stopAnyAudio();
            };

            window.speechSynthesis.speak(utterance);
        });
    }

    speak();
}

let isPaused = false;
function togglePauseResume() {
    const btn = document.getElementById('pause-resume-btn');
    if (!btn) return;

    if (!isPaused) {
        // 一時停止
        isPaused = true;
        btn.textContent = '再生を再開';
        btn.style.background = 'var(--success)';

        // 音声を即座に停止
        window.speechSynthesis.cancel();
        if (activePlayback.timeoutId) {
            clearTimeout(activePlayback.timeoutId);
            activePlayback.timeoutId = null;
        }
    } else {
        // 再開
        isPaused = false;
        btn.textContent = '一時停止';
        btn.style.background = 'var(--accent)';

        // 現在のカウントから再開
        const repeatCount = parseInt(document.getElementById('step-count-input')?.value || 3);
        playAudio(
            activePlayback.text,
            activePlayback.rate,
            repeatCount,
            activePlayback.btn,
            activePlayback.autoNext,
            activePlayback.onRepeat,
            activePlayback.currentCount
        );
    }
}

function playAudioStep(text, btnElem = null) {
    initGlobalAudio();
    if (!('speechSynthesis' in window)) {
        alert('お使いのブラウザは音声読み上げに対応していません。');
        return;
    }

    // トグル動作の確認
    if (btnElem && activePlayback.btn === btnElem) {
        stopAnyAudio();
        return;
    }

    stopAnyAudio();

    if (btnElem) {
        activePlayback.btn = btnElem;
        activePlayback.btn.classList.add('is-playing');
        activePlayback.type = 'step';
    }

    const stepRepeatCount = parseInt(document.getElementById('step-count-input')?.value || 3);
    const rates = [0.1, 0.25, 0.5, 0.75, 1.0];
    let rateIdx = 0;
    let repeatIdx = 0;

    function speakNext() {
        playCountdown(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            window.__currentUtterance = utterance; // Prevent GC
            utterance.lang = 'en-US';
            utterance.rate = rates[rateIdx];
            const selectedVoice = getSelectedVoice();
            if (selectedVoice) utterance.voice = selectedVoice;

            utterance.onend = () => {
                repeatIdx++;
                if (repeatIdx < stepRepeatCount) {
                    activePlayback.timeoutId = setTimeout(speakNext, 200);
                } else {
                    repeatIdx = 0;
                    rateIdx++;
                    if (rateIdx >= rates.length) {
                        // ループの終端に達したら最初から繰り返す（無限ループ）
                        rateIdx = 0;
                    }
                    activePlayback.timeoutId = setTimeout(speakNext, 600);
                }
            };
            
            utterance.onerror = (e) => {
                console.error('SpeechSynthesis error:', e);
                stopAnyAudio();
            };

            window.speechSynthesis.speak(utterance);
        });
    }

    speakNext();
}

if ('speechSynthesis' in window) {
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.addEventListener('voiceschanged', initVoiceList);
    }
}

function getSelectedVoice() {
    const voices = window.speechSynthesis.getVoices();
    let usVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
    
    if (usVoices.length === 0) return null;

    const val = document.getElementById('voice-select')?.value || 'random';
    if (val === 'random') {
        const randomIndex = Math.floor(Math.random() * usVoices.length);
        return usVoices[randomIndex];
    }
    return usVoices.find(v => v.name === val) || usVoices[0];
}

function initVoiceList() {
    const voiceSelect = document.getElementById('voice-select');
    if (!voiceSelect) return;

    // 現在の選択を保存
    const savedVoiceName = localStorage.getItem('selected_us_voice') || 'random';

    const voices = window.speechSynthesis.getVoices();
    let usVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));

    // ドロップダウンを初期化（ランダムを一番上に）
    voiceSelect.innerHTML = '<option value="random">ランダム</option>';

    usVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        
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
            'Steffan': '男性、標準的'
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

        option.textContent = voice.name + ` (${chara})`;
        if (voice.name === savedVoiceName) {
            option.selected = true;
        }
        voiceSelect.appendChild(option);
    });

    // 選択変更時に保存
    voiceSelect.onchange = () => {
        localStorage.setItem('selected_us_voice', voiceSelect.value);
    };
}

// 読み込み時にも実行
window.addEventListener('load', () => {
    initVoiceList();
    setTimeout(initVoiceList, 100);
    setTimeout(initVoiceList, 1000); // 遅延してロードされる音声用
});





