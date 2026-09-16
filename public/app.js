// Application State
let state = {
    course: {
        title: 'Survey of Biblical Theology',
        instructor: 'Dr. Thomas Schreiner',
        code: 'BT504',
        length: '18 hours 30 minutes',
        url: ''
    },
    targetDir: 'D:\\Survey of the Old Testament',
    lessons: [],
    selected: new Set(),
    filter: 'all',
    search: '',
    quality: '1080',
    currentTask: null,
    queue: [],
    isProcessing: false,
    activeMetrics: {
        progress: 0,
        speed: '',
        eta: ''
    }
};

// DOM Elements
const lessonsContainer = document.getElementById('lessonsContainer');
const searchInput = document.getElementById('searchInput');
const filterTabs = document.querySelectorAll('.filter-tabs .tab');
const qualitySelect = document.getElementById('qualitySelect');

// Course URL Form Elements
const courseUrlForm = document.getElementById('courseUrlForm');
const inputCourseUrl = document.getElementById('inputCourseUrl');
const btnLoadCourse = document.getElementById('btnLoadCourse');
const btnLoadText = document.getElementById('btnLoadText');
const presetChips = document.querySelectorAll('.preset-chip');

// Course Info Header Elements
const courseHeading = document.getElementById('courseHeading');
const courseInstructor = document.getElementById('courseInstructor');
const courseLectureCount = document.getElementById('courseLectureCount');
const destFolderLabel = document.getElementById('destFolderLabel');
const badgeFormat = document.getElementById('badgeFormat');

// Action Buttons
const btnDownloadAll = document.getElementById('btnDownloadAll');
const btnDownloadAllText = document.getElementById('btnDownloadAllText');
const btnDownloadTranscripts = document.getElementById('btnDownloadTranscripts');
const btnDownloadSelected = document.getElementById('btnDownloadSelected');
const btnDownloadSelectedText = document.getElementById('btnDownloadSelectedText');
const btnCancelAll = document.getElementById('btnCancelAll');
const btnOpenFolder = document.getElementById('btnOpenFolder');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnDeselectAll = document.getElementById('btnDeselectAll');

// Stats Elements
const statTotalLessons = document.getElementById('statTotalLessons');
const statCompleted = document.getElementById('statCompleted');
const statTranscripts = document.getElementById('statTranscripts');
const statQueue = document.getElementById('statQueue');
const overallProgressText = document.getElementById('overallProgressText');
const overallProgressBar = document.getElementById('overallProgressBar');

// Active Download Banner Elements
const activeDownloadSection = document.getElementById('activeDownloadSection');
const activeTitle = document.getElementById('activeTitle');
const activeStatusBadge = document.getElementById('activeStatusBadge');
const activePercent = document.getElementById('activePercent');
const activeSpeed = document.getElementById('activeSpeed');
const activeEta = document.getElementById('activeEta');
const activeFilename = document.getElementById('activeFilename');
const activeProgressBar = document.getElementById('activeProgressBar');
const btnCancelActive = document.getElementById('btnCancelActive');
const toastContainer = document.getElementById('toastContainer');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchLessons();
    setupSSE();
    setupEventListeners();
});

// Setup Server-Sent Events (SSE)
function setupSSE() {
    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            handleServerEvent(msg);
        } catch (err) {
            console.error('Failed to parse SSE event:', err);
        }
    };

    eventSource.onerror = () => {
        console.warn('SSE connection lost. Reconnecting in 3s...');
        eventSource.close();
        setTimeout(setupSSE, 3000);
    };
}

