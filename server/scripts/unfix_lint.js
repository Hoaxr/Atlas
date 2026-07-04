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

function unfixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Revert back catch (e) to catch (e)
  content = content.replace(/catch \(_e\)/g, 'catch (e)');
  content = content.replace(/catch \(_err\)/g, 'catch (err)');
  content = content.replace(/catch \(_discoverErr\)/g, 'catch (discoverErr)');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

walkDir(path.join(__dirname, '../../server'), unfixFile);
walkDir(path.join(__dirname, '../../client/src'), unfixFile);
