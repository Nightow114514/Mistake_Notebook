const fs = require('fs');
const path = require('path');

let settingsPath = '';
let settings = {
  storageDir: '',
  darkMode: false,
};

function init(userDataPath) {
  settingsPath = path.join(userDataPath, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings = { ...settings, ...data };
    } catch {
      // corrupted file, use defaults
    }
  }
}

function get(key) {
  return settings[key];
}

function getAll() {
  return { ...settings };
}

function setAll(newSettings) {
  settings = { ...settings, ...newSettings };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

module.exports = { init, get, getAll, setAll };
