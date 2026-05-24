// --- State ---
let images = [];
let tags = [];
let selectedImageIds = new Set();
let activeFilterTagIds = [];
let collapsedTags = {}; // { tagId: true } for collapsed parents in tree
let previewIndex = -1; // index in current view for prev/next navigation
let currentViewIds = []; // image ids currently displayed (for preview nav)

// --- DOM refs ---
const imageGrid = document.getElementById('imageGrid');
const filterTagsEl = document.getElementById('filterTags');
const tagListEl = document.getElementById('tagList');
const contextMenu = document.getElementById('contextMenu');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const previewModal = document.getElementById('previewModal');
const previewImage = document.getElementById('previewImage');
const previewName = document.getElementById('previewName');
const previewTags = document.getElementById('previewTags');
const selectionInfo = document.getElementById('selectionInfo');
const newTagParent = document.getElementById('newTagParent');
let contextImageId = null;
let appSettings = { darkMode: false, storageDir: '' };

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  appSettings = await window.api.getSettings();
  applyTheme(appSettings.darkMode);

  await loadAll();
  renderAll();
  setupGlobalDragDrop();
  setupSettingsUI();
});

async function loadAll() {
  [images, tags] = await Promise.all([
    window.api.getImages(activeFilterTagIds.length > 0 ? activeFilterTagIds : null),
    window.api.getTags(),
  ]);
  currentViewIds = images.map(i => i.id);
}

// --- Tree helpers ---
function getTagChildren(parentId) {
  return tags.filter(t => t.parent_id === parentId);
}

function getTagDepth(tag) {
  let depth = 0;
  let cur = tag;
  while (cur.parent_id) {
    depth++;
    cur = tags.find(t => t.id === cur.parent_id);
    if (!cur) break;
  }
  return depth;
}

function isTagVisible(tag) {
  // Visible if all ancestors are expanded
  let cur = tag;
  while (cur.parent_id) {
    const parent = tags.find(t => t.id === cur.parent_id);
    if (!parent) break;
    if (collapsedTags[parent.id]) return false;
    cur = parent;
  }
  return true;
}

function toggleCollapse(tagId) {
  collapsedTags[tagId] = !collapsedTags[tagId];
}

// --- Build tag tree for parent selector ---
function updateParentSelect() {
  newTagParent.innerHTML = '<option value="">(顶级标签)</option>';
  const roots = tags.filter(t => !t.parent_id);
  addOptions(roots, 0);
}

function addOptions(tagList, depth) {
  for (const t of tagList) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = '  '.repeat(depth) + t.name;
    newTagParent.appendChild(opt);
    const children = tags.filter(c => c.parent_id === t.id);
    if (children.length > 0) addOptions(children, depth + 1);
  }
}

// --- Render ---
function renderAll() {
  renderFilterTags();
  renderTagList();
  renderImageGrid();
  updateParentSelect();
  updateSelectionBar();
}

function renderFilterTags() {
  filterTagsEl.innerHTML = '';
  if (tags.length === 0) {
    filterTagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">暂无标签</span>';
    return;
  }
  const flat = flattenTagTree();
  for (const tag of flat) {
    if (tag.parent_id && collapsedTags[tag.parent_id]) continue;
    const el = document.createElement('span');
    el.className = 'filter-tag' + (activeFilterTagIds.includes(tag.id) ? ' active' : '');
    el.textContent = tag.name;
    el.style.backgroundColor = tag.color;
    el.addEventListener('click', () => toggleFilterTag(tag.id));
    filterTagsEl.appendChild(el);
  }
}

function flattenTagTree() {
  const result = [];
  const roots = tags.filter(t => !t.parent_id);
  function walk(list, depth) {
    for (const t of list) {
      result.push(t);
      const children = tags.filter(c => c.parent_id === t.id);
      if (children.length > 0) walk(children, depth + 1);
    }
  }
  walk(roots, 0);
  return result;
}

function renderTagList() {
  tagListEl.innerHTML = '';
  if (tags.length === 0) {
    tagListEl.innerHTML = '<li style="font-size:12px;color:var(--text-muted);padding:4px 8px">暂无标签</li>';
    return;
  }
  const roots = tags.filter(t => !t.parent_id);
  renderTagTreeItems(roots, 0);
}

