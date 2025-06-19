/**
 * 渲染进程主文件 - 界面交互逻辑
 */
const { ipcRenderer } = require('electron');
const path = require('path');

class FileRenameApp {
    constructor() {
        this.files = [];
        this.selectedFiles = new Set();
        this.currentTab = 'tab-replace';
        
        // 拖拽相关状态
        this.draggedIndex = null;
        this.dragOverIndex = null;
        
        // 等待 DOM 完全加载后再初始化
        document.addEventListener('DOMContentLoaded', () => {
            this.init();
        });
    }
    
    init() {
        this.initializeEventListeners();
        this.switchTab(this.currentTab);
        this.updateReplaceModeUI();
        this.updatePreview();
    }

    initializeEventListeners() {
        // 基础事件监听器
        document.getElementById('addBtn').addEventListener('click', () => this.addFiles());
        document.getElementById('removeBtn').addEventListener('click', () => this.removeSelectedFiles());
        document.getElementById('renameBtn').addEventListener('click', () => this.performRename());
        
        // 标签页切换
        document.querySelectorAll('.tab-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // 全选复选框
        document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });
        
        // 设置变化监听器
        this.setupSettingsListeners();
        
        // 拖放文件
        this.setupDropZone();
    }

    setupSettingsListeners() {
        // 文字替换设置
        document.querySelectorAll('input[name="replaceMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateReplaceModeUI();
                this.updatePreview();
            });
        });
        document.getElementById('onlyChapterNumbers').addEventListener('change', () => {
            this.updatePreview();
        });
        document.getElementById('textToReplace').addEventListener('input', () => {
            this.debounceUpdatePreview();
        });
        document.getElementById('replacementText').addEventListener('input', () => {
            this.debounceUpdatePreview();
        });
        
        // 添加文本设置
        document.querySelectorAll('input[name="textPosition"]').forEach(radio => {
            radio.addEventListener('change', () => this.updatePreview());
        });
        document.getElementById('textInput').addEventListener('input', () => {
            this.debounceUpdatePreview();
        });
        
        // 数字索引设置
        document.querySelectorAll('input[name="indexPosition"]').forEach(radio => {
            radio.addEventListener('change', () => this.updatePreview());
        });
        document.getElementById('startNumber').addEventListener('input', () => {
            this.debounceUpdatePreview();
        });
        document.getElementById('digits').addEventListener('input', () => {
            this.debounceUpdatePreview();
        });
        document.getElementById('separator').addEventListener('input', () => {
            this.debounceUpdatePreview();
        });
    }

    updateReplaceModeUI() {
        const replaceMode = document.querySelector('input[name="replaceMode"]:checked').value;
        const chineseNumeralSettings = document.getElementById('chinese-numeral-settings');
        const customTextSettings = document.getElementById('custom-text-settings');

        if (replaceMode === 'chinese_numeral') {
            chineseNumeralSettings.style.display = 'block';
            customTextSettings.style.display = 'none';
        } else { // custom_text
            chineseNumeralSettings.style.display = 'none';
            customTextSettings.style.display = 'block';
        }
    }

    setupDropZone() {
        const fileList = document.getElementById('fileList');
        
        // 防止默认拖放行为
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            fileList.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // 拖放文件到应用
        fileList.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                this.handleDroppedFiles(files);
            }
        });
    }

    async handleDroppedFiles(droppedFiles) {
        const filePaths = droppedFiles.map(file => file.path);
        try {
            const result = await ipcRenderer.invoke('process-files', filePaths);
            if (result.success) {
                this.addFilesToList(result.files);
            } else {
                console.error('处理文件失败:', result.error);
            }
        } catch (error) {
            console.error('处理拖放文件时出错:', error);
        }
    }

    async addFiles() {
        try {
            const result = await ipcRenderer.invoke('select-files');
            if (result.success) {
                this.addFilesToList(result.files);
            }
        } catch (error) {
            console.error('选择文件时出错:', error);
        }
    }

    addFilesToList(newFiles) {
        console.log('添加文件:', newFiles.length, '个文件');
        
        // 过滤掉已存在的文件（基于路径）
        const existingPaths = new Set(this.files.map(f => f.path));
        const uniqueFiles = newFiles.filter(file => !existingPaths.has(file.path));
        
        console.log('新增文件:', uniqueFiles.length, '个文件');
        
        this.files.push(...uniqueFiles);
        this.renderFileList();
        
        // 如果这是第一次添加文件，自动选中所有文件并激活预览
        if (this.files.length === uniqueFiles.length) {
            console.log('首次添加文件，自动全选');
            // 全选所有文件
            this.files.forEach(file => {
                this.selectedFiles.add(file.path);
            });
            this.renderFileList(); // 重新渲染以显示选中状态
        }
        
        console.log('当前选中文件数:', this.selectedFiles.size);
        this.updatePreview();
    }

    renderFileList() {
        const fileList = document.getElementById('fileList');
        
        if (this.files.length === 0) {
            fileList.innerHTML = '<div class="empty-state"><p>请拖放文件或点击"添加"按钮</p></div>';
            this.updateSelectAllCheckbox();
            return;
        }

        fileList.innerHTML = this.files.map((file, index) => {
            const isSelected = this.selectedFiles.has(file.path);
            return `
                <div class="file-item ${isSelected ? 'selected' : ''}" 
                     data-index="${index}" 
                     data-path="${file.path}"
                     draggable="true">
                    <div class="drag-handle"></div>
                    <div class="file-select">
                        <input type="checkbox" ${isSelected ? 'checked' : ''}>
                    </div>
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-size">${this.formatFileSize(file.size)}</div>
                    <div class="file-modified">${this.formatModifiedTime(file.mtime)}</div>
                </div>
            `;
        }).join('');

        this.setupFileItemListeners();
        this.updateSelectAllCheckbox();
    }

    setupFileItemListeners() {
        document.querySelectorAll('.file-item').forEach((item) => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const filePath = item.dataset.path;
            const index = parseInt(item.dataset.index);

            // 整行点击
            item.addEventListener('click', (e) => {
                if (e.target.closest('.drag-handle')) return;
                this.toggleFileSelection(filePath);
            });
            
            // 复选框点击
            checkbox.addEventListener('change', () => {
                 this.toggleFileSelection(filePath, true);
            });
            
            // 拖拽事件
            this.setupDragEvents(item, index);
        });
    }

    setupDragEvents(item, index) {
        const dragHandle = item.querySelector('.drag-handle');

        item.addEventListener('dragstart', (e) => {
            // 通过坐标精确判断拖拽是否从手柄开始
            const handleRect = dragHandle.getBoundingClientRect();
            if (
                e.clientX < handleRect.left || e.clientX > handleRect.right ||
                e.clientY < handleRect.top || e.clientY > handleRect.bottom
            ) {
                e.preventDefault(); // 如果不是从手柄开始，则取消拖拽
                return;
            }

            // 合法的拖拽操作
            this.draggedIndex = index;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index.toString());
            
            // 使用setTimeout确保浏览器有时间渲染拖拽快照
            setTimeout(() => item.classList.add('dragging'), 0);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            this.clearDragOver();
            this.draggedIndex = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedIndex === null || this.draggedIndex === index) return;
            
            this.clearDragOver();
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', (e) => {
            if (!item.contains(e.relatedTarget)) {
                item.classList.remove('drag-over');
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            this.clearDragOver();
            if (this.draggedIndex !== null && this.draggedIndex !== index) {
                this.reorderFiles(this.draggedIndex, index);
            }
        });
    }

    clearDragOver() {
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('drag-over');
        });
    }

    reorderFiles(fromIndex, toIndex) {
        // 移动文件在数组中的位置
        const [movedFile] = this.files.splice(fromIndex, 1);
        this.files.splice(toIndex, 0, movedFile);
        
        // 重新渲染列表和预览
        this.renderFileList();
        this.updatePreview();
    }

    removeSelectedFiles() {
        this.files = this.files.filter(file => !this.selectedFiles.has(file.path));
        this.selectedFiles.clear();
        this.renderFileList();
        this.updatePreview();
    }

    toggleSelectAll(checked) {
        this.selectedFiles.clear();
        if (checked) {
            this.files.forEach(file => {
                this.selectedFiles.add(file.path);
            });
        }
        this.renderFileList();
        this.updatePreview();
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        const totalFiles = this.files.length;
        const selectedCount = this.selectedFiles.size;

        if (totalFiles > 0) {
            selectAllCheckbox.checked = totalFiles === selectedCount;
            selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalFiles;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }

    switchTab(tabId) {
        this.currentTab = tabId;

        document.querySelectorAll('.tab-link').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });

        this.updatePreview();
    }

    debounceUpdatePreview() {
        clearTimeout(this.previewDebounceTimer);
        this.previewDebounceTimer = setTimeout(() => this.updatePreview(), 300);
    }

    updatePreview() {
        if (this.selectedFiles.size === 0) {
            document.getElementById('previewContent').innerHTML = '<p class="preview-empty">选择文件并设置重命名选项后显示预览</p>';
            return;
        }

        const options = {
            mode: this.currentTab.replace('tab-', ''), // 'replace', 'text', 'index'
        };

        switch (options.mode) {
            case 'replace': {
                const replaceMode = document.querySelector('input[name="replaceMode"]:checked').value;
                options.replaceMode = replaceMode;
                if (replaceMode === 'chinese_numeral') {
                    options.onlyChapterNumbers = document.getElementById('onlyChapterNumbers').checked;
                } else { // custom_text
                    options.textToReplace = document.getElementById('textToReplace').value;
                    options.replacementText = document.getElementById('replacementText').value;
                }
                break;
            }
            case 'text':
                options.position = document.querySelector('input[name="textPosition"]:checked').value;
                options.text = document.getElementById('textInput').value;
                break;
            case 'index':
                options.position = document.querySelector('input[name="indexPosition"]:checked').value;
                options.start = parseInt(document.getElementById('startNumber').value, 10) || 0;
                options.digits = parseInt(document.getElementById('digits').value, 10) || 1;
                options.separator = document.getElementById('separator').value;
                break;
        }

        const selectedFilePaths = Array.from(this.selectedFiles);
        const filesToPreview = this.files.filter(f => selectedFilePaths.includes(f.path));

        // renameEngine is loaded globally from script tag in index.html
        const previews = renameEngine.generatePreview(filesToPreview, options);
        
        const previewContent = document.getElementById('previewContent');
        if (previews.length > 0) {
            previewContent.innerHTML = previews.map(p => `
                <div class="preview-item ${p.hasChange ? '' : 'no-change'}">
                    <div class="preview-original" title="${p.originalName}">${p.originalName}</div>
                    <div class="preview-arrow">→</div>
                    <div class="preview-new ${p.hasChange ? '' : 'no-process'}" title="${p.newName}">${p.newName}</div>
                </div>
            `).join('');
        } else {
            previewContent.innerHTML = '<p class="preview-empty">没有文件被选中或没有更改发生</p>';
        }
    }

    async performRename() {
        if (this.selectedFiles.size === 0) {
            alert('请至少选择一个文件进行重命名。');
            return;
        }

        const filesToRename = this.files.filter(f => this.selectedFiles.has(f.path));
        
        const options = {
            mode: this.currentTab.replace('tab-', ''),
        };

        switch (options.mode) {
            case 'replace': {
                const replaceMode = document.querySelector('input[name="replaceMode"]:checked').value;
                options.replaceMode = replaceMode;
                if (replaceMode === 'chinese_numeral') {
                    options.onlyChapterNumbers = document.getElementById('onlyChapterNumbers').checked;
                } else { // custom_text
                    options.textToReplace = document.getElementById('textToReplace').value;
                    options.replacementText = document.getElementById('replacementText').value;
                    if (!options.textToReplace) {
                        alert('请输入要被替换的文字。');
                        return;
                    }
                }
                break;
            }
            case 'text':
                options.position = document.querySelector('input[name="textPosition"]:checked').value;
                options.text = document.getElementById('textInput').value;
                if (!options.text) {
                    alert('请输入要添加的文本。');
                    return;
                }
                break;
            case 'index':
                options.position = document.querySelector('input[name="indexPosition"]:checked').value;
                options.start = parseInt(document.getElementById('startNumber').value, 10) || 0;
                options.digits = parseInt(document.getElementById('digits').value, 10) || 1;
                options.separator = document.getElementById('separator').value;
                break;
        }

        console.log('发起重命名请求，选项:', options);

        try {
            const result = await ipcRenderer.invoke('rename-files', {
                files: filesToRename,
                options: options
            });

            if (result.success) {
                alert(`成功重命名 ${result.count} 个文件。`);

                // 使用路径映射来更新主文件列表和选择状态
                const newSelectedFiles = new Set();
                const oldSelectedPaths = Array.from(this.selectedFiles);

                // 1. 就地更新 this.files 数组
                for (const oldPath in result.pathMapping) {
                    const newPath = result.pathMapping[oldPath];
                    const fileIndex = this.files.findIndex(f => f.path === oldPath);
                    if (fileIndex !== -1) {
                        const updatedInfo = result.updatedFiles.find(u => u.path === newPath);
                        if (updatedInfo) {
                            this.files[fileIndex] = updatedInfo;
                        }
                    }
                }

                // 2. 根据映射关系重建选择集
                oldSelectedPaths.forEach(oldPath => {
                    const newPath = result.pathMapping[oldPath];
                    if (newPath) {
                        newSelectedFiles.add(newPath); // 文件被重命名，添加新路径
                    } else {
                        newSelectedFiles.add(oldPath); // 文件未被重命名，保留旧路径
                    }
                });
                this.selectedFiles = newSelectedFiles;
                
                this.renderFileList();
                this.updatePreview();
            } else {
                alert(`重命名失败: ${result.error}`);
            }
        } catch (error) {
            console.error('重命名操作出错:', error);
            alert(`发生错误: ${error.message}`);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatModifiedTime(timestamp) {
        const date = new Date(timestamp);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${month}/${day} ${hours}:${minutes}`;
    }

    toggleFileSelection(filePath, fromCheckbox = false) {
        // 如果来自复选框，直接切换
        if(fromCheckbox){
            if (this.selectedFiles.has(filePath)) {
                this.selectedFiles.delete(filePath);
            } else {
                this.selectedFiles.add(filePath);
            }
        } else {
            // 如果来自点击行，则根据当前状态来反选
            if (this.selectedFiles.has(filePath)) {
                 this.selectedFiles.delete(filePath);
            } else {
                 this.selectedFiles.add(filePath);
            }
        }

        this.updateSelectAllCheckbox();
        this.updatePreview();
        this.renderFileList();
    }
}

// 应用启动
new FileRenameApp();