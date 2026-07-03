// -------------------------------------------------------------
// Node-X Folder Share - Frontend Logic (app.js)
// -------------------------------------------------------------

// Application State
const state = {
    currentPath: '',
    items: [],
    breadcrumbs: [],
    viewType: localStorage.getItem('node-x-view-type') || 'grid', // 'grid' or 'list'
    searchQuery: '',
    isUploading: false
};

// DOM Elements
const elements = {
    explorerItems: document.getElementById('explorer-items'),
    emptyState: document.getElementById('empty-state'),
    breadcrumbs: document.getElementById('breadcrumbs'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    viewGridBtn: document.getElementById('view-grid-btn'),
    viewListBtn: document.getElementById('view-list-btn'),
    downloadZipBtn: document.getElementById('download-zip-btn'),
    newFolderBtn: document.getElementById('new-folder-btn'),
    uploadBtn: document.getElementById('upload-btn'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),

    // Progress Bar
    uploadProgressContainer: document.getElementById('upload-progress-container'),
    uploadStatusText: document.getElementById('upload-status-text'),
    uploadProgressBar: document.getElementById('upload-progress-bar'),
    uploadPercentage: document.getElementById('upload-percentage'),

    // Stats
    foldersCount: document.getElementById('folders-count'),
    filesCount: document.getElementById('files-count'),
    totalSize: document.getElementById('total-size'),

    // Folder Modal
    folderModal: document.getElementById('folder-modal'),
    folderNameInput: document.getElementById('folder-name-input'),
    confirmFolderBtn: document.getElementById('confirm-folder-btn'),
    closeModalBtns: document.querySelectorAll('.close-modal-btn'),

    // Preview Modal
    previewModal: document.getElementById('preview-modal'),
    previewFileName: document.getElementById('preview-file-name'),
    previewFileIcon: document.getElementById('preview-file-icon'),
    previewDownloadBtn: document.getElementById('preview-download-btn'),
    previewFallbackDownloadBtn: document.getElementById('preview-fallback-download-btn'),
    previewContentLoader: document.getElementById('preview-content-loader'),

    // Preview Media Elements
    previewImageContainer: document.getElementById('preview-image-container'),
    previewImg: document.getElementById('preview-img'),
    previewVideoContainer: document.getElementById('preview-video-container'),
    previewVideo: document.getElementById('preview-video'),
    previewAudioContainer: document.getElementById('preview-audio-container'),
    previewAudio: document.getElementById('preview-audio'),
    previewTextContainer: document.getElementById('preview-text-container'),
    previewTextContent: document.getElementById('preview-text-content'),
    previewIframeContainer: document.getElementById('preview-iframe-container'),
    previewIframe: document.getElementById('preview-iframe'),
    previewUnsupported: document.getElementById('preview-unsupported'),
    previewMimeType: document.getElementById('preview-mime-type'),
    closePreviewBtns: document.querySelectorAll('.close-preview-btn'),

    // Toast Container
    toastContainer: document.getElementById('toast-container')
};

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Set initial view buttons state
    if (state.viewType === 'list') {
        elements.viewGridBtn.classList.remove('active');
        elements.viewListBtn.classList.add('active');
    }

    // Load URL path if user came with a specific folder hash or subpath
    const pathFromHash = window.location.hash.substring(1);
    loadFolder(pathFromHash);

    // Set up event listeners
    initEventListeners();
});