function renderTagTreeItems(subset, depth) {
  for (const tag of subset) {
    const children = tags.filter(t => t.parent_id === tag.id);
    const hasChildren = children.length > 0;
    const isCollapsed = !!collapsedTags[tag.id];

    const li = document.createElement('li');
    li.className = 'tag-list-item';
    li.style.paddingLeft = (8 + depth * 16) + 'px';

    const toggleSpan = document.createElement('span');
    toggleSpan.className = 'tag-tree-toggle' + (hasChildren ? '' : ' empty');
    toggleSpan.textContent = hasChildren ? (isCollapsed ? '▶' : '▼') : '';
    toggleSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasChildren) {
        toggleCollapse(tag.id);
        renderAll();
      }
    });

    const nameSpan = document.createElement('span');
    nameSpan.style.flex = '1';
    nameSpan.innerHTML = `<span class="tag-list-color" style="background:${tag.color}"></span>${escapeHtml(tag.name)}`;

    const actionsSpan = document.createElement('span');
    actionsSpan.className = 'tag-list-actions';
    actionsSpan.innerHTML = `
      <button data-action="addChild" data-id="${tag.id}" title="添加子标签">+</button>
      <button data-action="edit" data-id="${tag.id}" data-name="${escapeHtml(tag.name)}" data-color="${tag.color}" title="编辑">&#9998;</button>
      <button data-action="delete" data-id="${tag.id}" title="删除">&times;</button>
    `;

    li.appendChild(toggleSpan);
    li.appendChild(nameSpan);
    li.appendChild(actionsSpan);

    li.querySelector('[data-action="addChild"]').addEventListener('click', (e) => {
      e.stopPropagation();
      prepareAddChildTag(tag.id, tag.name);
    });
    li.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      editTag(tag.id, tag.name, tag.color, tag.parent_id);
    });
    li.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTag(tag.id);
    });

    tagListEl.appendChild(li);

    if (hasChildren && !isCollapsed) {
      renderTagTreeItems(children, depth + 1);
    }
  }
}

function prepareAddChildTag(parentId, parentName) {
  document.getElementById('newTagName').value = '';
  document.getElementById('newTagColor').value = '#3b82f6';
  newTagParent.value = parentId;
  document.getElementById('newTagName').placeholder = `子标签 (${parentName})`;
  document.getElementById('newTagName').focus();
}

