const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src', 'pages', 'RestaurantModelPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');
// Fix the broken cast strings caused by powershell escape
content = content.replace(/Record\\<string, string\\>/g, 'Record<string, string>');
fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed', (content.match(/Record<string, string>/g) || []).length, 'occurrences');