// -------------------------------------------------------------
// Event Listeners Setup
// -------------------------------------------------------------
function initEventListeners() {
    // View switches
    elements.viewGridBtn.addEventListener('click', () => setViewType('grid'));
    elements.viewListBtn.addEventListener('click', () => setViewType('list'));

    // Navigation and path changes via popstate/hashchange
    window.addEventListener('hashchange', () => {
        const path = window.location.hash.substring(1);
        loadFolder(path);
    });

    // Search Box
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        elements.clearSearchBtn.style.display = state.searchQuery ? 'flex' : 'none';
        renderItems();
    });

    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchQuery = '';
        elements.clearSearchBtn.style.display = 'none';
        elements.searchInput.focus();
        renderItems();
    });

    // Folder Compression Download (ZIP)
    elements.downloadZipBtn.addEventListener('click', () => {
        const url = `/api/download-folder?path=${encodeURIComponent(state.currentPath)}`;
        showToast('Compressing folder, your download will start shortly...', 'success');
        window.location.href = url;
    });

    // Modals: Folder Creation
    elements.newFolderBtn.addEventListener('click', () => {
        elements.folderNameInput.value = '';
        elements.folderModal.style.display = 'flex';
        elements.folderNameInput.focus();
    });

    elements.closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.folderModal.style.display = 'none';
        });
    });

    elements.confirmFolderBtn.addEventListener('click', createFolder);
    elements.folderNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createFolder();
    });

    // File Upload Handlers
    elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFiles(e.target.files);
        }
    });

    // Dropzone Drag & Drop
    elements.dropzone.addEventListener('click', () => elements.fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        elements.dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.dropzone.classList.add('drag-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        elements.dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.dropzone.classList.remove('drag-active');
        }, false);
    });

    elements.dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            uploadFiles(files);
        }
    });

    // Modals: Preview Close
    elements.closePreviewBtns.forEach(btn => {
        btn.addEventListener('click', closePreview);
    });
}

// -------------------------------------------------------------
// API Actions
// -------------------------------------------------------------

// Fetch Folder Structure
async function loadFolder(path) {
    try {
        state.currentPath = path;

        // Fetch files API
        const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        if (!response.ok) {
            throw new Error(`Failed to load directory. Status: ${response.status}`);
        }

        const data = await response.json();

        // Update states
        state.items = data.items;
        state.breadcrumbs = data.breadcrumbs;

        // Render view
        renderBreadcrumbs();
        renderItems();
        updateStats();

    } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
    }
}

// Create Subfolder
async function createFolder() {
    const folderName = elements.folderNameInput.value.trim();
    if (!folderName) {
        showToast('Folder name cannot be empty', 'error');
        return;
    }

    try {
        elements.folderModal.style.display = 'none';

        const response = await fetch('/api/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parentPath: state.currentPath,
                folderName: folderName
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to create folder');
        }

        showToast(`Folder "${folderName}" created successfully!`, 'success');
        loadFolder(state.currentPath);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Upload Files via XHR (with progress callback)
function uploadFiles(files) {
    if (state.isUploading) {
        showToast('An upload is already in progress.', 'error');
        return;
    }

    state.isUploading = true;
    elements.uploadProgressContainer.style.display = 'block';
    elements.uploadStatusText.textContent = `Uploading ${files.length} file(s)...`;
    elements.uploadProgressBar.style.width = '0%';
    elements.uploadPercentage.textContent = '0%';

    const formData = new FormData();
    formData.append('path', state.currentPath);
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            elements.uploadProgressBar.style.width = percentComplete + '%';
            elements.uploadPercentage.textContent = percentComplete + '%';
        }
    });

    // Complete / Errors
    xhr.addEventListener('load', () => {
        state.isUploading = false;
        elements.uploadProgressContainer.style.display = 'none';
        elements.fileInput.value = ''; // Reset file input

        if (xhr.status === 200) {
            showToast('Files uploaded successfully!', 'success');
            loadFolder(state.currentPath);
        } else {
            let errorMsg = 'Upload failed';
            try {
                const response = JSON.parse(xhr.responseText);
                errorMsg = response.error || errorMsg;
            } catch (err) { }
            showToast(errorMsg, 'error');
        }
    });

    xhr.addEventListener('error', () => {
        state.isUploading = false;
        elements.uploadProgressContainer.style.display = 'none';
        showToast('A network error occurred during upload.', 'error');
    });

    xhr.send(formData);
}

// -------------------------------------------------------------
// Rendering Views
// -------------------------------------------------------------

