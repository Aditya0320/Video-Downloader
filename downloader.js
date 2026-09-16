const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');

function cleanHtmlToText(html) {
    if (!html) return '';
    let text = html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ');

    text = text
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\uFFFD/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return text;
}

class DownloaderEngine extends EventEmitter {
    constructor() {
        super();
        // Target folder specified by user
        this.downloadDir = 'D:\\Survey of the Old Testament';
        if (!fs.existsSync(this.downloadDir)) {
            try {
                fs.mkdirSync(this.downloadDir, { recursive: true });
            } catch (e) {
                console.error('Could not create directory on D:, falling back to local downloads', e);
                this.downloadDir = path.join(__dirname, 'downloads');
                if (!fs.existsSync(this.downloadDir)) fs.mkdirSync(this.downloadDir, { recursive: true });
            }
        }

        this.lessonsFile = path.join(__dirname, 'all_lessons.json');
        this.lessons = JSON.parse(fs.readFileSync(this.lessonsFile, 'utf8'));

        // Current queue and state
        this.queue = [];
        this.isProcessing = false;
        this.currentTask = null;
        this.activeProcess = null;
        this.quality = '1080'; // 1080, 720, 480

        // Per-lesson runtime status map
        this.lessonStatus = {};
        this.initializeStatus();
    }

