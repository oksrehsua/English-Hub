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
            window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
            this.loadVoices();
        }

        this.voiceSelect.addEventListener('change', () => {
            this.selectedVoice = this.voices.find(v => v.name === this.voiceSelect.value);
        });

        window.addEventListener('beforeunload', () => this.stopPlayback());
    }

    loadVoices() {
        // Filter for American English specifically
        this.voices = window.speechSynthesis.getVoices().filter(v => v.lang === 'en-US' || v.lang === 'en_US');
        this.voiceSelect.innerHTML = '';
        
        if (this.voices.length === 0) {
            // Fallback: show any English if no US English is found
            this.voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
        }

        this.voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            this.voiceSelect.appendChild(option);
        });
        
        if (this.voices.length > 0) {
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
            item.innerHTML = `
                <div class="row-content">
                    <div class="row-text">${this.escapeHtml(row.english)}</div>
                    <div class="row-translation ${this.showTranslations ? '' : 'hidden'}">${this.escapeHtml(row.japanese)}</div>
                </div>
                <div class="row-actions">
                    <button class="btn-play-small" onclick="readerApp.playRow(${index})">再生</button>
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

    playAll() {
        this.stopPlayback();
        this.isPlayingAll = true;
        this.currentIndex = 0;
        this.playNext();
    }

    playNext() {
        if (!this.isPlayingAll || this.currentIndex >= this.csvData.length) {
            this.isPlayingAll = false;
            this.highlightRow(-1);
            return;
        }

        this.highlightRow(this.currentIndex);
        this.speak(this.csvData[this.currentIndex].english, () => {
            this.currentIndex++;
            setTimeout(() => this.playNext(), 500);
        });
    }

    speak(text, onEnd) {
        if (!window.speechSynthesis) return;

        const utterance = new SpeechSynthesisUtterance(text);
        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
        } else {
            utterance.lang = 'en-US';
        }
        utterance.rate = this.currentSpeed;
        
        utterance.onend = () => {
            this.currentUtterance = null;
            if (onEnd) onEnd();
        };

        this.currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
    }

    stopPlayback() {
        this.isPlayingAll = false;
        window.speechSynthesis.cancel();
        this.currentUtterance = null;
        this.highlightRow(-1);
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
