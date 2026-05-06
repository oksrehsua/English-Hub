class EnglishReader {
    constructor() {
        this.csvData = [];
        this.currentSpeed = 1.0;
        this.isPlayingAll = false;
        this.currentIndex = -1;
        this.currentUtterance = null;
        this.showTranslations = false;
        this.voices = [];
        this.selectedVoice = null;
        this.playTimeout = null;

        // DOM Elements
        this.fileInput = document.getElementById('csv-upload');
        this.contentList = document.getElementById('content-list');
        this.btnAllPlay = document.getElementById('btn-all-play');
        this.btnStop = document.getElementById('btn-stop');
        this.btnToggleTranslation = document.getElementById('btn-toggle-translation');
        this.speedButtons = document.querySelectorAll('.btn-speed');
        this.voiceSelect = document.getElementById('voice-select');

        this.init();
    }

    init() {
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        this.speedButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setSpeed(parseFloat(btn.dataset.speed));
                this.updateSpeedUI(btn);
            });
        });

        this.btnAllPlay.addEventListener('click', () => this.playAll());
        this.btnStop.addEventListener('click', () => this.stopPlayback());
        this.btnToggleTranslation.addEventListener('click', () => this.toggleTranslations());

        // Voice selection
        if (window.speechSynthesis) {
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.addEventListener('voiceschanged', () => this.loadVoices());
            }
            this.loadVoices();
            
            // To ensure late-loading voices are caught
            setTimeout(() => this.loadVoices(), 100);
            setTimeout(() => this.loadVoices(), 1000);
        }

        this.voiceSelect.addEventListener('change', () => {
            this.selectedVoice = this.voices.find(v => v.name === this.voiceSelect.value);
        });

        window.addEventListener('beforeunload', () => this.stopPlayback());
    }

    loadVoices() {
        const currentVoiceName = this.voiceSelect.value || (this.selectedVoice ? this.selectedVoice.name : null);

        // Filter for any English voices
        this.voices = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'));

        this.voiceSelect.innerHTML = '';
        this.voices.forEach(voice => {
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

            option.textContent = `${voice.name} (${chara})`;
            if (voice.name === currentVoiceName) {
                option.selected = true;
            }
            this.voiceSelect.appendChild(option);
        });
        
        // Restore or set default selected voice
        if (currentVoiceName) {
            this.selectedVoice = this.voices.find(v => v.name === currentVoiceName) || this.voices[0];
        } else if (this.voices.length > 0) {
            this.selectedVoice = this.voices[0];
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            this.parseCSV(content);
            this.renderList();
            this.btnAllPlay.disabled = false;
            this.btnStop.disabled = false;
        };
        reader.readAsText(file);
    }

    parseCSV(text) {
        // More robust CSV parser that handles quotes and multiple columns
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        const data = lines.map(line => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        });

        // Detect header
        if (data.length > 0 && (data[0][0].toLowerCase().includes('english') || data[0][0].toLowerCase().includes('sentence'))) {
            data.shift();
        }

        this.csvData = data.map(row => ({
            english: row[0] || '',
            japanese: row[1] || ''
        }));
    }

    renderList() {
        if (this.csvData.length === 0) {
            this.contentList.innerHTML = '<div class="empty-state">有効なテキストが見つかりませんでした</div>';
            return;
        }

        this.contentList.innerHTML = '';
        this.csvData.forEach((row, index) => {
            const item = document.createElement('div');
            item.className = 'row-item';
            item.id = `row-${index}`;
            // Entire row click starts "All Play" from this row
            item.onclick = () => this.playFrom(index);
            
            item.innerHTML = `
                <div class="row-content">
                    <div class="row-text">${this.escapeHtml(row.english)}</div>
                    <div class="row-translation ${this.showTranslations ? '' : 'hidden'}">${this.escapeHtml(row.japanese)}</div>
                </div>
                <div class="row-actions">
                    <button class="btn-translate-small" onclick="event.stopPropagation(); readerApp.toggleRowTranslation(${index})">和訳</button>
                    <button class="btn-play-small" onclick="event.stopPropagation(); readerApp.playRow(${index})">再生</button>
                </div>
            `;
            this.contentList.appendChild(item);
        });
    }

    toggleTranslations() {
        this.showTranslations = !this.showTranslations;
        this.btnToggleTranslation.textContent = this.showTranslations ? '和訳を隠す' : '和訳を表示';
        const translations = document.querySelectorAll('.row-translation');
        translations.forEach(el => {
            if (this.showTranslations) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    }

    toggleRowTranslation(index) {
        const row = document.getElementById(`row-${index}`);
        if (row) {
            const translation = row.querySelector('.row-translation');
            if (translation) {
                translation.classList.toggle('hidden');
            }
        }
    }

    setSpeed(speed) {
        this.currentSpeed = speed;
    }

    updateSpeedUI(activeBtn) {
        this.speedButtons.forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    playRow(index) {
        this.stopPlayback();
        this.currentIndex = index;
        this.speak(this.csvData[index].english, () => {
            this.highlightRow(-1);
        });
        this.highlightRow(index);
    }

    playFrom(index) {
        this.stopPlayback();
        this.isPlayingAll = true;
        this.currentIndex = index;
        this.playNext();
        this.btnAllPlay.textContent = '停止';
    }

    playAll() {
        if (this.isPlayingAll) {
            this.stopPlayback();
            return;
        }

        this.isPlayingAll = true;
        
        // If we finished the list or haven't started, start from 0
        if (this.currentIndex < 0 || this.currentIndex >= this.csvData.length) {
            this.currentIndex = 0;
        }
        
        this.playNext();
        this.btnAllPlay.textContent = '停止';
    }

    playNext() {
        if (!this.isPlayingAll || this.currentIndex >= this.csvData.length) {
            this.isPlayingAll = false;
            this.highlightRow(-1);
            this.btnAllPlay.textContent = 'ALL再生';
            return;
        }

        const indexToPlay = this.currentIndex;
        this.highlightRow(indexToPlay);
        
        this.speak(this.csvData[indexToPlay].english, () => {
            // Only proceed if we are still playing and haven't jumped to another index
            if (this.isPlayingAll && this.currentIndex === indexToPlay) {
                this.currentIndex++;
                this.playTimeout = setTimeout(() => this.playNext(), 500);
            }
        });
    }

    speak(text, onEnd) {
        if (!window.speechSynthesis) return;

        const utterance = new SpeechSynthesisUtterance(text);
        
        // Always get the latest selected voice from the list
        const voiceName = this.voiceSelect.value;
        const currentVoice = this.voices.find(v => v.name === voiceName) || this.selectedVoice;

        if (currentVoice) {
            utterance.voice = currentVoice;
        } else {
            utterance.lang = 'en-US';
        }
        utterance.rate = this.currentSpeed;
        
        utterance.onend = () => {
            this.currentUtterance = null;
            if (onEnd) onEnd();
        };

        utterance.onerror = (e) => {
            console.error('SpeechSynthesis error:', e);
            this.currentUtterance = null;
            if (onEnd) onEnd();
        };

        this.currentUtterance = utterance;
        window.__currentUtterance = utterance; // Prevent garbage collection
        window.speechSynthesis.speak(utterance);
    }

    stopPlayback() {
        this.isPlayingAll = false;
        if (this.playTimeout) {
            clearTimeout(this.playTimeout);
            this.playTimeout = null;
        }
        window.speechSynthesis.cancel();
        this.currentUtterance = null;
        this.highlightRow(-1);
        this.btnAllPlay.textContent = 'ALL再生';
    }

    highlightRow(index) {
        const rows = document.querySelectorAll('.row-item');
        rows.forEach(row => row.classList.remove('playing'));
        
        if (index !== -1) {
            const activeRow = document.getElementById(`row-${index}`);
            if (activeRow) {
                activeRow.classList.add('playing');
                activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
}

const readerApp = new EnglishReader();
window.readerApp = readerApp;
