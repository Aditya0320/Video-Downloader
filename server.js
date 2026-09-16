const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const downloader = require('./downloader');
const courseParser = require('./course_parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Keep track of connected SSE clients
const sseClients = new Set();

app.get('/api/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
        sseClients.delete(res);
    });
});

function broadcast(event, data) {
    const payload = JSON.stringify({ type: event, ...data });
    for (const client of sseClients) {
        try {
            client.write(`data: ${payload}\n\n`);
        } catch (e) {
            sseClients.delete(client);
        }
    }
}

downloader.on('update', (data) => broadcast('update', data));
downloader.on('progress', (data) => broadcast('progress', data));
downloader.on('course-loaded', (data) => broadcast('course-loaded', data));

// API Routes
app.get('/api/lessons', (req, res) => {
    res.json(downloader.getCourseSummary());
});

app.post('/api/load-course', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Please provide a valid course URL' });
    }

    try {
        console.log(`[API] Loading course from URL: ${url}`);
        const summary = await downloader.loadCourseByUrl(url);
        res.json({ success: true, ...summary });
    } catch (err) {
        console.error('[API Error] Failed to load course:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/saved-courses', (req, res) => {
    try {
        const list = courseParser.getSavedCourses();
        res.json(list);
    } catch (e) {
        res.json([]);
    }
});

// Set custom destination folder directly
app.post('/api/set-folder', (req, res) => {
    const { folder } = req.body;
    if (!folder) {
        return res.status(400).json({ error: 'Folder path is required' });
    }

    try {
        const newDir = downloader.setCustomDownloadDir(folder);
        res.json({ success: true, downloadDir: newDir });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Open native Windows folder browser dialog via PowerShell
app.post('/api/browse-folder', (req, res) => {
    const scriptPath = path.join(__dirname, 'browse_folder.ps1');
    const psCmd = `powershell.exe -NoProfile -Sta -ExecutionPolicy Bypass -File "${scriptPath}"`;

    exec(psCmd, { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('Folder picker error:', err, stderr);
            return res.status(500).json({ error: 'Could not open folder picker window' });
        }
        const selected = stdout.trim();
        if (selected) {
            try {
                const newDir = downloader.setCustomDownloadDir(selected);
                return res.json({ success: true, folder: newDir });
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        }
        res.json({ success: false, cancelled: true });
    });
});

app.post('/api/download', (req, res) => {
    const { lessonNumbers, quality } = req.body;
    if (!Array.isArray(lessonNumbers) || lessonNumbers.length === 0) {
        return res.status(400).json({ error: 'No lessons specified' });
    }

    downloader.addToQueue(lessonNumbers, quality || '1080');
    res.json({ success: true, queued: lessonNumbers });
});

app.post('/api/download-transcripts', async (req, res) => {
    try {
        const count = await downloader.downloadAllTranscripts();
        res.json({ success: true, count });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/cancel', (req, res) => {
    const { all } = req.body;
    if (all) {
        downloader.stopAll();
    } else {
        downloader.cancelCurrent();
    }
    res.json({ success: true });
});

app.post('/api/open-folder', (req, res) => {
    const downloadDir = downloader.downloadDir;
    // Explorer returns code 1 even when opening successfully, so treat as success
    exec(`powershell.exe -NoProfile -Command "Invoke-Item -Path '${downloadDir}'"`, () => {
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`BiblicalTraining Universal Downloader Server running on http://localhost:${PORT}`);
    console.log(`Active course: ${downloader.course.title}`);
    console.log(`Target save folder: ${downloader.downloadDir}`);
});
