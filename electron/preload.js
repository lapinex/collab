'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Флаг для веб-приложения: показывать кастомные кнопки окна
contextBridge.exposeInMainWorld('__COLLAB_DESKTOP__', true);

// API для кнопок свернуть / развернуть / закрыть
contextBridge.exposeInMainWorld('collabDesktop', {
  minimize: () => ipcRenderer.send('window-control', 'minimize'),
  maximize: () => ipcRenderer.send('window-control', 'maximize'),
  close: () => ipcRenderer.send('window-control', 'close'),
});
