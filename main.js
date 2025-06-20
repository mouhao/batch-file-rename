const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const RenameEngine = require('./src/js/rename-engine');

// 保持窗口对象的全局引用
let mainWindow;

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'src/assets/icons/rename.ico'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false // 先不显示，等待页面加载完成
  });

  // 加载 index.html
  const htmlPath = path.join(__dirname, 'src/index.html');
  console.log('Loading HTML from:', htmlPath);
  mainWindow.loadFile(htmlPath);
  
  // 在 Windows 和 Linux 上移除菜单栏
  if (process.platform !== 'darwin') {
    mainWindow.setMenu(null);
  }

  // 强制禁用缓存
  mainWindow.webContents.session.clearCache();

  // 窗口准备显示时显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 开发模式下打开开发者工具
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // 当窗口被关闭时，取消引用窗口对象
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron 初始化完成后创建窗口
app.whenReady().then(createWindow);

// 当全部窗口关闭时退出
app.on('window-all-closed', () => {
  // 在 macOS 上，除非用户用 Cmd + Q 确定地退出，
  // 否则绝大部分应用及其菜单栏会保持激活
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // 在macOS上，当单击dock图标并且没有其他窗口打开时，
  // 通常在应用程序中重新创建一个窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC 通信处理

// 选择文件对话框
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: '选择要重命名的文件'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, files: [] };
  }

  try {
    const files = await processFilePaths(result.filePaths);
    return { success: true, files: files };
  } catch (error) {
    console.error('处理选择的文件时出错:', error);
    return { success: false, error: error.message, files: [] };
  }
});

// 选择文件夹对话框
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
    title: '选择要重命名的文件夹'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, files: [] };
  }

  try {
    const files = await processFilePaths(result.filePaths);
    return { success: true, files: files };
  } catch (error) {
    console.error('处理选择的文件夹时出错:', error);
    return { success: false, error: error.message, files: [] };
  }
});

// 处理文件路径列表（用于拖拽和选择）
ipcMain.handle('process-files', async (event, filePaths) => {
  try {
    const files = await processFilePaths(filePaths);
    return { success: true, files: files };
  } catch (error) {
    console.error('处理文件路径时出错:', error);
    return { success: false, error: error.message, files: [] };
  }
});

// 处理文件路径的通用函数
async function processFilePaths(filePaths) {
  const allFiles = [];

  for (const selectedPath of filePaths) {
    try {
      const stats = await fs.stat(selectedPath);
      
      if (stats.isFile()) {
        // 如果是文件，直接添加
        allFiles.push({
          path: selectedPath,
          name: path.basename(selectedPath),
          size: stats.size,
          mtime: stats.mtime.getTime()
        });
      } else if (stats.isDirectory()) {
        // 如果是文件夹，递归获取所有文件
        const folderFiles = await getAllFilesInDirectory(selectedPath);
        allFiles.push(...folderFiles);
      }
    } catch (error) {
      console.error(`无法获取文件/文件夹信息: ${selectedPath}`, error);
    }
  }

  return allFiles;
}

// 递归获取文件夹中的所有文件
async function getAllFilesInDirectory(dirPath) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        files.push({
          path: fullPath,
          name: entry.name,
          size: stats.size,
          mtime: stats.mtime.getTime()
        });
      } else if (entry.isDirectory()) {
        // 递归处理子文件夹
        const subFiles = await getAllFilesInDirectory(fullPath);
        files.push(...subFiles);
      }
    }
  } catch (error) {
    console.error(`读取文件夹失败: ${dirPath}`, error);
  }
  
  return files;
}

// 处理拖拽文件夹
ipcMain.handle('get-folder-files', async (event, folderPath) => {
  try {
    return await getAllFilesInDirectory(folderPath);
  } catch (error) {
    console.error('获取文件夹文件失败:', error);
    return null;
  }
});

// 批量重命名文件
ipcMain.handle('rename-files', async (event, { files, options }) => {
  if (!files || !options) {
    return { success: false, error: '无效的参数' };
  }

  // 使用引擎生成所有重命名操作
  const renameOperations = RenameEngine.generatePreview(files, options)
    .filter(op => op.hasChange) // 只处理有变化的文件
    .map(op => ({
      oldPath: files.find(f => f.name === op.originalName)?.path,
      newName: op.newName,
      originalName: op.originalName
    }));

  let successCount = 0;
  const updatedFiles = [...files];
  const pathMapping = {}; // 记录路径映射关系

  for (const operation of renameOperations) {
    const { oldPath, newName, originalName } = operation;
    if (!oldPath) {
        console.error('找不到原始路径:', operation);
        continue;
    }

    const newPath = path.join(path.dirname(oldPath), newName);

    try {
      await fs.rename(oldPath, newPath);
      const stats = await fs.stat(newPath);
      
      // 记录路径映射
      pathMapping[oldPath] = newPath;
      
      // 更新成功的文件信息
      const fileIndex = updatedFiles.findIndex(f => f.path === oldPath);
      if (fileIndex !== -1) {
          updatedFiles[fileIndex] = {
              path: newPath,
              name: newName,
              size: stats.size,
              mtime: stats.mtime.getTime()
          };
      }
      successCount++;
    } catch (error) {
      console.error(`重命名失败: ${oldPath} -> ${newPath}`, error);
      // 在这里可以决定是否要将错误信息返回给前端
    }
  }

  return { 
    success: true, 
    count: successCount, 
    updatedFiles,
    pathMapping // 返回路径映射关系
  };
});

// 检查文件是否存在
ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

// 显示消息对话框
ipcMain.handle('show-message', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

// 修复Windows下的焦点问题 - 模拟窗口焦点离开和回归
ipcMain.handle('fix-windows-focus-issue', async () => {
  if (process.platform === 'win32' && mainWindow) {
    try {
      // 让窗口失去焦点
      mainWindow.blur();
      
      // 短暂延迟后重新获取焦点
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.focus();
        }
      }, 200);
      
      return { success: true };
    } catch (error) {
      console.error('修复Windows焦点问题失败:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: true }; // 非Windows平台直接返回成功
});

// 处理应用程序协议（可选）
app.setAsDefaultProtocolClient('batch-file-rename'); 