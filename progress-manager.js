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

        // データクリア
        async clearData() {
            try {
                const db = await openIDB(IDB_NAME);
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(IDB_KEY);
                await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
                db.close();
                progressData = {};
            } catch (e) {
                console.warn('IDBクリア失敗:', e);
            }
        },

        // 進捗の更新
        update(itemId, isCorrect) {
            if (!itemId) return;
            if (!progressData[itemId]) {
                progressData[itemId] = { totalCount: 0, correctCount: 0, streak: 0, history: [] };
            }
            const p = progressData[itemId];
            p.totalCount++;
            if (isCorrect) {
                p.correctCount++;
                p.streak = p.streak > 0 ? p.streak + 1 : 1;
            } else {
                p.streak = p.streak < 0 ? p.streak - 1 : -1;
            }
            p.history.push(isCorrect ? 'o' : 'x');
            if (p.history.length > 20) p.history = p.history.slice(-20);
            
            this.scheduledSave();
        },

        // 外部からデータを一括上書き/マージする用
        mergeData(newData) {
            if (!newData || typeof newData !== 'object') return;
            // 既存データとマージするか、全上書きするか。今回は単純にオブジェクトをマージ
            for (const key in newData) {
                progressData[key] = newData[key];
            }
            this.saveData(); // 即時保存
        },

        getData() {
            return progressData;
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
            const header = 'item_id,total_count,correct_count,streak,history';
            const rows = Object.entries(progressData).map(([id, p]) => {
                const historyStr = p.history.join(',');
                return `${this.csvEscape(id)},${p.totalCount},${p.correctCount},${p.streak},"${historyStr}"`;
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
        }
    };
})();
