// progress-manager.js
// 複数のアプリ (Triple Echo, Verb Drill, Word Drill 等) で共有する進捗管理ロジック

window.ProgressManager = (function() {
    const IDB_NAME = 'EnglishHubProgress';
    const OLD_IDB_NAME = 'TripleEchoProgress';
    const IDB_STORE = 'progress';
    const IDB_KEY = 'data';
    
    // アプリごとのファイルハンドル（FileSystem Access API用）
    let fileHandle = null;
    let progressData = {}; // { [item_id]: { totalCount, correctCount, streak, history: [] } }
    
    let saveTimer = null;

    // --- IndexedDB 基本操作 ---
    function openIDB(dbName) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // --- データ移行処理 (旧TripleEchoProgress -> EnglishHubProgress) ---
    async function migrateOldDataIfNeeded() {
        return new Promise(async (resolve) => {
            try {
                // 新DBを開く
                const newDb = await openIDB(IDB_NAME);
                
                // すでに新DBにデータがあるかチェック
                const txNew = newDb.transaction(IDB_STORE, 'readonly');
                const reqNew = txNew.objectStore(IDB_STORE).get(IDB_KEY);
                
                reqNew.onsuccess = async (e) => {
                    const existingData = e.target.result;
                    if (existingData && Object.keys(existingData).length > 0) {
                        // 新DBに既にデータがある場合は移行不要
                        newDb.close();
                        resolve();
                        return;
                    }
                    
                    // 新DBが空の場合、旧DBがあるか確認
                    try {
                        const oldDb = await openIDB(OLD_IDB_NAME);
                        const txOld = oldDb.transaction(IDB_STORE, 'readonly');
                        const reqOld = txOld.objectStore(IDB_STORE).get(IDB_KEY);
                        
                        reqOld.onsuccess = async (e2) => {
                            const oldData = e2.target.result;
                            if (oldData && Object.keys(oldData).length > 0) {
                                // 新DBに書き込む
                                const txWrite = newDb.transaction(IDB_STORE, 'readwrite');
                                txWrite.objectStore(IDB_STORE).put(oldData, IDB_KEY);
                                txWrite.oncomplete = () => {
                                    console.log('✅ 過去の進捗データ (TripleEchoProgress) を自動移行しました');
                                    oldDb.close();
                                    newDb.close();
                                    
                                    // 移行後、旧DBを削除してスッキリさせる
                                    indexedDB.deleteDatabase(OLD_IDB_NAME);
                                    resolve();
                                };
                            } else {
                                oldDb.close();
                                newDb.close();
                                resolve();
                            }
                        };
                        reqOld.onerror = () => {
                            oldDb.close();
                            newDb.close();
                            resolve();
                        }
                    } catch (err) {
                        newDb.close();
                        resolve(); // 旧DBを開けなかった(存在しないなど)
                    }
                };
                
                reqNew.onerror = () => {
                    newDb.close();
                    resolve();
                };
            } catch (err) {
                console.error("Migration failed:", err);
                resolve();
            }
        });
    }

    // --- Public Methods ---
    return {
        // IDBからデータを読み込む (起動時に呼ぶ)
        async loadData() {
            await migrateOldDataIfNeeded();
            try {
                const db = await openIDB(IDB_NAME);
                const tx = db.transaction(IDB_STORE, 'readonly');
                const data = await new Promise((res, rej) => {
                    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
                    req.onsuccess = e => res(e.target.result);
                    req.onerror = e => rej(e.target.error);
                });
                db.close();
                if (data && typeof data === 'object') {
                    progressData = data;
                }
                return progressData;
            } catch (e) {
                console.warn('IDB読み込み失敗:', e);
                return progressData;
            }
        },

        // データをIDBに保存する
        async saveData() {
            try {
                const db = await openIDB(IDB_NAME);
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(progressData, IDB_KEY);
                await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
                db.close();
            } catch (e) {
                console.warn('IDB保存失敗:', e);
            }
        },

        // 遅延保存 (解答のたびに呼ぶ)
        scheduledSave() {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => this.saveData(), 800);
        },

        // データクリア（リセット: 学習進捗はリセットしつつログと累計は保持）
        async clearData() {
            try {
                for (const itemId in progressData) {
                    const p = progressData[itemId];
                    p.archivedTotalCount = (p.archivedTotalCount || 0) + (p.totalCount || 0);
                    p.archivedCorrectCount = (p.archivedCorrectCount || 0) + (p.correctCount || 0);
                    
                    p.totalCount = 0;
                    p.correctCount = 0;
                    p.streak = 0;
                    p.history = [];
                }
                
                const db = await openIDB(IDB_NAME);
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(progressData, IDB_KEY);
                await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
                db.close();
            } catch (e) {
                console.warn('IDBクリア(リセット)失敗:', e);
            }
        },

        // 進捗の更新
        update(itemId, isCorrect, appName = '', countOnly = false) {
            if (!itemId) return;
            if (!progressData[itemId]) {
                progressData[itemId] = { totalCount: 0, correctCount: 0, streak: 0, history: [], appName: '', dailyLog: {} };
            }
            const p = progressData[itemId];
            if (appName) {
                p.appName = appName;
            }
            
            if (!countOnly) {
                p.totalCount++;
                if (isCorrect) {
                    p.correctCount++;
                    p.streak = p.streak > 0 ? p.streak + 1 : 1;
                } else {
                    p.streak = p.streak < 0 ? p.streak - 1 : -1;
                }
                p.history.push(isCorrect ? 'o' : 'x');
                if (p.history.length > 20) p.history = p.history.slice(-20);
            }
            
            p.lastUpdated = new Date().toISOString();

            // 日別解答数を記録（カレンダー用）
            const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
            if (!p.dailyLog) p.dailyLog = {};
            
            const mode = appName || 'triple-echo';
            if (typeof p.dailyLog[today] === 'object' && p.dailyLog[today] !== null) {
                p.dailyLog[today][mode] = (p.dailyLog[today][mode] || 0) + 1;
            } else if (typeof p.dailyLog[today] === 'number') {
                const prevVal = p.dailyLog[today];
                p.dailyLog[today] = {};
                p.dailyLog[today][p.appName || 'triple-echo'] = prevVal;
                p.dailyLog[today][mode] = (p.dailyLog[today][mode] || 0) + 1;
            } else {
                p.dailyLog[today] = {};
                p.dailyLog[today][mode] = 1;
            }
            
            this.scheduledSave();
        },

        // 外部からデータを一括上書き/マージする用
        mergeData(newData) {
            if (!newData || typeof newData !== 'object') return;
            for (const key in newData) {
                const current = progressData[key];
                const incoming = newData[key];
                if (!current) {
                    progressData[key] = incoming;
                    continue;
                }
                
                // 更新日時（lastUpdated）が新しい方を優先してマージする
                const currTime = current.lastUpdated ? new Date(current.lastUpdated).getTime() : 0;
                const incTime = incoming.lastUpdated ? new Date(incoming.lastUpdated).getTime() : 0;
                
                if (incTime >= currTime) {
                    // 読み込んだデータ（CSVなど）の方が新しい、または同等の場合
                    const mergedDailyLog = { ...(current.dailyLog || {}) };
                    const incDailyLog = incoming.dailyLog || {};
                    for (const date in incDailyLog) {
                        const currVal = mergedDailyLog[date];
                        const incVal = incDailyLog[date];
                        if (typeof currVal === 'object' && typeof incVal === 'object') {
                            mergedDailyLog[date] = { ...currVal };
                            for (const mode in incVal) {
                                mergedDailyLog[date][mode] = Math.max(mergedDailyLog[date][mode] || 0, incVal[mode]);
                            }
                        } else if (typeof currVal === 'number' && typeof incVal === 'number') {
                            mergedDailyLog[date] = Math.max(currVal, incVal);
                        } else {
                            mergedDailyLog[date] = incVal;
                        }
                    }
                    progressData[key] = {
                        ...incoming,
                        dailyLog: mergedDailyLog
                    };
                } else {
                    // ローカル（IndexedDB）側の方が新しい場合は、CSV側のデータで上書きせずローカルを優先
                    const mergedDailyLog = { ...(incoming.dailyLog || {}) };
                    const currDailyLog = current.dailyLog || {};
                    for (const date in currDailyLog) {
                        const currVal = currDailyLog[date];
                        const incVal = mergedDailyLog[date];
                        if (typeof currVal === 'object' && typeof incVal === 'object') {
                            mergedDailyLog[date] = { ...incVal };
                            for (const mode in currVal) {
                                mergedDailyLog[date][mode] = Math.max(mergedDailyLog[date][mode] || 0, currVal[mode]);
                            }
                        } else if (typeof currVal === 'number' && typeof incVal === 'number') {
                            mergedDailyLog[date] = Math.max(currVal, incVal);
                        } else {
                            mergedDailyLog[date] = currVal;
                        }
                    }
                    progressData[key] = {
                        ...current,
                        dailyLog: mergedDailyLog
                    };
                }
            }
            this.saveData(); // 即時保存
        },

        getData() {
            return progressData;
        },

        /**
         * 進捗バッジのHTMLを返す（共通UI部品）
         * @param {string} itemId - 問題のID
         * @returns {string} バッジのHTML文字列
         */
        getProgressBadgeHtml(itemId) {
            const p = progressData[itemId];
            if (!p || p.totalCount === 0) {
                return '<span class="badge progress-badge progress-new">NEW</span>';
            }
            const accuracy = Math.round((p.correctCount / p.totalCount) * 100);
            let streakHtml = '';
            if (p.streak >= 5) {
                streakHtml = `<span class="badge progress-badge progress-streak-good">${p.streak} streak</span>`;
            } else if (p.streak >= 3) {
                streakHtml = `<span class="badge progress-badge progress-streak-ok">${p.streak} streak</span>`;
            } else if (p.streak <= -3) {
                streakHtml = `<span class="badge progress-badge progress-streak-bad">${Math.abs(p.streak)}連続不正解</span>`;
            } else if (p.streak <= -2) {
                streakHtml = `<span class="badge progress-badge progress-streak-warn">${Math.abs(p.streak)}連続不正解</span>`;
            }
            const accuracyClass = accuracy >= 70 ? 'progress-accuracy-good' : accuracy >= 40 ? 'progress-accuracy-mid' : 'progress-accuracy-bad';

            let dateHtml = '';
            if (p.lastUpdated) {
                const d = new Date(p.lastUpdated);
                if (!isNaN(d)) {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    dateHtml = `<span style="font-size:0.75em;color:#888;margin-left:6px;">${yyyy}/${mm}/${dd}</span>`;
                }
            }

            return `<span class="badge progress-badge ${accuracyClass}">${p.correctCount}/${p.totalCount} ${accuracy}%</span>${streakHtml}${dateHtml}`;
        },

        // File System Access API 用のファイルハンドル操作
        setFileHandle(handle) {
            fileHandle = handle;
        },
        
        getFileHandle() {
            return fileHandle;
        },

        // CSV用エスケープ
        csvEscape(str) {
            if (str == null) return '';
            str = String(str);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        },

        // 進捗CSVの文字列生成
        buildCSV() {
            const header = 'item_id,app_name,total_count,correct_count,streak,history,last_updated,daily_log,archived_total_count,archived_correct_count';
            const rows = Object.entries(progressData).map(([id, p]) => {
                const historyStr = p.history.join(',');
                const dateStr = p.lastUpdated || '';
                const appStr = p.appName || '';
                const dailyLogStr = p.dailyLog ? JSON.stringify(p.dailyLog) : '';
                return `${this.csvEscape(id)},${this.csvEscape(appStr)},${p.totalCount},${p.correctCount},${p.streak},"${historyStr}",${dateStr},${this.csvEscape(dailyLogStr)},${p.archivedTotalCount || 0},${p.archivedCorrectCount || 0}`;
            });
            return [header, ...rows].join('\n');
        },

        // CSVファイルへの保存 (File System Access API)
        async saveToFile(silent = false, showToastFn = null) {
            const csvStr = this.buildCSV();
            const bom = '\uFEFF';
            const content = bom + csvStr;

            if (!window.showSaveFilePicker) {
                this._fallbackDownload(csvStr);
                return;
            }

            try {
                if (!fileHandle) {
                    fileHandle = await window.showSaveFilePicker({
                        suggestedName: 'english-hub-progress.csv',
                        types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }]
                    });
                }
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();

                if (!silent && typeof showToastFn === 'function') {
                    showToastFn();
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.error('上書き保存エラー:', err);
                fileHandle = null;
                this._fallbackDownload(csvStr);
            }
        },

        _fallbackDownload(csvStr) {
            const bom = '\uFEFF';
            const blob = new Blob([bom + csvStr], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'english-hub-progress.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },

        // ── 共通ユーティリティ ────────────────────────────────────

        /**
         * 保存完了トースト通知を表示する
         */
        showSaveToast() {
            let toast = document.getElementById('save-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'save-toast';
                toast.style.cssText = [
                    'position:fixed', 'bottom:24px', 'right:24px',
                    'background:#222', 'color:#fff', 'font-weight:700',
                    'padding:12px 20px', 'border-radius:12px',
                    'box-shadow:0 4px 16px rgba(0,0,0,.15)',
                    'font-size:0.9rem', 'z-index:9999',
                    'transition:opacity .4s ease'
                ].join(';');
                document.body.appendChild(toast);
            }
            toast.textContent = '進捗ファイルを上書き保存しました';
            toast.style.opacity = '1';
            clearTimeout(toast._hideTimer);
            toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
        },

        /**
         * 進捗CSV の1行をパース（historyフィールドがクォートされているため専用パース）
         * @param {string} line
         * @returns {string[]}
         */
        parseCSVLine(line) {
            const cols = [];
            let cur = '';
            let inQ = false;
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                const next = line[i + 1];
                if (c === '"' && inQ && next === '"') { cur += '"'; i++; }
                else if (c === '"') { inQ = !inQ; }
                else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
                else { cur += c; }
            }
            cols.push(cur);
            return cols;
        },

        /**
         * 進捗CSVテキストをパースして mergeData まで行う
         * @param {string} text - CSVファイルの生テキスト
         * @returns {{ loadedCount: number }} ロードした件数
         */
        parseAndMergeCSV(text) {
            const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) throw new Error('進捗CSVの行数が不足しています');

            const header = lines[0].split(',').map(h => h.trim().toLowerCase());
            const idIdx      = header.indexOf('item_id');
            const appIdx     = header.indexOf('app_name');
            const totalIdx   = header.indexOf('total_count');
            const correctIdx = header.indexOf('correct_count');
            const streakIdx  = header.indexOf('streak');
            const historyIdx = header.indexOf('history');
            const updatedIdx = header.indexOf('last_updated');
            const dailyLogIdx = header.indexOf('daily_log');
            const arcTotalIdx = header.indexOf('archived_total_count');
            const arcCorrectIdx = header.indexOf('archived_correct_count');

            if (idIdx === -1 || totalIdx === -1) {
                throw new Error('進捗CSVに必要なヘッダー（item_id, total_count）が見つかりません');
            }

            const newData = {};
            let loadedCount = 0;
            for (let i = 1; i < lines.length; i++) {
                const cols = this.parseCSVLine(lines[i]);
                const id = cols[idIdx]?.trim();
                if (!id) continue;
                const appName = appIdx !== -1 ? cols[appIdx]?.trim() : '';
                const total   = parseInt(cols[totalIdx])   || 0;
                const correct = parseInt(cols[correctIdx]) || 0;
                const streak  = parseInt(cols[streakIdx])  || 0;
                const history = (cols[historyIdx] || '').split(',').map(s => s.trim()).filter(s => s === 'o' || s === 'x');
                const lastUpdated = updatedIdx !== -1 ? (cols[updatedIdx]?.trim() || '') : '';
                let dailyLog = {};
                if (dailyLogIdx !== -1 && cols[dailyLogIdx]?.trim()) {
                    try { dailyLog = JSON.parse(cols[dailyLogIdx].trim()); } catch(e) { /* ignore parse error */ }
                }
                const archivedTotalCount = arcTotalIdx !== -1 ? (parseInt(cols[arcTotalIdx]) || 0) : 0;
                const archivedCorrectCount = arcCorrectIdx !== -1 ? (parseInt(cols[arcCorrectIdx]) || 0) : 0;
                
                newData[id] = { appName, totalCount: total, correctCount: correct, streak, history, lastUpdated, dailyLog, archivedTotalCount, archivedCorrectCount };
                loadedCount++;
            }
            this.mergeData(newData);
            return { loadedCount };
        },

        /**
         * 進捗CSVファイルを読み込む（input[type=file] か showOpenFilePicker を使用）
         * @param {string} indicatorId - ロード件数を表示する要素のID
         * @param {Function} [onLoaded] - ロード後に呼ぶコールバック (省略可)
         */
        async loadProgressFromFile(indicatorId, onLoaded) {
            const processFile = (file) => {
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const { loadedCount } = this.parseAndMergeCSV(e.target.result);
                        const ind = indicatorId ? document.getElementById(indicatorId) : null;
                        if (ind) {
                            ind.textContent = `進捗データ読み込み済み: ${loadedCount}問分`;
                            ind.style.display = 'block';
                        }
                        if (typeof onLoaded === 'function') onLoaded(loadedCount);
                    } catch (err) {
                        console.error(err);
                        alert('進捗CSVの読み込みに失敗しました: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };

            if (window.showOpenFilePicker) {
                try {
                    const [handle] = await window.showOpenFilePicker({
                        types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
                        multiple: false
                    });
                    fileHandle = handle;
                    processFile(await handle.getFile());
                } catch (err) {
                    if (err.name !== 'AbortError') console.error('ファイル選択エラー:', err);
                }
            } else {
                // フォールバック: input[type=file] を動的生成してクリック
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = (e) => processFile(e.target.files[0]);
                input.click();
            }
        },

        /**
         * 進捗データをリセットする（確認ダイアログ付き）
         * @param {string} indicatorId - 非表示にする要素のID
         * @param {Function} [onCleared] - クリア後に呼ぶコールバック (省略可)
         */
        async clearProgressData(indicatorId, onCleared) {
            if (!confirm('過去の学習記録（正解率やストリーク）をリセットしますか？\n（カレンダーの学習履歴はそのまま保持されます）')) return;
            await this.clearData();
            // インジケータは非表示にせず、状態を維持する（件数は変わらないため）
            if (typeof onCleared === 'function') onCleared();
        },

        /**
         * 進捗データをIDBから読み込み、インジケータとダッシュボードボタンを更新する
         * @param {string} indicatorId - 件数を表示する要素のID
         * @param {Function} [onLoaded] - ロード後に呼ぶコールバック (省略可)
         */
        async initProgress(indicatorId, onLoaded) {
            const data = await this.loadData();
            const count = Object.keys(data).length;
            if (count > 0) {
                const ind = indicatorId ? document.getElementById(indicatorId) : null;
                if (ind) {
                    ind.textContent = `進捗データを自動読み込み（${count}問分）`;
                    ind.style.display = 'block';
                }
            }
            if (typeof onLoaded === 'function') onLoaded(data);
            return data;
        },

        /**
         * 苦手優先の重み付きサンプリング
         * @param {Array}  questions - 問題リスト
         * @param {number} count     - 取得件数
         * @param {Object} pData     - ProgressManager.getData() の結果
         * @param {string} [idKey='id'] - 問題オブジェクト内のID取得キー
         * @returns {Array}
         */
        weightedSample(questions, count, pData, idKey = 'id') {
            const scored = questions.map(q => {
                const p = pData[q[idKey]];
                let score = 10;
                if (!p || p.totalCount === 0) {
                    score += 20;
                } else {
                    const acc = p.correctCount / p.totalCount;
                    if (acc < 0.4) score += 40;
                    else if (acc < 0.6) score += 20;
                    if (p.streak <= -3) score += 30;
                    else if (p.streak <= -2) score += 20;
                    if (p.streak >= 5) score -= 50;
                    else if (p.streak >= 3) score -= 20;
                }
                return { q, score: Math.max(1, score) };
            });

            const result = [];
            const pool = [...scored];
            const needed = Math.min(count, questions.length);
            for (let i = 0; i < needed; i++) {
                const total = pool.reduce((s, item) => s + item.score, 0);
                let rand = Math.random() * total;
                let idx = 0;
                for (idx = 0; idx < pool.length; idx++) {
                    rand -= pool[idx].score;
                    if (rand <= 0) break;
                }
                idx = Math.min(idx, pool.length - 1);
                result.push(pool[idx].q);
                pool.splice(idx, 1);
            }
            return result;
        }
    };
})();
