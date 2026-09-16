const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const downloader = require('./downloader');

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

// API Routes
app.get('/api/lessons', (req, res) => {
    const lessons = downloader.getLessons();
    const completedCount = lessons.filter(l => l.statusInfo.status === 'completed').length;
    const totalSize = lessons.reduce((acc, l) => acc + (l.statusInfo.size || 0), 0);
    const transcriptCount = lessons.filter(l => l.statusInfo.transcriptExists).length;

    res.json({
        targetDir: downloader.downloadDir,
        totalLessons: lessons.length,
        completedCount,
        transcriptCount,
        totalSize,
        queue: downloader.queue,
        currentTask: downloader.currentTask,
        isProcessing: downloader.isProcessing,
        quality: downloader.quality,
        lessons
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
    exec(`explorer.exe "${downloadDir}"`, (err) => {
        if (err) {
            console.error('Failed to open explorer:', err);
            return res.status(500).json({ error: 'Failed to open folder' });
        }
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`BiblicalTraining Video Downloader Server running on http://localhost:${PORT}`);
    console.log(`Target save folder: ${downloader.downloadDir}`);
});