// Toggle between grid and list views
function setViewType(type) {
    state.viewType = type;
    localStorage.setItem('node-x-view-type', type);

    if (type === 'grid') {
        elements.viewGridBtn.classList.add('active');
        elements.viewListBtn.classList.remove('active');
    } else {
        elements.viewGridBtn.classList.remove('active');
        elements.viewListBtn.classList.add('active');
    }

    renderItems();
}

// Render Breadcrumb Navigation links
function renderBreadcrumbs() {
    elements.breadcrumbs.innerHTML = '';

    state.breadcrumbs.forEach((crumb, idx) => {
        // Add separator if not first item
        if (idx > 0) {
            const separator = document.createElement('div');
            separator.className = 'breadcrumb-separator';
            separator.innerHTML = '<i data-lucide="chevron-right" style="width:14px;height:14px;"></i>';
            elements.breadcrumbs.appendChild(separator);
        }

        const item = document.createElement('div');
        item.className = 'breadcrumb-item';

        // Custom branding icon for "Home"
        if (idx === 0) {
            item.innerHTML = `<i data-lucide="home" style="width:16px;height:16px;margin-right:6px;"></i> ${crumb.name}`;
        } else {
            item.textContent = crumb.name;
        }

        item.addEventListener('click', () => {
            // Set URL hash which will trigger folder load
            window.location.hash = crumb.path;
        });

        elements.breadcrumbs.appendChild(item);
    });

    lucide.createIcons();
}