function handleServerEvent(msg) {
    if (msg.type === 'progress') {
        const lesson = state.lessons.find(l => l.lessonNumber === msg.lessonNumber);
        if (lesson && lesson.statusInfo) {
            lesson.statusInfo.progress = msg.progress;
            lesson.statusInfo.speed = msg.speed;
            lesson.statusInfo.eta = msg.eta;
            lesson.statusInfo.status = 'downloading';
        }
        state.currentTask = msg.lessonNumber;
        state.activeMetrics = {
            progress: msg.progress,
            speed: msg.speed,
            eta: msg.eta
        };
        updateActiveBanner();
        updateCardProgress(msg.lessonNumber, msg.progress, msg.speed, msg.eta);
    } else if (msg.type === 'update') {
        const lesson = state.lessons.find(l => l.lessonNumber === msg.lessonNumber);
        if (lesson && lesson.statusInfo) {
            Object.assign(lesson.statusInfo, msg);
            if (msg.status === 'completed') {
                showToast(`Lesson ${msg.lessonNumber} video & transcript saved!`, 'success');
            } else if (msg.status === 'error') {
                showToast(`Lesson ${msg.lessonNumber} error: ${msg.error || 'Failed'}`, 'error');
            }
        }
        updateAllStats();
        renderLessons();
    } else if (msg.type === 'course-loaded') {
        applyCourseData(msg);
        showToast(`Loaded "${state.course.title}" (${state.lessons.length} lessons)`, 'success');
    }
}

// Fetch Lessons from Server
async function fetchLessons() {
    try {
        const res = await fetch('/api/lessons');
        const data = await res.json();
        applyCourseData(data);
    } catch (err) {
        console.error('Failed to load course lessons:', err);
        showToast('Error connecting to server', 'error');
    }
}

function applyCourseData(data) {
    if (data.course) state.course = data.course;
    state.lessons = data.lessons || [];
    state.targetDir = data.targetDir || state.targetDir;
    state.queue = data.queue || [];
    state.currentTask = data.currentTask;
    state.isProcessing = data.isProcessing;
    if (data.quality) state.quality = data.quality;

    state.selected.clear();
    updateCourseHeaderUI();
    updateAllStats();
    renderLessons();
    updateActiveBanner();
}

function updateCourseHeaderUI() {
    if (courseHeading) courseHeading.textContent = state.course.title || 'Course';
    if (courseInstructor) courseInstructor.textContent = state.course.instructor || 'Instructor';
    if (courseLectureCount) courseLectureCount.textContent = `${state.lessons.length} In-Depth Lectures`;
    if (destFolderLabel) destFolderLabel.textContent = state.targetDir;
    if (btnDownloadAllText) btnDownloadAllText.textContent = `Download All ${state.lessons.length} Videos (1080p)`;
    if (badgeFormat && state.course.code) badgeFormat.textContent = state.course.code;
}

