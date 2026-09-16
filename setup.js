const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function setup() {
    console.log('Ensuring binaries are present...');

    // 1. Ensure ffmpeg.exe
    const ffmpegDest = path.join(__dirname, 'ffmpeg.exe');
    if (!fs.existsSync(ffmpegDest)) {
        try {
            const ffmpegStatic = require('ffmpeg-static');
            if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
                console.log('Copying ffmpeg from ffmpeg-static...');
                fs.copyFileSync(ffmpegStatic, ffmpegDest);
                console.log('ffmpeg.exe configured successfully.');
            }
        } catch (e) {
            console.warn('ffmpeg-static not found or error copying:', e.message);
        }
    } else {
        console.log('ffmpeg.exe is already present.');
    }

    // 2. Ensure yt-dlp.exe
    const ytdlpDest = path.join(__dirname, 'yt-dlp.exe');
    if (!fs.existsSync(ytdlpDest)) {
        console.log('Downloading portable yt-dlp.exe...');
        try {
            execSync('curl.exe -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -o "yt-dlp.exe"', { stdio: 'inherit' });
            console.log('yt-dlp.exe downloaded successfully.');
        } catch (e) {
            console.error('Failed to download yt-dlp.exe automatically:', e.message);
        }
    } else {
        console.log('yt-dlp.exe is already present.');
    }

    console.log('Setup check completed.');
}

setup().catch(console.error);
