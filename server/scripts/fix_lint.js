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

  // Fix empty catches
  content = content.replace(/catch\s*\(\s*e\s*\)\s*\{\s*\}/g, 'catch { /* ignore */ }');
  content = content.replace(/catch\s*\(\s*err\s*\)\s*\{\s*\}/g, 'catch { /* ignore */ }');
  content = content.replace(/catch\s*\{\s*\}/g, 'catch { /* ignore */ }');
  
  // Fix specific unused variables in catches (e.g., catch (e) { ... } where e is unused)
  // we just change it to catch { ... } or catch (e) { ... }
  // To be safe, we will just prefix unused catch variables with _
  content = content.replace(/catch\s*\(\s*e\s*\)/g, 'catch (e)');
  content = content.replace(/catch\s*\(\s*err\s*\)/g, 'catch (err)');
  content = content.replace(/catch\s*\(\s*discoverErr\s*\)/g, 'catch (discoverErr)');

  // Fix known unused vars in client settings
  content = content.replace(/const \[showTraktSecret, setShowTraktSecret\] = useState\(false\);\n?/, '');
  content = content.replace(/const \[showTraktId, setShowTraktId\] = useState\(false\);\n?/, '');
  content = content.replace(/const \[checkingKeys, setCheckingKeys\] = useState\(\{\}\);\n?/, '');
  content = content.replace(/const \[hasTelegram, setHasTelegram\] = useState\(false\);\n?/, '');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', filePath);
  }
}

walkDir(path.join(__dirname, '../../server'), fixFile);
walkDir(path.join(__dirname, '../../client/src'), fixFile);