async function renderImageGrid() {
  imageGrid.innerHTML = '';

  if (images.length === 0) {
    imageGrid.innerHTML = `
      <div id="dropZone" class="drop-zone">
        <div class="drop-zone-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          <p>拖拽图片到此处导入</p>
          <p class="hint">或点击上方「导入截图」按钮</p>
        </div>
      </div>
    `;
    setupDropZone();
    return;
  }

  for (const img of images) {
    const card = document.createElement('div');
    card.className = 'image-card' + (selectedImageIds.has(img.id) ? ' selected' : '');
    card.dataset.imageId = img.id;
    card.innerHTML = `
      <div class="placeholder-thumb" data-thumb-id="${img.id}"></div>
      <div class="image-card-body">
        <div class="image-card-name" title="${escapeHtml(img.original_name)}">${escapeHtml(img.original_name)}</div>
        <div class="image-card-tags">
          ${img.tags.map(t => `<span class="image-card-tag" style="background:${t.color}">${escapeHtml(t.name)}</span>`).join('')}
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(img.id, card);
      } else if (e.shiftKey && previewIndex >= 0) {
        // shift-range select
        const start = Math.min(previewIndex, images.findIndex(i => i.id === img.id));
        const end = Math.max(previewIndex, images.findIndex(i => i.id === img.id));
        clearSelection();
        for (let k = start; k <= end; k++) {
          selectedImageIds.add(images[k].id);
        }
        renderImageGrid();
      } else {
        if (!selectedImageIds.has(img.id)) {
          clearSelection();
          toggleSelect(img.id, card);
        }
        previewIndex = images.findIndex(i => i.id === img.id);
      }
    });

    card.addEventListener('dblclick', () => {
      previewIndex = images.findIndex(i => i.id === img.id);
      openPreview(img.id);
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextImageId = img.id;
      showContextMenu(e.clientX, e.clientY);
    });

    imageGrid.appendChild(card);
    loadThumbnail(img.id);
  }

  setupDropZone();
}

async function loadThumbnail(id) {
  const dataUrl = await window.api.getThumbnail(id);
  const placeholder = document.querySelector(`[data-thumb-id="${id}"]`);
  if (placeholder && dataUrl) {
    const img = document.createElement('img');
    img.className = 'image-card-thumb';
    img.src = dataUrl;
    placeholder.replaceWith(img);
  }
}

function toggleSelect(id, cardEl) {
  if (selectedImageIds.has(id)) {
    selectedImageIds.delete(id);
    if (cardEl) cardEl.classList.remove('selected');
  } else {
    selectedImageIds.add(id);
    if (cardEl) cardEl.classList.add('selected');
  }
  updateSelectionBar();
}

function clearSelection() {
  selectedImageIds.clear();
}

function updateSelectionBar() {
  if (selectedImageIds.size > 0) {
    selectionInfo.textContent = `已选 ${selectedImageIds.size} 张`;
    selectionInfo.classList.remove('hidden');
  } else {
    selectionInfo.classList.add('hidden');
  }
}

// --- Global drag-drop (for entire window) ---
function getImageFiles(dataTransfer) {
  const files = dataTransfer.files;
  if (!files || files.length === 0) return [];
  return Array.from(files).filter(f => /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(f.name));
}

async function importFromDrop(dataTransfer) {
  const imgFiles = getImageFiles(dataTransfer);
  if (imgFiles.length === 0) return;

  // Try File.path first (Electron specific), fallback to FileReader
  const filesData = await Promise.all(imgFiles.map(f => {
    return new Promise(async (resolve) => {
      if (f.path) {
        // Electron path is available — use the fast path
        resolve({ path: f.path, name: null, data: null });
      } else {
        // Read file via FileReader as fallback
        const reader = new FileReader();
        reader.onload = () => {
          resolve({ path: null, name: f.name, data: Array.from(new Uint8Array(reader.result)) });
        };
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(f);
      }
    });
  }));

  const valid = filesData.filter(Boolean);
  if (valid.length === 0) return;

  // Split: path-based files vs data-based files
  const pathFiles = valid.filter(f => f.path).map(f => f.path);
  const dataFiles = valid.filter(f => f.data).map(f => ({ name: f.name, data: f.data }));

  let imported = [];
  if (pathFiles.length > 0) {
    imported = imported.concat(await window.api.importPaths(pathFiles));
  }
  if (dataFiles.length > 0) {
    imported = imported.concat(await window.api.importFileData(dataFiles));
  }

  if (imported.length > 0) {
    await loadAll();
    renderAll();
  }
}

function setupGlobalDragDrop() {
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    imageGrid.classList.add('drag-active');
  });

  document.body.addEventListener('dragleave', (e) => {
    if (e.target === document.body) {
      imageGrid.classList.remove('drag-active');
    }
  });

  document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    imageGrid.classList.remove('drag-active');
    await importFromDrop(e.dataTransfer);
  });
}

// --- Drop zone (for empty grid) ---
function setupDropZone() {
  const dz = imageGrid.querySelector('#dropZone');
  if (!dz) return;

  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.add('drag-over');
  });

  dz.addEventListener('dragleave', () => {
    dz.classList.remove('drag-over');
  });

  dz.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove('drag-over');
    await importFromDrop(e.dataTransfer);
  });
}

// --- Import button ---
document.getElementById('importBtn').addEventListener('click', async () => {
  const newImages = await window.api.importImages();
  if (newImages && newImages.length > 0) {
    await loadAll();
    renderAll();
  }
});

// --- Export PDF ---
document.getElementById('exportPdfBtn').addEventListener('click', async () => {
  const ids = selectedImageIds.size > 0
    ? [...selectedImageIds]
    : images.map(img => img.id);

  if (ids.length === 0) {
    alert('没有可导出的图片');
    return;
  }

  const result = await window.api.exportPdf(ids);
  if (result && result.error) {
    alert(result.error);
  } else if (result && result.success) {
    alert(`PDF 已导出到：${result.path}`);
  }
});

// --- Filter ---
function toggleFilterTag(tagId) {
  const idx = activeFilterTagIds.indexOf(tagId);
  if (idx >= 0) {
    activeFilterTagIds.splice(idx, 1);
  } else {
    activeFilterTagIds.push(tagId);
  }
  refreshFilter();
}

document.getElementById('clearFilterBtn').addEventListener('click', () => {
  activeFilterTagIds = [];
  refreshFilter();
});

async function refreshFilter() {
  clearSelection();
  images = await window.api.getImages(activeFilterTagIds.length > 0 ? activeFilterTagIds : null);
  currentViewIds = images.map(i => i.id);
  previewIndex = -1;
  renderAll();
}

// --- Random pick ---
document.getElementById('randomPickBtn').addEventListener('click', async () => {
  const countInput = document.getElementById('randomCount');
  const count = Math.max(1, parseInt(countInput.value) || 1);

  const pool = images.map(img => img.id);
  if (pool.length === 0) {
    alert('没有可抽取的图片');
    return;
  }

  const picked = await window.api.randomPick(pool, count);
  showRandomModal(picked);
});

// --- Tag CRUD ---
document.getElementById('addTagBtn').addEventListener('click', async () => {
  const nameInput = document.getElementById('newTagName');
  const colorInput = document.getElementById('newTagColor');
  const parentSelect = document.getElementById('newTagParent');
  const name = nameInput.value.trim();
  if (!name) return;

  const parentId = parentSelect.value ? parseInt(parentSelect.value) : null;
  const result = await window.api.createTag(name, colorInput.value, parentId);
  if (result.error) {
    alert(result.error);
    return;
  }
  nameInput.value = '';
  nameInput.placeholder = '标签名称';
  parentSelect.value = '';
  await loadAll();
  renderAll();
});

document.getElementById('newTagName').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    document.getElementById('addTagBtn').click();
  }
});

async function editTag(id, name, color, parentId) {
  const newName = prompt('编辑标签名称：', name);
  if (!newName || !newName.trim()) return;

  // Let user change parent via simple prompt
  let newParentId = null;
  const parentOpts = tags.filter(t => t.id !== id);
  if (parentOpts.length > 0) {
    const parentInput = prompt(
      '父标签ID（留空为顶级标签）：\n' +
      parentOpts.map(t => `${t.id}: ${t.name}`).join('\n'),
      parentId || ''
    );
    if (parentInput !== null && parentInput.trim()) {
      newParentId = parseInt(parentInput.trim());
      if (!parentOpts.find(t => t.id === newParentId)) newParentId = null;
    }
  }

  const result = await window.api.updateTag(id, newName.trim(), color, newParentId);
  if (result.error) {
    alert(result.error);
    return;
  }
  await loadAll();
  renderAll();
}

async function deleteTag(id) {
  if (!confirm('确定删除该标签？所有图片上的此标签将被移除，子标签会提升为顶级。')) return;
  await window.api.deleteTag(id);
  activeFilterTagIds = activeFilterTagIds.filter(tid => tid !== id);
  await loadAll();
  renderAll();
}

// --- Context menu ---
function showContextMenu(x, y) {
  contextMenu.classList.remove('hidden');
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
}

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    contextMenu.classList.add('hidden');
  }
});

contextMenu.querySelector('[data-action="tagManage"]').addEventListener('click', () => {
  contextMenu.classList.add('hidden');
  showTagManageModal(contextImageId);
});

contextMenu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
  contextMenu.classList.add('hidden');
  if (!confirm('确定删除该图片？')) return;
  await window.api.deleteImage(contextImageId);
  selectedImageIds.delete(contextImageId);
  await loadAll();
  renderAll();
});

// --- Modal ---
function showModal(title, bodyHtml) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
}

document.querySelector('.modal-close').addEventListener('click', closeModal);
document.querySelector('.modal-overlay')?.addEventListener('click', closeModal);

// --- Tag manage modal ---
async function showTagManageModal(imageId) {
  const img = images.find(i => i.id === imageId);
  if (!img) return;

  const allTags = await window.api.getTags();
  const imageTagIds = new Set(img.tags.map(t => t.id));

  // Build tree of checkboxes
  let bodyHtml = '';
  if (allTags.length === 0) {
    bodyHtml = '<p style="font-size:13px;color:var(--text-muted)">暂无标签，请先在侧边栏创建标签</p>';
  } else {
    const roots = allTags.filter(t => !t.parent_id);
    bodyHtml = '<div style="max-height:50vh;overflow-y:auto">' + buildTagCheckboxTree(roots, allTags, imageTagIds, 0) + '</div>';
  }

  showModal('管理标签 — ' + img.original_name, bodyHtml);

  modalBody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const tagId = parseInt(cb.value);
      if (cb.checked) {
        await window.api.addTagToImage(imageId, tagId);
      } else {
        await window.api.removeTagFromImage(imageId, tagId);
      }
      const idx = images.findIndex(i => i.id === imageId);
      if (idx >= 0) {
        const tagsForImg = await window.api.getImages(activeFilterTagIds.length > 0 ? activeFilterTagIds : null);
        const updated = tagsForImg.find(i => i.id === imageId);
        if (updated) {
          images[idx] = updated;
          renderImageGrid();
        }
      }
    });
  });
}

function buildTagCheckboxTree(subset, allTags, selectedSet, depth) {
  let html = '';
  for (const tag of subset) {
    html += `
      <label class="modal-tag-item" style="padding-left:${depth * 20}px">
        <input type="checkbox" value="${tag.id}" ${selectedSet.has(tag.id) ? 'checked' : ''}>
        <span class="modal-tag-color" style="background:${tag.color}"></span>
        ${escapeHtml(tag.name)}
      </label>
    `;
    const children = allTags.filter(t => t.parent_id === tag.id);
    if (children.length > 0) {
      html += buildTagCheckboxTree(children, allTags, selectedSet, depth + 1);
    }
  }
  return html;
}

// --- Random result modal ---
function showRandomModal(picked) {
  if (!picked || picked.length === 0) {
    alert('没有抽取到图片');
    return;
  }

  const bodyHtml = `
    <div class="random-results">
      ${picked.map(img => `
        <div>
          <img class="random-result-img" src="" data-load-id="${img.id}" alt="${escapeHtml(img.original_name)}">
          <div style="font-size:11px;text-align:center;margin-top:2px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(img.original_name)}</div>
        </div>
      `).join('')}
    </div>
  `;
  showModal('随机抽取结果 (' + picked.length + ' 张)', bodyHtml);

  for (const img of picked) {
    window.api.getThumbnail(img.id).then(dataUrl => {
      const el = modalBody.querySelector(`[data-load-id="${img.id}"]`);
      if (el && dataUrl) el.src = dataUrl;
    });
  }
}

// --- Preview (full-size image) ---
async function openPreview(imageId) {
  const dataUrl = await window.api.getFullImage(imageId);
  if (!dataUrl) return;

  const img = images.find(i => i.id === imageId);
  previewImage.src = dataUrl;
  previewName.textContent = img ? img.original_name : '';
  if (img) {
    previewTags.innerHTML = img.tags.map(t =>
      `<span class="image-card-tag" style="background:${t.color}">${escapeHtml(t.name)}</span>`
    ).join('');
  }
  previewModal.classList.remove('hidden');
}

function closePreview() {
  previewModal.classList.add('hidden');
  previewImage.src = '';
}

function navigatePreview(direction) {
  if (currentViewIds.length === 0) return;
  previewIndex = (previewIndex + direction + currentViewIds.length) % currentViewIds.length;
  // Update card selection
  clearSelection();
  selectedImageIds.add(currentViewIds[previewIndex]);
  openPreview(currentViewIds[previewIndex]);
  renderImageGrid();
}

document.querySelector('.preview-close').addEventListener('click', closePreview);
document.querySelector('#previewModal .modal-overlay').addEventListener('click', closePreview);
document.querySelector('.preview-prev').addEventListener('click', () => navigatePreview(-1));
document.querySelector('.preview-next').addEventListener('click', () => navigatePreview(1));

document.addEventListener('keydown', (e) => {
  if (previewModal.classList.contains('hidden')) return;
  if (e.key === 'Escape') closePreview();
  if (e.key === 'ArrowLeft') navigatePreview(-1);
  if (e.key === 'ArrowRight') navigatePreview(1);
});

// --- Settings ---
function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  document.getElementById('darkModeToggle').checked = dark;
}

function setupSettingsUI() {
  const settingsModal = document.getElementById('settingsModal');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsClose = document.getElementById('settingsModalClose');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const chooseDirBtn = document.getElementById('chooseDirBtn');
  const saveBtn = document.getElementById('settingsSaveBtn');
  const storageDirEl = document.getElementById('settingStorageDir');

  function openSettings() {
    darkModeToggle.checked = document.body.classList.contains('dark');
    storageDirEl.textContent = appSettings.storageDir || '默认位置（用户数据目录）';
    settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsModal.querySelector('.modal-overlay').addEventListener('click', closeSettings);

  darkModeToggle.addEventListener('change', () => {
    document.body.classList.toggle('dark', darkModeToggle.checked);
  });

  chooseDirBtn.addEventListener('click', async () => {
    const dir = await window.api.chooseDir();
    if (dir) {
      appSettings.storageDir = dir;
      storageDirEl.textContent = dir;
    }
  });

  saveBtn.addEventListener('click', async () => {
    appSettings.darkMode = document.body.classList.contains('dark');
    await window.api.saveSettings(appSettings);
    closeSettings();
    // If storage dir changed, future imports will use it
  });
}

// --- Utils ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
