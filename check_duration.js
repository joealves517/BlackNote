import fs from 'fs';
const buffer = fs.readFileSync('src/public/welcome-blacknote.mp3');
console.log('File size:', buffer.length);
