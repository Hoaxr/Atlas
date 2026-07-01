const fs = require('fs');
const content = fs.readFileSync('src/pages/Statistics.jsx', 'utf8');
const totalOpens = (content.match(/<div\b/g) || []).length;
const totalSelfClose = (content.match(/<div[^>]*\/>/g) || []).length;
const totalCloses = (content.match(/<\/div>/g) || []).length;
console.log('Total <div:', totalOpens);
console.log('Self-closing:', totalSelfClose);
console.log('</div>:', totalCloses);
console.log('Net opens:', totalOpens - totalSelfClose - totalCloses);
