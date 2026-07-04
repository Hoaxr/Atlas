const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules' && f !== 'dist' && f !== '.git') {
        walkDir(dirPath, callback);
      }
    } else {
      if (f.endsWith('.js') || f.endsWith('.jsx')) {
        callback(dirPath);
      }
    }
  });
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Replace empty catch blocks with optional catch bindings
  content = content.replace(/catch\s*\(\s*e\s*\)\s*\{\s*\/\*\s*ignore\s*\*\/\s*\}/g, 'catch { /* ignore */ }');
  content = content.replace(/catch\s*\(\s*err\s*\)\s*\{\s*\/\*\s*ignore\s*\*\/\s*\}/g, 'catch { /* ignore */ }');
  content = content.replace(/catch\s*\(\s*e\s*\)\s*\{\s*\}/g, 'catch { /* ignore */ }');
  content = content.replace(/catch\s*\(\s*err\s*\)\s*\{\s*\}/g, 'catch { /* ignore */ }');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

walkDir(path.join(__dirname, '../../server'), fixFile);
walkDir(path.join(__dirname, '../../client/src'), fixFile);
