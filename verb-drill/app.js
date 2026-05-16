let verbsData = [];
let currentVerb = null;
let comboCount = 0;
let inputs = [];
let keys = ['present', 'present_participle', 'past', 'past_participle'];

// We assume diff_match_patch is loaded globally via CDN
const dmp = new diff_match_patch();

document.addEventListener('DOMContentLoaded', () => {
    // Load CSV
    Papa.parse('verbs.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            verbsData = results.data;
            inputs = keys.map(key => document.getElementById(`input-${key}`));
            setupEventListeners();
            initGame();
        }
    });
});

function setupEventListeners() {
    inputs.forEach((input, index) => {
        // As they type, check if it matches exactly
        input.addEventListener('input', () => {
            checkCurrentInput(index);
        });

        // When pressing Enter, move to next or show diff if wrong
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitInput(index);
            }
        });
        
        // Show diff when they leave the field and it's not empty/correct
        input.addEventListener('blur', () => {
            if (input.value.trim() !== '' && !input.classList.contains('correct')) {
                showDiff(index);
            }
        });
    });

    document.getElementById('btn-skip').addEventListener('click', skipQuestion);
}

function initGame() {
    loadNextQuestion();
}

function loadNextQuestion() {
    if (verbsData.length === 0) return;

    // Pick random verb
    currentVerb = verbsData[Math.floor(Math.random() * verbsData.length)];
    
    document.getElementById('japanese-word').textContent = currentVerb.japanese;
    
    // Reset UI
    inputs.forEach(input => {
        input.value = '';
        input.className = '';
        input.disabled = false;
        document.getElementById(`feedback-${input.id.replace('input-', '')}`).innerHTML = '';
    });
    
    // Focus first input
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
        
        // Check if all correct
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
        
        // Reset combo
        resetCombo();
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
        // ignore op === -1 (Delete / extra chars typed by user) - they will see what's missing
    });
    
    feedbackDiv.innerHTML = `Hint: ${html}`;
}

function checkAllCorrect() {
    const allCorrect = inputs.every(input => input.classList.contains('correct'));
    
    if (allCorrect) {
        inputs.forEach(input => input.disabled = true);
        
        // Increase combo
        comboCount++;
        document.getElementById('combo-counter').textContent = `🔥 ${comboCount} Combo`;
        
        // Speech synthesis (read the words)
        speakWords([
            currentVerb.present,
            currentVerb.present_participle,
            currentVerb.past,
            currentVerb.past_participle
        ]);
        
        // Auto next
        setTimeout(loadNextQuestion, 1200);
    }
}

function resetCombo() {
    comboCount = 0;
    document.getElementById('combo-counter').textContent = `🔥 0 Combo`;
}

function skipQuestion() {
    resetCombo();
    
    // Show answers
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
    
    // Auto next after delay
    setTimeout(loadNextQuestion, 2000);
}

function speakWords(words) {
    if (!window.speechSynthesis) return;
    
    // Filter out undefined/null just in case
    const validWords = words.filter(w => w);
    if (validWords.length === 0) return;

    let text = validWords.join(', ');
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    
    window.speechSynthesis.speak(utterance);
}