// Load Course from URL
async function loadCourseUrl(url) {
    if (!url) return;

    btnLoadCourse.disabled = true;
    btnLoadText.textContent = 'Loading Course...';

    try {
        const res = await fetch('/api/load-course', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await res.json();
        if (data.success) {
            applyCourseData(data);
            showToast(`Loaded: ${data.course.title}`, 'success');
        } else {
            showToast(data.error || 'Failed to load course from URL', 'error');
        }
    } catch (err) {
        console.error('Course load error:', err);
        showToast('Failed to connect or fetch course URL', 'error');
    } finally {
        btnLoadCourse.disabled = false;
        btnLoadText.textContent = 'Load Topic';
    }
}

// Render Lesson Cards
function renderLessons() {
    lessonsContainer.innerHTML = '';

    const query = state.search.toLowerCase().trim();
    const filtered = state.lessons.filter(lesson => {
        const matchTitle = lesson.title.toLowerCase().includes(query);
        const matchNum = String(lesson.lessonNumber).includes(query);
        if (query && !matchTitle && !matchNum) return false;

        const status = lesson.statusInfo?.status || 'idle';
        if (state.filter === 'completed' && status !== 'completed') return false;
        if (state.filter === 'pending' && status === 'completed') return false;
        return true;
    });

    if (filtered.length === 0) {
        lessonsContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted);">
                <p style="font-size: 1.1rem; margin-bottom: 8px;">No lessons found matching your filter.</p>
                <button class="btn btn-secondary btn-small" onclick="clearFilters()">Reset Filters</button>
            </div>
        `;
        return;
    }

    filtered.forEach(lesson => {
        const card = createLessonCard(lesson);
        lessonsContainer.appendChild(card);
    });
}

function createLessonCard(lesson) {
    const card = document.createElement('div');
    const statusInfo = lesson.statusInfo || {};
    const status = statusInfo.status || 'idle';
    card.className = `lesson-card status-${status}`;
    card.id = `lesson-card-${lesson.lessonNumber}`;

    const numStr = String(lesson.lessonNumber).padStart(2, '0');
    const isChecked = state.selected.has(lesson.lessonNumber);
    const isCompleted = status === 'completed';
    const isDownloading = status === 'downloading' || status === 'muxing';
    const isQueued = status === 'queued';
    const hasTranscript = statusInfo.transcriptExists;

    let statusText = lesson.vimeoId ? 'Ready (1080p)' : 'Audio Only';
    if (isCompleted) statusText = 'Completed (Video + Transcript)';
    else if (status === 'muxing') statusText = 'Muxing MP4 with ffmpeg...';
    else if (isDownloading) statusText = `Downloading (${Math.floor(statusInfo.progress || 0)}%)`;
    else if (isQueued) statusText = 'In Queue';
    else if (status === 'error') statusText = 'Download Failed';

    const fileSizeStr = statusInfo.size ? ` • ${(statusInfo.size / (1024 * 1024)).toFixed(1)} MB` : '';

    card.innerHTML = `
        <div class="card-top">
            <input type="checkbox" class="lesson-checkbox" id="chk-${lesson.lessonNumber}" ${isChecked ? 'checked' : ''} ${isCompleted ? 'disabled' : ''}>
            <div class="lesson-meta">
                <div class="lesson-header-row" style="flex-wrap: wrap;">
                    <span class="lesson-badge">LESSON ${numStr}</span>
                    <span class="badge ${isCompleted ? 'badge-success' : 'badge-primary'}">${isCompleted ? '1080p MP4' : 'Full HD'}</span>
                    ${hasTranscript ? '<span class="badge badge-accent" style="font-size: 0.68rem; padding: 2px 8px;">📄 Transcript Saved</span>' : ''}
                </div>
                <h4 class="lesson-title">${escapeHtml(lesson.title)}</h4>
                <div class="lesson-details">
                    <span>${lesson.vimeoId ? `Vimeo ID: <code>${lesson.vimeoId}</code>` : 'Format: Audio Stream'}</span>
                    <span>${fileSizeStr}</span>
                </div>
            </div>
        </div>

        <div class="card-bottom">
            <div class="card-status-row">
                <div class="status-indicator">
                    <span class="status-dot ${status}"></span>
                    <span class="status-text">${statusText}</span>
                </div>
                <span class="speed-eta-text" style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-secondary);">
                    ${statusInfo.speed ? `${statusInfo.speed}` : ''}
                </span>
            </div>

            <div class="progress-bar-bg">
                <div class="progress-bar-fill ${isDownloading ? 'animated-gradient' : ''}" 
                     id="card-progress-${lesson.lessonNumber}" 
                     style="width: ${statusInfo.progress || (isCompleted ? 100 : 0)}%;"></div>
            </div>

            <div class="card-actions">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 210px;">
                    ${lesson.filename}
                </span>
                <button class="btn btn-small ${isCompleted ? 'btn-secondary' : 'btn-primary'}" 
                        id="btn-dl-${lesson.lessonNumber}" 
                        ${isDownloading || isQueued ? 'disabled' : ''}>
                    ${isCompleted ? 'Re-Download' : 'Download'}
                </button>
            </div>
        </div>
    `;

    // Checkbox listener
    const chk = card.querySelector('.lesson-checkbox');
    chk.addEventListener('change', (e) => {
        if (e.target.checked) {
            state.selected.add(lesson.lessonNumber);
        } else {
            state.selected.delete(lesson.lessonNumber);
        }
        updateSelectedUI();
    });

    // Download Button listener
    const btnDl = card.querySelector(`#btn-dl-${lesson.lessonNumber}`);
    btnDl.addEventListener('click', () => {
        downloadLessons([lesson.lessonNumber]);
    });

    return card;
}

