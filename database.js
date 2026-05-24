const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let dbPath = null;

async function init(filePath) {
  dbPath = filePath;
  const SQL = await initSqlJs();

  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      format TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS image_tags (
      image_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (image_id, tag_id),
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  save();
  return db;
}

function save() {
  const data = db.export();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// Helper: run SQL that modifies data, then save
function exec(sql, params = []) {
  db.run(sql, params);
  save();
}

// Helper: get all rows from a SELECT
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: get first row from a SELECT
function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

// --- Image operations ---

function addImage({ filename, originalName, filePath, fileSize, format }) {
  exec(
    'INSERT INTO images (filename, original_name, file_path, file_size, format) VALUES (?, ?, ?, ?, ?)',
    [filename, originalName, filePath, fileSize, format]
  );
  const result = queryOne('SELECT last_insert_rowid() as id');
  return result.id;
}

function getImages(tagIds = null) {
  let images;
  if (tagIds && tagIds.length > 0) {
    const placeholders = tagIds.map(() => '?').join(',');
    images = queryAll(
      `SELECT i.* FROM images i
       JOIN image_tags it ON i.id = it.image_id
       WHERE it.tag_id IN (${placeholders})
       GROUP BY i.id
       HAVING COUNT(DISTINCT it.tag_id) = ?
       ORDER BY i.created_at DESC`,
      [...tagIds, tagIds.length]
    );
  } else {
    images = queryAll('SELECT * FROM images ORDER BY created_at DESC');
  }

  for (const img of images) {
    img.tags = queryAll(
      'SELECT t.id, t.name, t.color FROM tags t JOIN image_tags it ON t.id = it.tag_id WHERE it.image_id = ?',
      [img.id]
    );
  }

  return images;
}

function getImageById(id) {
  const img = queryOne('SELECT * FROM images WHERE id = ?', [id]);
  if (img) {
    img.tags = queryAll(
      'SELECT t.id, t.name, t.color FROM tags t JOIN image_tags it ON t.id = it.tag_id WHERE it.image_id = ?',
      [id]
    );
  }
  return img;
}

function deleteImage(id) {
  const img = queryOne('SELECT file_path FROM images WHERE id = ?', [id]);
  if (!img) return null;
  exec('DELETE FROM images WHERE id = ?', [id]);
  return img.file_path;
}

// --- Tag operations ---

function createTag(name, color = '#3b82f6') {
  try {
    exec('INSERT INTO tags (name, color) VALUES (?, ?)', [name, color]);
    const result = queryOne('SELECT last_insert_rowid() as id');
    return { id: result.id, name, color };
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return { error: '标签名称已存在' };
    }
    throw e;
  }
}

function getTags() {
  return queryAll('SELECT * FROM tags ORDER BY created_at DESC');
}

function updateTag(id, name, color) {
  try {
    exec('UPDATE tags SET name = ?, color = ? WHERE id = ?', [name, color, id]);
    return { id, name, color };
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return { error: '标签名称已存在' };
    }
    throw e;
  }
}

function deleteTag(id) {
  exec('DELETE FROM tags WHERE id = ?', [id]);
}

// --- Image-Tag operations ---

function addTagToImage(imageId, tagId) {
  try {
    exec('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)', [imageId, tagId]);
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

function removeTagFromImage(imageId, tagId) {
  exec('DELETE FROM image_tags WHERE image_id = ? AND tag_id = ?', [imageId, tagId]);
  return { success: true };
}

// --- Random selection ---

function getRandomImages(imageIds, count) {
  if (!imageIds || imageIds.length === 0) return [];
  const n = Math.min(count, imageIds.length);
  const shuffled = [...imageIds].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, n);
  const placeholders = picked.map(() => '?').join(',');
  const images = queryAll(
    `SELECT * FROM images WHERE id IN (${placeholders})`,
    picked
  );

  for (const img of images) {
    img.tags = queryAll(
      'SELECT t.id, t.name, t.color FROM tags t JOIN image_tags it ON t.id = it.tag_id WHERE it.image_id = ?',
      [img.id]
    );
  }

  return images;
}

function close() {
  if (db) {
    save();
    db.close();
  }
}

module.exports = { init, addImage, getImages, getImageById, deleteImage, createTag, getTags, updateTag, deleteTag, addTagToImage, removeTagFromImage, getRandomImages, close };