// Render Files and Folders list
function renderItems() {
    elements.explorerItems.className = `explorer-items ${state.viewType}-view`;
    elements.explorerItems.innerHTML = '';

    // Filter items based on search query
    let filteredItems = state.items;
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filteredItems = state.items.filter(item => item.name.toLowerCase().includes(query));
    }

    // Sort folders first, then alphabetically by name
    filteredItems.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });

    if (filteredItems.length === 0) {
        elements.emptyState.style.display = 'flex';
        return;
    } else {
        elements.emptyState.style.display = 'none';
    }

    // List view header row
    if (state.viewType === 'list') {
        const headerRow = document.createElement('div');
        headerRow.className = 'list-header-row';
        headerRow.innerHTML = `
            <div>Name</div>
            <div>Date Modified</div>
            <div>Size</div>
            <div style="text-align: right;">Actions</div>
        `;
        elements.explorerItems.appendChild(headerRow);
    }

    // Append items
    filteredItems.forEach(item => {
        const card = document.createElement('div');
        card.className = `item-card ${item.isDirectory ? 'folder-item' : 'file-item'} ${getFileCategory(item)}`;

        // Setup direct actions mapping
        const downloadUrl = `/api/download?path=${encodeURIComponent(item.path)}`;
        const viewUrl = `/api/view?path=${encodeURIComponent(item.path)}`;

        // Date modified readable string
        const formattedDate = new Date(item.mtime).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Readable size string
        const formattedSize = item.isDirectory ? '--' : formatBytes(item.size);

        // Icon resolution
        const iconName = getFileIcon(item);

        if (state.viewType === 'grid') {
            // GRID CARD MARKUP
            card.innerHTML = `
                <div class="item-icon-wrapper">
                    <div class="item-main-icon">
                        <i data-lucide="${iconName}"></i>
                    </div>
                    <div class="item-actions">
                        ${!item.isDirectory ? `
                            <button class="item-action-btn view-action" title="Preview File">
                                <i data-lucide="eye"></i>
                            </button>
                        ` : ''}
                        <button class="item-action-btn download-action" title="Download">
                            <i data-lucide="${item.isDirectory ? 'download-cloud' : 'download'}"></i>
                        </button>
                        <button class="item-action-btn copy-action" title="Copy Share Link">
                            <i data-lucide="link"></i>
                        </button>
                    </div>
                </div>
                <div class="item-details">
                    <span class="item-name" title="${item.name}">${item.name}</span>
                    <div class="item-meta">
                        <span class="item-date">${formattedDate.split(',')[0]}</span>
                        <span class="item-size">${formattedSize}</span>
                    </div>
                </div>
            `;
        } else {
            // LIST ROW MARKUP
            card.innerHTML = `
                <div class="item-icon-wrapper">
                    <div class="item-main-icon">
                        <i data-lucide="${iconName}"></i>
                    </div>
                    <span class="item-name" title="${item.name}">${item.name}</span>
                </div>
                <div class="item-date">${formattedDate}</div>
                <div class="item-size">${formattedSize}</div>
                <div class="item-actions-wrapper">
                    <div class="item-actions">
                        ${!item.isDirectory ? `
                            <button class="item-action-btn view-action" title="Preview File">
                                <i data-lucide="eye"></i>
                            </button>
                        ` : ''}
                        <button class="item-action-btn download-action" title="Download">
                            <i data-lucide="${item.isDirectory ? 'download-cloud' : 'download'}"></i>
                        </button>
                        <button class="item-action-btn copy-action" title="Copy Share Link">
                            <i data-lucide="link"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        // Card navigation / click handlers
        card.addEventListener('click', (e) => {
            // Prevent triggers if click was on buttons
            if (e.target.closest('.item-action-btn')) return;

            if (item.isDirectory) {
                window.location.hash = item.path;
            } else {
                openPreview(item);
            }
        });

        // Bind inner actions button events
        const viewBtn = card.querySelector('.view-action');
        if (viewBtn) {
            viewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openPreview(item);
            });
        }

        const downloadBtn = card.querySelector('.download-action');
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.isDirectory) {
                window.location.href = `/api/download-folder?path=${encodeURIComponent(item.path)}`;
                showToast(`Compressing and downloading folder "${item.name}"...`, 'success');
            } else {
                window.location.href = downloadUrl;
            }
        });

        const copyBtn = card.querySelector('.copy-action');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const absoluteLink = `${window.location.origin}${item.isDirectory ? '/#' + item.path : downloadUrl}`;
            navigator.clipboard.writeText(absoluteLink).then(() => {
                showToast('Link copied to clipboard!', 'success');
            }).catch(() => {
                showToast('Failed to copy link', 'error');
            });
        });

        elements.explorerItems.appendChild(card);
    });

    // Re-initialize Lucide Icons for dynamic content
    lucide.createIcons();
}

// Update Footer Stats
function updateStats() {
    let folders = 0;
    let files = 0;
    let bytes = 0;

    state.items.forEach(item => {
        if (item.isDirectory) {
            folders++;
        } else {
            files++;
            bytes += item.size;
        }
    });

    elements.foldersCount.textContent = `${folders} Folder${folders !== 1 ? 's' : ''}`;
    elements.filesCount.textContent = `${files} File${files !== 1 ? 's' : ''}`;
    elements.totalSize.textContent = formatBytes(bytes);
}

// -------------------------------------------------------------
// File Preview Logic
// -------------------------------------------------------------

// Open Preview Modal
async function openPreview(item) {
    elements.previewModal.style.display = 'flex';
    elements.previewFileName.textContent = item.name;
    elements.previewFileIcon.setAttribute('data-lucide', getFileIcon(item));
    lucide.createIcons();

    // Configure download action in modal
    const downloadUrl = `/api/download?path=${encodeURIComponent(item.path)}`;
    elements.previewDownloadBtn.onclick = () => window.location.href = downloadUrl;
    elements.previewFallbackDownloadBtn.onclick = () => window.location.href = downloadUrl;

    // Reset view states
    resetPreviewModal();
    elements.previewContentLoader.style.display = 'flex';

    const viewUrl = `/api/view?path=${encodeURIComponent(item.path)}`;
    const category = getFileCategory(item);

    try {
        if (category === 'image') {
            elements.previewImg.src = viewUrl;
            elements.previewImg.onload = () => {
                elements.previewContentLoader.style.display = 'none';
                elements.previewImageContainer.style.display = 'flex';
            };
            elements.previewImg.onerror = () => {
                throw new Error('Could not load image');
            };
        } else if (category === 'video') {
            elements.previewVideo.src = viewUrl;
            elements.previewVideo.load();
            elements.previewVideo.oncanplay = () => {
                elements.previewContentLoader.style.display = 'none';
                elements.previewVideoContainer.style.display = 'flex';
            };
        } else if (category === 'audio') {
            elements.previewAudio.src = viewUrl;
            elements.previewAudio.load();
            elements.previewAudio.oncanplay = () => {
                elements.previewContentLoader.style.display = 'none';
                elements.previewAudioContainer.style.display = 'flex';
            };
        } else if (category === 'pdf') {
            elements.previewIframe.src = viewUrl;
            elements.previewContentLoader.style.display = 'none';
            elements.previewIframeContainer.style.display = 'block';
        } else if (category === 'code' || category === 'text') {
            const res = await fetch(viewUrl);
            if (!res.ok) throw new Error('Could not fetch text content');
            const txt = await res.text();

            elements.previewTextContent.textContent = txt;
            elements.previewContentLoader.style.display = 'none';
            elements.previewTextContainer.style.display = 'block';
        } else {
            // Unsupported preview fallback
            elements.previewContentLoader.style.display = 'none';
            elements.previewMimeType.textContent = item.mime;
            elements.previewUnsupported.style.display = 'flex';
        }
    } catch (err) {
        elements.previewContentLoader.style.display = 'none';
        elements.previewMimeType.textContent = item.mime;
        elements.previewUnsupported.style.display = 'flex';
        showToast(err.message, 'error');
    }
}

// Reset modal containers
function resetPreviewModal() {
    // Stop any video or audio that was playing
    elements.previewVideo.pause();
    elements.previewVideo.src = '';
    elements.previewAudio.pause();
    elements.previewAudio.src = '';

    // Hide containers
    elements.previewImageContainer.style.display = 'none';
    elements.previewVideoContainer.style.display = 'none';
    elements.previewAudioContainer.style.display = 'none';
    elements.previewTextContainer.style.display = 'none';
    elements.previewIframeContainer.style.display = 'none';
    elements.previewUnsupported.style.display = 'none';

    // Empty sources
    elements.previewImg.src = '';
    elements.previewIframe.src = '';
    elements.previewTextContent.textContent = '';
}

// Close preview modal
function closePreview() {
    elements.previewModal.style.display = 'none';
    resetPreviewModal();
}

// -------------------------------------------------------------
// Helper Functions
// -------------------------------------------------------------

// Helper to categorize files for appropriate previews
function getFileCategory(item) {
    if (item.isDirectory) return 'directory';

    const name = item.name.toLowerCase();
    const ext = name.split('.').pop();
    const mimeType = item.mime ? item.mime.toLowerCase() : '';

    if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
        return 'image';
    }
    if (mimeType.startsWith('video/') || ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv'].includes(ext)) {
        return 'video';
    }
    if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
        return 'audio';
    }
    if (mimeType === 'application/pdf' || ext === 'pdf') {
        return 'pdf';
    }
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) {
        return 'document';
    }
    if (['json', 'js', 'html', 'css', 'md', 'xml', 'sh', 'py', 'bat', 'c', 'cpp', 'h', 'ts', 'java', 'go', 'rs', 'sql', 'php'].includes(ext)) {
        return 'code';
    }
    if (mimeType.startsWith('text/') || ext === 'txt') {
        return 'text';
    }
    return 'unsupported';
}

// Resolve icon name based on directory/file details
function getFileIcon(item) {
    if (item.isDirectory) return 'folder';

    const category = getFileCategory(item);
    switch (category) {
        case 'image': return 'file-image';
        case 'video': return 'file-video';
        case 'audio': return 'file-audio';
        case 'pdf': return 'file-text';
        case 'document': return 'file-type-2';
        case 'code': return 'file-code';
        case 'text': return 'file-text';
        default: return 'file';
    }
}

// Format bytes size to human-readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Toast Notifications System
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
    toast.innerHTML = `
        <i data-lucide="${iconName}" style="width:20px;height:20px;flex-shrink:0;"></i>
        <span class="toast-message">${message}</span>
    `;

    elements.toastContainer.appendChild(toast);
    lucide.createIcons();

    // Auto fade out & remove
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
}
