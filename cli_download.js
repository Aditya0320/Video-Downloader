const downloader = require('./downloader');

async function runCli() {
    console.log('=====================================================');
    console.log(' BiblicalTraining.org Universal Video & Transcript Downloader');
    console.log('=====================================================\n');

    const args = process.argv.slice(2);

    // Check if a custom course URL was provided
    let customUrl = null;
    for (const arg of args) {
        if (arg.startsWith('--url=')) {
            customUrl = arg.split('=')[1].replace(/^["']|["']$/g, '');
        }
    }

    if (customUrl) {
        console.log(`Loading custom course URL: ${customUrl}...`);
        await downloader.loadCourseByUrl(customUrl);
    }

    console.log(`Active Course: ${downloader.course.title} (${downloader.course.code || 'BT'})`);
    console.log(`Instructor: ${downloader.course.instructor}`);
    console.log(`Save Directory: ${downloader.downloadDir}`);
    console.log('Speed: 16 Concurrent Fragment Connections (Multi-Threaded)\n');

    // Option: download only transcripts
    if (args.includes('--transcripts-only')) {
        console.log('Downloading all transcripts...');
        const count = await downloader.downloadAllTranscripts();
        console.log(`Successfully saved ${count} transcripts into ${downloader.downloadDir}`);
        process.exit(0);
    }

    const lessons = downloader.getLessons();
    console.log(`Total lessons available: ${lessons.length}`);

    let quality = '1080';
    let targetLessons = lessons.map(l => l.lessonNumber);

    for (const arg of args) {
        if (arg.startsWith('--quality=')) {
            quality = arg.split('=')[1];
        } else if (arg.startsWith('--from=')) {
            const fromNum = parseInt(arg.split('=')[1], 10);
            targetLessons = targetLessons.filter(n => n >= fromNum);
        } else if (arg.startsWith('--to=')) {
            const toNum = parseInt(arg.split('=')[1], 10);
            targetLessons = targetLessons.filter(n => n <= toNum);
        } else if (arg.startsWith('--only=')) {
            const nums = arg.split('=')[1].split(',').map(x => parseInt(x.trim(), 10));
            targetLessons = targetLessons.filter(n => nums.includes(n));
        }
    }

    console.log(`Selected Quality: ${quality}p`);
    console.log(`Queuing ${targetLessons.length} lessons: [${targetLessons.join(', ')}]\n`);

    let lastProgress = -1;

    downloader.on('progress', (data) => {
        const p = Math.floor(data.progress);
        if (p !== lastProgress && p % 2 === 0) {
            lastProgress = p;
            process.stdout.write(`\r  [Lesson ${data.lessonNumber}] Progress: ${p}% | Speed: ${data.speed || 'N/A'} | ETA: ${data.eta || 'N/A'}   `);
        }
    });

    downloader.on('update', (data) => {
        if (data.status === 'downloading') {
            console.log(`\n▶ [Lesson ${data.lessonNumber}] Starting: "${data.title}"...`);
            lastProgress = -1;
        } else if (data.status === 'muxing') {
            console.log(`\n  ⚡ [Lesson ${data.lessonNumber}] Muxing 1080p video and stereo audio with ffmpeg...`);
        } else if (data.status === 'completed') {
            const mb = (data.size / (1024 * 1024)).toFixed(1);
            console.log(`\n✔ [Lesson ${data.lessonNumber}] Finished successfully (${mb} MB)! Saved as:\n  Video: ${data.filename}\n  Transcript: ${data.transcriptFilename}\n`);
        } else if (data.status === 'error') {
            console.log(`\n✖ [Lesson ${data.lessonNumber}] Error: ${data.error}\n`);
        }
    });

    downloader.addToQueue(targetLessons, quality);

    // Keep process alive while downloading
    setInterval(() => {
        if (!downloader.isProcessing && downloader.queue.length === 0) {
            console.log('\n=====================================================');
            console.log(' All downloads in queue have finished!');
            console.log(` Files saved to: ${downloader.downloadDir}`);
            console.log('=====================================================');
            process.exit(0);
        }
    }, 1500);
}

runCli().catch(console.error);