function updateCardProgress(lessonNumber, progress, speed, eta) {
    const card = document.getElementById(`lesson-card-${lessonNumber}`);
    if (!card) return;

    const bar = document.getElementById(`card-progress-${lessonNumber}`);
    if (bar) bar.style.width = `${progress}%`;

    const statusText = card.querySelector('.status-text');
    if (statusText) statusText.textContent = `Downloading (${Math.floor(progress)}%)`;

    const speedEta = card.querySelector('.speed-eta-text');
    if (speedEta) speedEta.textContent = `${speed || ''} • ETA ${eta || ''}`;
}

// Update Active Banner
function updateActiveBanner() {
    const currentTask = state.currentTask;
    if (currentTask === null || currentTask === undefined) {
        activeDownloadSection.style.display = 'none';
        btnCancelAll.style.display = 'none';
        return;
    }

    const lesson = state.lessons.find(l => l.lessonNumber === currentTask);
    if (!lesson || lesson.statusInfo?.status === 'completed') {
        activeDownloadSection.style.display = 'none';
        btnCancelAll.style.display = 'none';
        return;
    }

    activeDownloadSection.style.display = 'block';
    btnCancelAll.style.display = 'inline-flex';

    const numStr = String(lesson.lessonNumber).padStart(2, '0');
    activeTitle.textContent = `Lesson ${numStr}: ${lesson.title}`;
    activeFilename.textContent = `${state.targetDir}\\${lesson.filename}`;

    const progress = state.activeMetrics.progress || lesson.statusInfo?.progress || 0;
    activePercent.textContent = `${progress.toFixed(1)}%`;
    activeSpeed.textContent = state.activeMetrics.speed || lesson.statusInfo?.speed || '-- MB/s';
    activeEta.textContent = state.activeMetrics.eta || lesson.statusInfo?.eta || '--:--';
    activeProgressBar.style.width = `${progress}%`;

    if (lesson.statusInfo?.status === 'muxing') {
        activeStatusBadge.textContent = 'MUXING MP4';
        activeStatusBadge.style.background = 'rgba(139, 92, 246, 0.3)';
        activeStatusBadge.style.borderColor = '#8b5cf6';
    } else {
        activeStatusBadge.textContent = 'DOWNLOADING (16X TURBO)';
        activeStatusBadge.style.background = 'rgba(59, 130, 246, 0.25)';
        activeStatusBadge.style.borderColor = '#3b82f6';
    }
}

// Update Collection Stats
function updateAllStats() {
    const total = state.lessons.length;
    const completed = state.lessons.filter(l => l.statusInfo?.status === 'completed').length;
    const transcriptCount = state.lessons.filter(l => l.statusInfo?.transcriptExists).length;
    const queuedCount = state.lessons.filter(l => l.statusInfo?.status === 'queued').length;

    statTotalLessons.textContent = total;
    statCompleted.textContent = `${completed} / ${total}`;
    if (statTranscripts) statTranscripts.textContent = `${transcriptCount} / ${total}`;

    statQueue.textContent = queuedCount + (state.currentTask !== null ? 1 : 0);

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    overallProgressText.textContent = `${percent}%`;
    overallProgressBar.style.width = `${percent}%`;

    // Filter tab count update
    document.querySelector('.tab[data-filter="all"]').textContent = `All (${total})`;
    document.querySelector('.tab[data-filter="pending"]').textContent = `Pending (${total - completed})`;
    document.querySelector('.tab[data-filter="completed"]').textContent = `Completed (${completed})`;

    updateSelectedUI();
}

