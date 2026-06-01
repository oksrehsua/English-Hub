const fs = require('fs');
const path = require('path');

const targetFile = 'G:/マイドライブ/97_work/English-Hub/english-questions/verb-drill/verbs.csv';
const content = fs.readFileSync(targetFile, 'utf8');

const lines = content.split(/\r?\n/);
const newLines = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    if (i === 0) {
        if (!line.startsWith('item_id,')) {
            newLines.push('item_id,' + line);
        } else {
            newLines.push(line);
        }
    } else {
        if (!line.startsWith('vb_')) {
            const id = 'vb_' + String(i).padStart(4, '0');
            newLines.push(id + ',' + line);
        } else {
            newLines.push(line);
        }
    }
}

fs.writeFileSync(targetFile, newLines.join('\n'));
console.log('Successfully updated verbs.csv');
