// --- State ---
let images = [];
let tags = [];
let selectedImageIds = new Set();
let activeFilterTagIds = [];

// --- DOM refs ---
const imageGrid = document.getElementById('imageGrid');
const dropZone = document.getElementById('dropZone');
const filterTagsEl = document.getElementById('filterTags');
const tagListEl = document.getElementById('tagList');
const contextMenu = document.getElementById('contextMenu');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
let contextImageId = null;

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  renderAll();
});

async function loadAll() {
  [images, tags] = await Promise.all([
    window.api.getImages(activeFilterTagIds.length > 0 ? activeFilterTagIds : null),
    window.api.getTags(),
  ]);
}

// --- Render ---
function renderAll() {
  renderFilterTags();
  renderTagList();
  renderImageGrid();
}

function renderFilterTags() {
  filterTagsEl.innerHTML = '';
  if (tags.length === 0) {
    filterTagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">暂无标签</span>';
    return;
  }
  for (const tag of tags) {
    const el = document.createElement('span');
    el.className = 'filter-tag' + (activeFilterTagIds.includes(tag.id) ? ' active' : '');
    el.textContent = tag.name;
    el.style.backgroundColor = tag.color;
    el.addEventListener('click', () => toggleFilterTag(tag.id));
    filterTagsEl.appendChild(el);
  }
}

function renderTagList() {
  tagListEl.innerHTML = '';
  if (tags.length === 0) {
    tagListEl.innerHTML = '<li style="font-size:12px;color:var(--text-muted);padding:4px 8px">暂无标签</li>';
    return;
  }
  for (const tag of tags) {
    const li = document.createElement('li');
    li.className = 'tag-list-item';
    li.innerHTML = `
      <span>
        <span class="tag-list-color" style="background:${tag.color}"></span>
        ${escapeHtml(tag.name)}
      </span>
      <span class="tag-list-actions">
        <button data-action="edit" data-id="${tag.id}" data-name="${escapeHtml(tag.name)}" data-color="${tag.color}" title="编辑">&#9998;</button>
        <button data-action="delete" data-id="${tag.id}" title="删除">&times;</button>
      </span>
    `;
    li.querySelector('[data-action="edit"]').addEventListener('click', () => editTag(tag.id, tag.name, tag.color));
    li.querySelector('[data-action="delete"]').addEventListener('click', () => deleteTag(tag.id));
    tagListEl.appendChild(li);
  }
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
      } else {
        // Clear multi-select if no ctrl
        if (selectedImageIds.size > 0) {
          clearSelection();
        }
        toggleSelect(img.id, card);
      }
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextImageId = img.id;
      showContextMenu(e.clientX, e.clientY);
    });

    imageGrid.appendChild(card);

    // Load thumbnail
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
}

function clearSelection() {
  selectedImageIds.clear();
  document.querySelectorAll('.image-card.selected').forEach(c => c.classList.remove('selected'));
}

// --- Drop zone ---
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

    const files = Array.from(e.dataTransfer.files).filter(f => /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(f.name));
    if (files.length === 0) return;

    // Electron doesn't support HTML5 file drop natively for getting paths.
    // We need to use the import button flow. Show a hint.
    // Actually, for Electron with contextIsolation, we can't read file.path.
    // We'll use a workaround: send the file to main process via a hidden flow.
    alert('请使用"导入截图"按钮导入图片');
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
  const name = nameInput.value.trim();
  if (!name) return;

  const result = await window.api.createTag(name, colorInput.value);
  if (result.error) {
    alert(result.error);
    return;
  }
  nameInput.value = '';
  await loadAll();
  renderAll();
});

// Enter key on tag name input
document.getElementById('newTagName').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    document.getElementById('addTagBtn').click();
  }
});

async function editTag(id, name, color) {
  const newName = prompt('编辑标签名称：', name);
  if (!newName || !newName.trim()) return;
  const result = await window.api.updateTag(id, newName.trim(), color);
  if (result.error) {
    alert(result.error);
    return;
  }
  await loadAll();
  renderAll();
}

async function deleteTag(id) {
  if (!confirm('确定删除该标签？所有图片上的此标签将被移除。')) return;
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
document.querySelector('.modal-overlay').addEventListener('click', closeModal);

// --- Tag manage modal ---
async function showTagManageModal(imageId) {
  const img = images.find(i => i.id === imageId);
  if (!img) return;

  const allTags = await window.api.getTags();
  const imageTagIds = new Set(img.tags.map(t => t.id));

  let bodyHtml = '';
  if (allTags.length === 0) {
    bodyHtml = '<p style="font-size:13px;color:var(--text-muted)">暂无标签，请先在侧边栏创建标签</p>';
  } else {
    bodyHtml = allTags.map(t => `
      <label class="modal-tag-item">
        <input type="checkbox" value="${t.id}" ${imageTagIds.has(t.id) ? 'checked' : ''}>
        <span class="modal-tag-color" style="background:${t.color}"></span>
        ${escapeHtml(t.name)}
      </label>
    `).join('');
  }

  showModal('管理标签 — ' + img.original_name, bodyHtml);

  // Bind checkbox changes
  modalBody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const tagId = parseInt(cb.value);
      if (cb.checked) {
        await window.api.addTagToImage(imageId, tagId);
      } else {
        await window.api.removeTagFromImage(imageId, tagId);
      }
      // Refresh local state
      const updated = await window.api.getImages(activeFilterTagIds.length > 0 ? activeFilterTagIds : null);
      const idx = images.findIndex(i => i.id === imageId);
      const updatedImg = updated.find(i => i.id === imageId);
      if (idx >= 0 && updatedImg) {
        images[idx] = updatedImg;
        renderImageGrid();
      }
    });
  });
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

  // Load thumbnails
  for (const img of picked) {
    window.api.getThumbnail(img.id).then(dataUrl => {
      const el = modalBody.querySelector(`[data-load-id="${img.id}"]`);
      if (el && dataUrl) el.src = dataUrl;
    });
  }
}

// --- Utils ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