    getVideoFilename(lesson) {
        const numStr = String(lesson.lessonNumber).padStart(2, '0');
        const cleanTitle = lesson.title.trim().replace(/[\\/:*?"<>|]/g, '_');
        return `BT504 - Lesson ${numStr} - ${cleanTitle}.mp4`;
    }

    getTranscriptFilename(lesson) {
        const numStr = String(lesson.lessonNumber).padStart(2, '0');
        const cleanTitle = lesson.title.trim().replace(/[\\/:*?"<>|]/g, '_');
        return `BT504 - Lesson ${numStr} - ${cleanTitle}.txt`;
    }

    initializeStatus() {
        for (const lesson of this.lessons) {
            const videoFilename = this.getVideoFilename(lesson);
            const transcriptFilename = this.getTranscriptFilename(lesson);
            const videoPath = path.join(this.downloadDir, videoFilename);
            const transcriptPath = path.join(this.downloadDir, transcriptFilename);

            const videoExists = fs.existsSync(videoPath);
            let size = 0;
            if (videoExists) {
                try {
                    size = fs.statSync(videoPath).size;
                } catch (e) {}
            }

            const isVideoComplete = videoExists && size > 1024 * 1024;
            const transcriptExists = fs.existsSync(transcriptPath);

            this.lessonStatus[lesson.lessonNumber] = {
                lessonNumber: lesson.lessonNumber,
                title: lesson.title.trim(),
                vimeoId: lesson.vimeoId,
                filename: videoFilename,
                transcriptFilename: transcriptFilename,
                transcriptExists: transcriptExists,
                status: isVideoComplete ? 'completed' : 'idle',
                progress: isVideoComplete ? 100 : 0,
                speed: '',
                eta: '',
                size: size,
                error: null
            };
        }
    }

    getLessons() {
        for (const lesson of this.lessons) {
            const current = this.lessonStatus[lesson.lessonNumber];
            if (current.status !== 'downloading' && current.status !== 'muxing' && current.status !== 'queued') {
                const videoPath = path.join(this.downloadDir, current.filename);
                if (fs.existsSync(videoPath)) {
                    const size = fs.statSync(videoPath).size;
                    if (size > 1024 * 1024) {
                        current.status = 'completed';
                        current.progress = 100;
                        current.size = size;
                    }
                }
            }
            const transcriptPath = path.join(this.downloadDir, current.transcriptFilename);
            current.transcriptExists = fs.existsSync(transcriptPath);
        }

        return this.lessons.map(l => ({
            ...l,
            title: l.title.trim(),
            filename: this.getVideoFilename(l),
            transcriptFilename: this.getTranscriptFilename(l),
            statusInfo: this.lessonStatus[l.lessonNumber]
        }));
    }

    async downloadTranscript(lesson) {
        const transcriptFilename = this.getTranscriptFilename(lesson);
        const targetFile = path.join(this.downloadDir, transcriptFilename);

        try {
            const apiUrl = `https://back.biblicaltraining.org/jsonapi/node/lesson/${lesson.lessonId}`;
            const res = await fetch(apiUrl);
            if (!res.ok) {
                return false;
            }

            const json = await res.json();
            const transcriptHtml = json.data?.attributes?.field_transcript?.value || '';
            const outlineHtml = json.data?.attributes?.field_outline?.value || '';

            if (!transcriptHtml && !outlineHtml) {
                return false;
            }

            const cleanOutline = cleanHtmlToText(outlineHtml);
            const cleanTranscript = cleanHtmlToText(transcriptHtml);

            const numStr = String(lesson.lessonNumber).padStart(2, '0');
            let content = `================================================================================\n`;
            content += `COURSE: Survey of Biblical Theology (BT504)\n`;
            content += `LESSON ${numStr}: ${lesson.title.trim()}\n`;
            content += `INSTRUCTOR: Dr. Thomas Schreiner\n`;
            content += `================================================================================\n\n`;

            if (cleanOutline) {
                content += `--------------------------------------------------------------------------------\n`;
                content += `LESSON OUTLINE\n`;
                content += `--------------------------------------------------------------------------------\n\n`;
                content += `${cleanOutline}\n\n`;
            }

            if (cleanTranscript) {
                content += `--------------------------------------------------------------------------------\n`;
                content += `TRANSCRIPT\n`;
                content += `--------------------------------------------------------------------------------\n\n`;
                content += `${cleanTranscript}\n`;
            }

            fs.writeFileSync(targetFile, content, 'utf8');
            this.lessonStatus[lesson.lessonNumber].transcriptExists = true;
            this.emit('update', { lessonNumber: lesson.lessonNumber, ...this.lessonStatus[lesson.lessonNumber] });
            return true;
        } catch (err) {
            console.error(`[Transcript Error] Lesson ${lesson.lessonNumber}:`, err.message);
            return false;
        }
    }

    async downloadAllTranscripts() {
        let count = 0;
        for (const lesson of this.lessons) {
            const ok = await this.downloadTranscript(lesson);
            if (ok) count++;
        }
        return count;
    }

    async getVimeoHlsUrl(vimeoId) {
        const configUrl = `https://player.vimeo.com/video/${vimeoId}/config`;
        const res = await fetch(configUrl, {
            headers: {
                'Referer': 'https://www.biblicaltraining.org/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!res.ok) {
            throw new Error(`Failed to fetch Vimeo player config (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (!data.request || !data.request.files || !data.request.files.hls) {
            throw new Error('No HLS stream found in Vimeo configuration');
        }

        const hls = data.request.files.hls;
        const cdn = hls.default_cdn || Object.keys(hls.cdns)[0];
        const hlsUrl = hls.cdns[cdn]?.url;

        if (!hlsUrl) {
            throw new Error(`Could not obtain HLS URL for CDN ${cdn}`);
        }

        return hlsUrl;
    }

    addToQueue(lessonNumbers, quality = '1080') {
        this.quality = quality;
        for (const num of lessonNumbers) {
            const lesson = this.lessons.find(l => l.lessonNumber === num);
            if (!lesson) continue;

            const current = this.lessonStatus[num];
            if (current.status === 'completed' && !lessonNumbers._force) {
                continue;
            }

            if (!this.queue.includes(num)) {
                this.queue.push(num);
                this.lessonStatus[num].status = 'queued';
                this.lessonStatus[num].progress = 0;
                this.lessonStatus[num].error = null;
                this.emit('update', { lessonNumber: num, ...this.lessonStatus[num] });
            }
        }

        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const lessonNumber = this.queue.shift();
        const lesson = this.lessons.find(l => l.lessonNumber === lessonNumber);
        const statusObj = this.lessonStatus[lessonNumber];

        if (!lesson) {
            this.isProcessing = false;
            return this.processQueue();
        }

        this.currentTask = lessonNumber;
        statusObj.status = 'downloading';
        statusObj.progress = 0;
        statusObj.error = null;
        this.emit('update', { lessonNumber, ...statusObj });

        try {
            console.log(`Starting download for Lesson ${lessonNumber}: "${lesson.title}"`);

            // 1. Download transcript if not already saved
            await this.downloadTranscript(lesson);

            // 2. Fetch Vimeo HLS Stream
            const hlsUrl = await this.getVimeoHlsUrl(lesson.vimeoId);

            const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
            const targetFile = path.join(this.downloadDir, statusObj.filename);

            const formatStr = this.quality === '1080'
                ? 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
                : `bestvideo[height<=${this.quality}]+bestaudio/best[height<=${this.quality}]`;

            // HIGH-SPEED MULTI-CONNECTION FLAGS: 16 concurrent fragments, 16MB buffer
            const args = [
                '--concurrent-fragments', '16',
                '--buffer-size', '16M',
                '--http-chunk-size', '10M',
                '--retries', '10',
                '--fragment-retries', '10',
                '-f', formatStr,
                '--ffmpeg-location', __dirname,
                '--merge-output-format', 'mp4',
                '--force-overwrites',
                '-o', targetFile,
                hlsUrl
            ];

            await new Promise((resolve, reject) => {
                const proc = spawn(ytdlpPath, args);
                this.activeProcess = proc;

                proc.stdout.on('data', (data) => {
                    const text = data.toString();

                    const match = text.match(/\[download\]\s+([\d\.]+)%\s+of\s+~?([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/i);
                    if (match) {
                        const percent = parseFloat(match[1]);
                        const speed = match[3];
                        const eta = match[4];
                        statusObj.progress = percent;
                        statusObj.speed = speed;
                        statusObj.eta = eta;
                        statusObj.status = 'downloading';
                        this.emit('progress', {
                            lessonNumber,
                            progress: percent,
                            speed,
                            eta
                        });
                    } else {
                        const speedMatch = text.match(/at\s+([^\s]+)\s+ETA\s+([^\s]+)/i);
                        const pctMatch = text.match(/([\d\.]+)%/);
                        if (pctMatch) {
                            const p = parseFloat(pctMatch[1]);
                            statusObj.progress = p;
                            if (speedMatch) {
                                statusObj.speed = speedMatch[1];
                                statusObj.eta = speedMatch[2];
                            }
                            this.emit('progress', {
                                lessonNumber,
                                progress: p,
                                speed: statusObj.speed,
                                eta: statusObj.eta
                            });
                        }
                    }

                    if (text.includes('[Merger] Merging formats')) {
                        statusObj.status = 'muxing';
                        statusObj.progress = 99;
                        this.emit('update', { lessonNumber, ...statusObj });
                    }
                });

                proc.stderr.on('data', (data) => {
                    const errText = data.toString();
                    if (!errText.includes('frame=') && !errText.includes('size=')) {
                        console.log(`[yt-dlp stderr] ${errText.trim()}`);
                    }
                });

                proc.on('close', (code) => {
                    this.activeProcess = null;
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`yt-dlp exited with code ${code}`));
                    }
                });

                proc.on('error', (err) => {
                    this.activeProcess = null;
                    reject(err);
                });
            });

            // Mark completed
            statusObj.status = 'completed';
            statusObj.progress = 100;
            statusObj.speed = '';
            statusObj.eta = '';
            if (fs.existsSync(targetFile)) {
                statusObj.size = fs.statSync(targetFile).size;
            }
            this.emit('update', { lessonNumber, ...statusObj });
            console.log(`Successfully completed Lesson ${lessonNumber}!`);

        } catch (err) {
            console.error(`Error downloading Lesson ${lessonNumber}:`, err.message);
            statusObj.status = statusObj.status === 'cancelled' ? 'cancelled' : 'error';
            statusObj.error = err.message;
            this.emit('update', { lessonNumber, ...statusObj });
        } finally {
            this.currentTask = null;
            this.isProcessing = false;
            this.processQueue();
        }
    }

    cancelCurrent() {
        if (this.activeProcess) {
            if (this.currentTask !== null) {
                this.lessonStatus[this.currentTask].status = 'cancelled';
                this.lessonStatus[this.currentTask].speed = '';
                this.lessonStatus[this.currentTask].eta = '';
                this.emit('update', { lessonNumber: this.currentTask, ...this.lessonStatus[this.currentTask] });
            }
            try {
                this.activeProcess.kill('SIGKILL');
            } catch (e) {}
            this.activeProcess = null;
        }
    }

    stopAll() {
        for (const num of this.queue) {
            this.lessonStatus[num].status = 'idle';
            this.emit('update', { lessonNumber: num, ...this.lessonStatus[num] });
        }
        this.queue = [];
        this.cancelCurrent();
    }
}

module.exports = new DownloaderEngine();
