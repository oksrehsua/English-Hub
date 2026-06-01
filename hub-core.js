// hub-core.js
// English Hub全体の共通処理・進捗管理を行うコアスクリプト

/**
 * 学習活動を記録する（ヒートマップ用）
 * localStorage 'EnglishHubActivityLog' に日付ごとの学習回数を保存する
 * @param {string} appId - アプリの識別子 (例: 'triple-echo', 'verb-drill')
 */
function logHubActivity(appId) {
    if (!appId) return;
    
    const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
    let log = {};
    
    try {
        const stored = localStorage.getItem('EnglishHubActivityLog');
        if (stored) {
            log = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to parse EnglishHubActivityLog', e);
    }
    
    if (!log[today]) {
        log[today] = {};
    }
    
    if (!log[today][appId]) {
        log[today][appId] = 0;
    }
    
    log[today][appId]++;
    
    try {
        localStorage.setItem('EnglishHubActivityLog', JSON.stringify(log));
    } catch (e) {
        console.error('Failed to save EnglishHubActivityLog', e);
    }
}

// TODO: 後々、IndexedDB 'EnglishHubProgress' へのアクセス共通化などもここに追加予定
