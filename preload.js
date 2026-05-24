const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  importImages: () => ipcRenderer.invoke('image:import'),
  importPaths: (filePaths) => ipcRenderer.invoke('image:importPaths', filePaths),
  getImages: (tagIds) => ipcRenderer.invoke('image:getAll', tagIds),
  getThumbnail: (id) => ipcRenderer.invoke('image:getThumbnail', id),
  getFullImage: (id) => ipcRenderer.invoke('image:getFull', id),
  deleteImage: (id) => ipcRenderer.invoke('image:delete', id),

  getTags: () => ipcRenderer.invoke('tag:getAll'),
  createTag: (name, color, parentId) => ipcRenderer.invoke('tag:create', name, color, parentId),
  updateTag: (id, name, color, parentId) => ipcRenderer.invoke('tag:update', id, name, color, parentId),
  deleteTag: (id) => ipcRenderer.invoke('tag:delete', id),

  addTagToImage: (imageId, tagId) => ipcRenderer.invoke('image:addTag', imageId, tagId),
  removeTagFromImage: (imageId, tagId) => ipcRenderer.invoke('image:removeTag', imageId, tagId),

  randomPick: (imageIds, count) => ipcRenderer.invoke('image:randomPick', imageIds, count),
  exportPdf: (imageIds) => ipcRenderer.invoke('pdf:export', imageIds),
});
