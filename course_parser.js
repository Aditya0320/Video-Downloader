const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const coursesDir = path.join(__dirname, 'courses');
if (!fs.existsSync(coursesDir)) {
    fs.mkdirSync(coursesDir, { recursive: true });
}

async function fetchCourseFromUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        throw new Error('Please provide a valid BiblicalTraining course URL');
    }

    // Clean & normalize URL
    let url = rawUrl.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    // Ensure it's biblicaltraining.org
    if (!url.includes('biblicaltraining.org')) {
        throw new Error('URL must be from biblicaltraining.org');
    }

    console.log(`[CourseParser] Fetching course from: ${url}`);

    // Use curl to fetch the page with browser User-Agent
    const curlCmd = `curl.exe -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`;
    let html = '';
    try {
        html = execSync(curlCmd, { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024 });
    } catch (e) {
        throw new Error(`Failed to load URL via curl: ${e.message}`);
    }

    const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) {
        throw new Error('Could not find course data on page. Ensure the URL is an active course page.');
    }

    let nextData;
    try {
        nextData = JSON.parse(scriptMatch[1]);
    } catch (e) {
        throw new Error(`Failed to parse page data: ${e.message}`);
    }

    const pageProps = nextData.props?.pageProps;
    const classNode = pageProps?.classNode;
    if (!classNode) {
        throw new Error('No course/class found on this page. Please provide a course overview URL.');
    }

    const courseTitle = classNode.title?.trim() || 'BiblicalTraining Course';
    const courseSlug = classNode.bt_router_slug || path.basename(new URL(url).pathname);
    const courseCode = classNode.field_class_number || '';
    const courseLength = classNode.field_class_length || '';
    const courseFormat = classNode.field_class_format || 'Video and Audio';

    let instructor = 'BiblicalTraining Professor';
    if (classNode.field_professors && classNode.field_professors.length > 0) {
        instructor = classNode.field_professors[0].title || instructor;
    }

    const rawLessons = classNode.field_lessons || [];
    console.log(`[CourseParser] Course "${courseTitle}" (${courseCode}) has ${rawLessons.length} lessons. Resolving in parallel...`);

    // Fetch lesson details in fast parallel batches of 15
    const chunkSize = 15;
    const lessons = [];

    for (let i = 0; i < rawLessons.length; i += chunkSize) {
        const chunk = rawLessons.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(async (item, chunkIdx) => {
            const lessonId = item.id;
            const lessonNum = item.field_lesson_number !== undefined && item.field_lesson_number !== null ? item.field_lesson_number : (i + chunkIdx);
            const title = (item.title || `Lesson ${lessonNum}`).trim();

            let vimeoUrl = null;
            let vimeoId = null;
            let hasTranscript = false;
            let hasOutline = false;

            try {
                const apiUrl = `https://back.biblicaltraining.org/jsonapi/node/lesson/${lessonId}?include=field_video`;
                const apiRes = await fetch(apiUrl);
                if (apiRes.ok) {
                    const apiJson = await apiRes.json();
                    if (apiJson.included) {
                        const videoItem = apiJson.included.find(x => x.type === 'media--video');
                        if (videoItem?.attributes?.field_media_oembed_video) {
                            vimeoUrl = videoItem.attributes.field_media_oembed_video;
                            const match = vimeoUrl.match(/vimeo\.com\/(\d+)/);
                            if (match) vimeoId = match[1];
                        }
                    }
                    const attrs = apiJson.data?.attributes;
                    if (attrs?.field_transcript?.value) hasTranscript = true;
                    if (attrs?.field_outline?.value) hasOutline = true;
                }
            } catch (err) {
                console.warn(`[CourseParser] Warning on lesson ${lessonNum}:`, err.message);
            }

            return {
                index: i + chunkIdx,
                lessonNumber: lessonNum,
                title: title,
                slug: item.bt_router_slug || `lesson-${lessonNum}`,
                lessonId: lessonId,
                vimeoUrl: vimeoUrl,
                vimeoId: vimeoId,
                hasTranscript: hasTranscript,
                hasOutline: hasOutline
            };
        });

        const chunkResults = await Promise.all(chunkPromises);
        lessons.push(...chunkResults);
    }

    const courseData = {
        url: url,
        title: courseTitle,
        slug: courseSlug,
        code: courseCode,
        instructor: instructor,
        format: courseFormat,
        length: courseLength,
        totalLessons: lessons.length,
        lessons: lessons,
        fetchedAt: new Date().toISOString()
    };

    // Cache course file
    const cacheFile = path.join(coursesDir, `${courseSlug}.json`);
    try {
        fs.writeFileSync(cacheFile, JSON.stringify(courseData, null, 2), 'utf8');
    } catch (e) {}

    console.log(`[CourseParser] Successfully resolved "${courseTitle}" with ${lessons.length} lessons.`);
    return courseData;
}

function getSavedCourses() {
    if (!fs.existsSync(coursesDir)) return [];
    const files = fs.readdirSync(coursesDir).filter(f => f.endsWith('.json'));
    const list = [];
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(coursesDir, file), 'utf8'));
            list.push({
                slug: data.slug,
                title: data.title,
                instructor: data.instructor,
                totalLessons: data.totalLessons,
                url: data.url
            });
        } catch (e) {}
    }
    return list;
}

module.exports = {
    fetchCourseFromUrl,
    getSavedCourses
};
