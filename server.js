const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const archiver = require('archiver');
const mime = require('mime-types');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories
const bundleSharedRoot = path.resolve(__dirname, 'shared');
const sharedRoot = path.join(os.tmpdir(), 'node-x', 'shared');
const publicRoot = path.resolve(__dirname, 'public');

// Recursive copy helper to seed writable storage
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    if (!fs.existsSync(src)) return;
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

if (!fs.existsSync(sharedRoot)) {
    fs.mkdirSync(sharedRoot, { recursive: true });
    if (fs.existsSync(bundleSharedRoot) && bundleSharedRoot !== sharedRoot) {
        try {
            copyDirSync(bundleSharedRoot, sharedRoot);
            console.log('Seeded writable shared directory from bundle');
        } catch (err) {
            console.error('Error seeding shared directory:', err);
        }
    }
}

// Helper to validate and get safe path within sharedRoot
function getSafePath(relativePath) {
    const resolvedPath = path.resolve(sharedRoot, relativePath || '');
    if (!resolvedPath.startsWith(sharedRoot)) {
        throw new Error('Access denied: Path traversal detected');
    }
    return resolvedPath;
}

// Config Multer for dynamic file upload paths
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            const targetDir = getSafePath(req.body.path || '');
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            cb(null, targetDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// Serve static frontend files
app.use(express.static(publicRoot));
app.use(express.json());

// API: Get files and folders in a path
app.get('/api/files', (req, res) => {
    try {
        const relativePath = req.query.path || '';
        const targetPath = getSafePath(relativePath);

        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'Directory not found' });
        }

        const stat = fs.statSync(targetPath);
        if (!stat.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }

        const entries = fs.readdirSync(targetPath);
        const results = entries.map(name => {
            const entryPath = path.join(targetPath, name);
            const relativeEntryPath = path.relative(sharedRoot, entryPath).replace(/\\/g, '/');
            try {
                const entryStat = fs.statSync(entryPath);
                const isDirectory = entryStat.isDirectory();

                return {
                    name,
                    path: relativeEntryPath,
                    isDirectory,
                    size: isDirectory ? 0 : entryStat.size,
                    mtime: entryStat.mtime.toISOString(),
                    mime: isDirectory ? 'directory' : (mime.lookup(entryPath) || 'application/octet-stream')
                };
            } catch (err) {
                // Return fallback for inaccessible items
                return {
                    name,
                    path: relativeEntryPath,
                    isDirectory: false,
                    size: 0,
                    mtime: new Date().toISOString(),
                    mime: 'application/octet-stream',
                    error: 'Inaccessible'
                };
            }
        });

        // Return current breadcrumbs
        const breadcrumbs = [];
        let currentLink = '';
        const parts = relativePath.split('/').filter(Boolean);

        breadcrumbs.push({ name: 'Home', path: '' });
        parts.forEach(part => {
            currentLink = currentLink ? `${currentLink}/${part}` : part;
            breadcrumbs.push({ name: part, path: currentLink });
        });

        res.json({
            currentPath: relativePath,
            breadcrumbs,
            items: results
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Download single file
app.get('/api/download', (req, res) => {
    try {
        const relativePath = req.query.path;
        if (!relativePath) {
            return res.status(400).json({ error: 'File path is required' });
        }

        const targetPath = getSafePath(relativePath);
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            return res.status(400).json({ error: 'Cannot download a directory as a file' });
        }

        res.download(targetPath, path.basename(targetPath));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: View/Serve file inline (for previewing)
app.get('/api/view', (req, res) => {
    try {
        const relativePath = req.query.path;
        if (!relativePath) {
            return res.status(400).json({ error: 'File path is required' });
        }

        const targetPath = getSafePath(relativePath);
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            return res.status(400).json({ error: 'Cannot view a directory' });
        }

        const mimeType = mime.lookup(targetPath) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);

        // Ensure proper encoding for text and code files
        if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/javascript') {
            res.setHeader('Content-Type', `${mimeType}; charset=utf-8`);
        }

        fs.createReadStream(targetPath).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Upload files
app.post('/api/upload', upload.array('files'), (req, res) => {
    try {
        res.json({ success: true, message: 'Files uploaded successfully', files: req.files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Create new folder
app.post('/api/create-folder', (req, res) => {
    try {
        const { parentPath, folderName } = req.body;
        if (!folderName) {
            return res.status(400).json({ error: 'Folder name is required' });
        }

        // Clean folder name to prevent folder injection/traversal
        const safeFolderName = path.basename(folderName);
        const parentDir = getSafePath(parentPath || '');
        const newFolderDir = path.join(parentDir, safeFolderName);

        if (fs.existsSync(newFolderDir)) {
            return res.status(400).json({ error: 'Folder or file already exists' });
        }

        fs.mkdirSync(newFolderDir, { recursive: true });
        res.json({ success: true, message: 'Folder created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve frontend routing for direct page access
app.get('*', (req, res) => {
    res.sendFile(path.join(publicRoot, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Node-X Folder Share Server running at http://localhost:${PORT}`);
});