function updateSelectedUI() {
    const count = state.selected.size;
    btnDownloadSelectedText.textContent = `Download Selected (${count})`;
    btnDownloadSelected.disabled = count === 0;
}

// Download API Trigger
async function downloadLessons(lessonNumbers) {
    if (!lessonNumbers || lessonNumbers.length === 0) return;

    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lessonNumbers,
                quality: qualitySelect.value
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast(`Queued ${lessonNumbers.length} video(s) for 1080p download`, 'success');
            lessonNumbers.forEach(n => state.selected.delete(n));
            updateSelectedUI();
            fetchLessons();
        } else {
            showToast(data.error || 'Failed to start download', 'error');
        }
    } catch (err) {
        console.error('Download error:', err);
        showToast('Network error triggering download', 'error');
    }
}

// Cancel API Trigger
async function cancelDownload(all = false) {
    try {
        const res = await fetch('/api/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all })
        });
        const data = await res.json();
        if (data.success) {
            showToast(all ? 'All downloads cancelled' : 'Active download cancelled', 'success');
            fetchLessons();
        }
    } catch (err) {
        console.error('Cancel error:', err);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Course URL Form Submission
    courseUrlForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = inputCourseUrl.value.trim();
        if (url) {
            loadCourseUrl(url);
        }
    });

    // Preset Chips
    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const url = chip.dataset.url;
            inputCourseUrl.value = url;
            loadCourseUrl(url);
        });
    });

    // Search
    searchInput.addEventListener('input', (e) => {
        state.search = e.target.value;
        renderLessons();
    });

    // Filter Tabs
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.filter = tab.dataset.filter;
            renderLessons();
        });
    });

    // Download All Button
    btnDownloadAll.addEventListener('click', () => {
        const allNumbers = state.lessons.map(l => l.lessonNumber);
        downloadLessons(allNumbers);
    });

    // Download Transcripts Button
    if (btnDownloadTranscripts) {
        btnDownloadTranscripts.addEventListener('click', async () => {
            showToast('Fetching and saving all transcripts...', 'info');
            try {
                const res = await fetch('/api/download-transcripts', { method: 'POST' });
                const d = await res.json();
                if (d.success) {
                    showToast(`Successfully saved ${d.count} transcripts!`, 'success');
                    fetchLessons();
                }
            } catch (e) {
                showToast('Failed to download transcripts', 'error');
            }
        });
    }

    // Download Selected Button
    btnDownloadSelected.addEventListener('click', () => {
        downloadLessons(Array.from(state.selected));
    });

    // Select All
    btnSelectAll.addEventListener('click', () => {
        state.lessons.forEach(l => {
            if (l.statusInfo?.status !== 'completed') {
                state.selected.add(l.lessonNumber);
            }
        });
        renderLessons();
        updateSelectedUI();
    });

    // Deselect All
    btnDeselectAll.addEventListener('click', () => {
        state.selected.clear();
        renderLessons();
        updateSelectedUI();
    });

    // Cancel Active
    btnCancelActive.addEventListener('click', () => {
        cancelDownload(false);
    });

    // Cancel All
    btnCancelAll.addEventListener('click', () => {
        cancelDownload(true);
    });

    // Open Folder
    btnOpenFolder.addEventListener('click', async () => {
        try {
            await fetch('/api/open-folder', { method: 'POST' });
            showToast(`Opening ${state.targetDir}...`, 'success');
        } catch (e) {
            showToast('Failed to open folder', 'error');
        }
    });

    // Quality Select
    qualitySelect.addEventListener('change', (e) => {
        state.quality = e.target.value;
        showToast(`Download quality set to ${e.target.value}p`, 'success');
    });
}

function clearFilters() {
    state.search = '';
    searchInput.value = '';
    state.filter = 'all';
    filterTabs.forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
    renderLessons();
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
