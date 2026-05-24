const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const db = require('./database');
const appSettings = require('./settings');

let mainWindow = null;

function ensureStorageDir() {
  const custom = appSettings.get('storageDir');
  const dir = custom || path.join(app.getPath('userData'), 'images');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '错题笔记本',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(async () => {
  // Init settings and database
  appSettings.init(app.getPath('userData'));
  const dbPath = path.join(app.getPath('userData'), 'screenshots.db');
  await db.init(dbPath);
  ensureStorageDir();

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  db.close();
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers() {
  function importFiles(filePaths) {
    const storageDir = ensureStorageDir();
    const imported = [];

    for (const srcPath of filePaths) {
      const ext = path.extname(srcPath);
      const originalName = path.basename(srcPath);
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const destPath = path.join(storageDir, filename);

      fs.copyFileSync(srcPath, destPath);

      const stat = fs.statSync(destPath);
      const format = ext.replace('.', '').toLowerCase();

      const id = db.addImage({
        filename,
        originalName,
        filePath: destPath,
        fileSize: stat.size,
        format,
      });

      const img = nativeImage.createFromPath(destPath);
      const size = img.getSize();

      imported.push({
        id,
        filename,
        original_name: originalName,
        file_size: stat.size,
        width: size.width,
        height: size.height,
        format,
        tags: [],
        created_at: new Date().toISOString(),
      });
    }

    return imported;
  }

  // --- Image import via dialog ---
  ipcMain.handle('image:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择截图文件',
      filters: [
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });

    if (result.canceled || result.filePaths.length === 0) return [];
    return importFiles(result.filePaths);
  });

  // --- Image import via drag-drop paths ---
  ipcMain.handle('image:importPaths', (_event, filePaths) => {
    if (!filePaths || filePaths.length === 0) return [];
    return importFiles(filePaths);
  });

  // --- Image import via file data (FileReader fallback for drag-drop) ---
  ipcMain.handle('image:importFileData', (_event, filesData) => {
    if (!filesData || filesData.length === 0) return [];
    const storageDir = ensureStorageDir();
    const imported = [];

    for (const { name, data } of filesData) {
      const buffer = Buffer.from(data);
      const ext = path.extname(name);
      const originalName = path.basename(name);
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const destPath = path.join(storageDir, filename);

      fs.writeFileSync(destPath, buffer);

      const stat = fs.statSync(destPath);
      const format = ext.replace('.', '').toLowerCase();

      const id = db.addImage({
        filename,
        originalName,
        filePath: destPath,
        fileSize: stat.size,
        format,
      });

      const img = nativeImage.createFromPath(destPath);
      const size = img.getSize();

      imported.push({
        id,
        filename,
        original_name: originalName,
        file_size: stat.size,
        width: size.width,
        height: size.height,
        format,
        tags: [],
        created_at: new Date().toISOString(),
      });
    }

    return imported;
  });

  // --- Get all images (optionally filtered by tags) ---
  ipcMain.handle('image:getAll', (_event, tagIds) => {
    return db.getImages(tagIds);
  });

  // --- Get thumbnail ---
  ipcMain.handle('image:getThumbnail', (_event, id) => {
    const img = db.getImageById(id);
    if (!img) return null;

    try {
      const nImg = nativeImage.createFromPath(img.file_path);
      const thumb = nImg.resize({ width: 200, quality: 'good' });
      return thumb.toDataURL();
    } catch {
      return null;
    }
  });

  // --- Get full-size image for preview ---
  ipcMain.handle('image:getFull', (_event, id) => {
    const img = db.getImageById(id);
    if (!img) return null;

    try {
      const nImg = nativeImage.createFromPath(img.file_path);
      return nImg.toDataURL();
    } catch {
      return null;
    }
  });

  // --- Delete image ---
  ipcMain.handle('image:delete', (_event, id) => {
    const filePath = db.deleteImage(id);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  });

  // --- Tag CRUD ---
  ipcMain.handle('tag:getAll', () => {
    return db.getTags();
  });

  ipcMain.handle('tag:create', (_event, name, color, parentId) => {
    return db.createTag(name, color, parentId || null);
  });

  ipcMain.handle('tag:update', (_event, id, name, color, parentId) => {
    return db.updateTag(id, name, color, parentId || null);
  });

  ipcMain.handle('tag:delete', (_event, id) => {
    db.deleteTag(id);
    return { success: true };
  });

  // --- Settings ---
  ipcMain.handle('settings:getAll', () => {
    return appSettings.getAll();
  });

  ipcMain.handle('settings:save', (_event, newSettings) => {
    appSettings.setAll(newSettings);
    return { success: true };
  });

  ipcMain.handle('settings:chooseDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择截图存储目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // --- Image-Tag linking ---
  ipcMain.handle('image:addTag', (_event, imageId, tagId) => {
    return db.addTagToImage(imageId, tagId);
  });

  ipcMain.handle('image:removeTag', (_event, imageId, tagId) => {
    return db.removeTagFromImage(imageId, tagId);
  });

  // --- Random pick ---
  ipcMain.handle('image:randomPick', (_event, imageIds, count) => {
    return db.getRandomImages(imageIds, count);
  });

  // --- PDF export ---
  ipcMain.handle('pdf:export', async (_event, imageIds) => {
    if (!imageIds || imageIds.length === 0) {
      return { error: '没有可导出的图片' };
    }

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出PDF',
      defaultPath: `screenshots_${Date.now()}.pdf`,
      filters: [{ name: 'PDF文件', extensions: ['pdf'] }],
    });

    if (!filePath) return { canceled: true };

    const pdfDoc = await PDFDocument.create();
    const A4_WIDTH = 595;
    const A4_HEIGHT = 842;

    for (const id of imageIds) {
      const img = db.getImageById(id);
      if (!img) continue;

      const ext = path.extname(img.file_path).toLowerCase();
      const fileBytes = fs.readFileSync(img.file_path);
      let embedded;

      try {
        if (ext === '.png') {
          embedded = await pdfDoc.embedPng(fileBytes);
        } else if (ext === '.jpg' || ext === '.jpeg') {
          embedded = await pdfDoc.embedJpg(fileBytes);
        } else {
          continue;
        }
      } catch {
        continue;
      }

      const scale = Math.min(
        A4_WIDTH / embedded.width,
        A4_HEIGHT / embedded.height,
        1
      );
      const w = embedded.width * scale;
      const h = embedded.height * scale;

      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      page.drawImage(embedded, {
        x: (A4_WIDTH - w) / 2,
        y: (A4_HEIGHT - h) / 2,
        width: w,
        height: h,
      });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(filePath, pdfBytes);
    return { success: true, path: filePath };
  });
}
