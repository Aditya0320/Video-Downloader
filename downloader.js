const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const courseParser = require('./course_parser');

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

function sanitizeFolderName(name) {
    return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

class DownloaderEngine extends EventEmitter {
    constructor() {
        super();
        this.lessonsFile = path.join(__dirname, 'all_lessons.json');
        this.lessons = JSON.parse(fs.readFileSync(this.lessonsFile, 'utf8'));

        // Default Course Info (BT504)
        this.course = {
            url: 'https://www.biblicaltraining.org/learn/institute/survey-of-biblical-theology-bt504',
            title: 'Survey of Biblical Theology',
            slug: 'survey-of-biblical-theology-bt504',
            code: 'BT504',
            instructor: 'Dr. Thomas Schreiner',
            length: '18 hours 30 minutes',
            totalLessons: 27
        };

        // Destination directory: D:\Survey of the Old Testament (or D:\<Course Title>)
        this.setDownloadDirectory('D:\\Survey of the Old Testament');

        this.queue = [];
        this.isProcessing = false;
        this.currentTask = null;
        this.activeProcess = null;
        this.quality = '1080';

        this.lessonStatus = {};
        this.initializeStatus();
    }

    setDownloadDirectory(dir) {
        this.downloadDir = dir;
        if (!fs.existsSync(this.downloadDir)) {
            try {
                fs.mkdirSync(this.downloadDir, { recursive: true });
            } catch (e) {
                console.error(`Could not create ${dir}, falling back to local downloads`, e.message);
                this.downloadDir = path.join(__dirname, 'downloads', sanitizeFolderName(this.course.title));
                if (!fs.existsSync(this.downloadDir)) fs.mkdirSync(this.downloadDir, { recursive: true });
            }
        }
    }

    setCustomDownloadDir(newDir) {
        if (!newDir || typeof newDir !== 'string') {
            throw new Error('Invalid directory path provided');
        }
        newDir = newDir.trim().replace(/^["']|["']$/g, '');
        this.setDownloadDirectory(newDir);
        this.initializeStatus();
        this.emit('course-loaded', this.getCourseSummary());
        return this.downloadDir;
    }

    async loadCourseByUrl(url) {
        this.stopAll();
        console.log(`[Downloader] Loading dynamic course: ${url}`);
        const courseData = await courseParser.fetchCourseFromUrl(url);

        this.course = {
            url: courseData.url,
            title: courseData.title,
            slug: courseData.slug,
            code: courseData.code || 'BT',
            instructor: courseData.instructor,
            length: courseData.length,
            totalLessons: courseData.totalLessons
        };

        this.lessons = courseData.lessons;

        // Auto-configure download directory
        const dDriveExists = fs.existsSync('D:\\');
        const folderName = sanitizeFolderName(this.course.title);
        const targetPath = dDriveExists ? path.join('D:\\', folderName) : path.join(__dirname, 'downloads', folderName);
        this.setDownloadDirectory(targetPath);

        this.lessonStatus = {};
        this.initializeStatus();
        this.emit('course-loaded', this.getCourseSummary());
        return this.getCourseSummary();
    }

    getVideoFilename(lesson) {
        const prefix = this.course.code ? this.course.code : 'Lesson';
        const numStr = String(lesson.lessonNumber).padStart(2, '0');
        const cleanTitle = lesson.title.trim().replace(/[\\/:*?"<>|]/g, '_');
        return `${prefix} - Lesson ${numStr} - ${cleanTitle}.mp4`;
    }

    getTranscriptFilename(lesson) {
        const prefix = this.course.code ? this.course.code : 'Lesson';
        const numStr = String(lesson.lessonNumber).padStart(2, '0');
        const cleanTitle = lesson.title.trim().replace(/[\\/:*?"<>|]/g, '_');
        return `${prefix} - Lesson ${numStr} - ${cleanTitle}.txt`;
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

    getCourseSummary() {
        const lessons = this.getLessons();
        const completedCount = lessons.filter(l => l.statusInfo.status === 'completed').length;
        const totalSize = lessons.reduce((acc, l) => acc + (l.statusInfo.size || 0), 0);
        const transcriptCount = lessons.filter(l => l.statusInfo.transcriptExists).length;

        return {
            course: this.course,
            targetDir: this.downloadDir,
            totalLessons: lessons.length,
            completedCount,
            transcriptCount,
            totalSize,
            queue: this.queue,
            currentTask: this.currentTask,
            isProcessing: this.isProcessing,
            quality: this.quality,
            lessons
        };
    }

    getLessons() {
        for (const lesson of this.lessons) {
            const current = this.lessonStatus[lesson.lessonNumber];
            if (!current) continue;
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
            statusInfo: this.lessonStatus[l.lessonNumber] || {}
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
            content += `COURSE: ${this.course.title} (${this.course.code || 'BT'})\n`;
            content += `LESSON ${numStr}: ${lesson.title.trim()}\n`;
            content += `INSTRUCTOR: ${this.course.instructor}\n`;
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
            if (this.lessonStatus[lesson.lessonNumber]) {
                this.lessonStatus[lesson.lessonNumber].transcriptExists = true;
                this.emit('update', { lessonNumber: lesson.lessonNumber, ...this.lessonStatus[lesson.lessonNumber] });
            }
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
            if (current && current.status === 'completed' && !lessonNumbers._force) {
                continue;
            }

            if (!this.queue.includes(num)) {
                this.queue.push(num);
                if (this.lessonStatus[num]) {
                    this.lessonStatus[num].status = 'queued';
                    this.lessonStatus[num].progress = 0;
                    this.lessonStatus[num].error = null;
                    this.emit('update', { lessonNumber: num, ...this.lessonStatus[num] });
                }
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

        if (!lesson || !statusObj) {
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

            // 1. Download transcript
            await this.downloadTranscript(lesson);

            if (!lesson.vimeoId) {
                throw new Error('No Vimeo video available for this lesson');
            }

            // 2. Fetch Vimeo HLS Stream
            const hlsUrl = await this.getVimeoHlsUrl(lesson.vimeoId);

            const ytdlpPath = path.join(__dirname, 'yt-dlp.exe');
            const targetFile = path.join(this.downloadDir, statusObj.filename);

            const formatStr = this.quality === '1080'
                ? 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
                : `bestvideo[height<=${this.quality}]+bestaudio/best[height<=${this.quality}]`;

            // HIGH-SPEED MULTI-CONNECTION FLAGS (16 concurrent fragments)
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
            if (this.currentTask !== null && this.lessonStatus[this.currentTask]) {
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
            if (this.lessonStatus[num]) {
                this.lessonStatus[num].status = 'idle';
                this.emit('update', { lessonNumber: num, ...this.lessonStatus[num] });
            }
        }
        this.queue = [];
        this.cancelCurrent();
    }
}

module.exports = new DownloaderEngine();
