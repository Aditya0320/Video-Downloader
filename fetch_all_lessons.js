const fs = require('fs');

async function main() {
    const nextData = JSON.parse(fs.readFileSync('next_data.json', 'utf8'));
    const lessonsRaw = nextData.props.pageProps.classNode.field_lessons;
    console.log(`Found ${lessonsRaw.length} lessons in class.`);

    const lessonsList = [];

    for (let i = 0; i < lessonsRaw.length; i++) {
        const item = lessonsRaw[i];
        const lessonId = item.id;
        const lessonNum = item.field_lesson_number;
        const title = item.title;
        console.log(`[${i+1}/${lessonsRaw.length}] Fetching lesson #${lessonNum}: "${title}" (id: ${lessonId})...`);

        // Fetch lesson detail from backend API
        const apiUrl = `https://back.biblicaltraining.org/jsonapi/node/lesson/${lessonId}?include=field_video`;
        try {
            const res = await fetch(apiUrl);
            if (!res.ok) {
                console.error(`  Failed to fetch: HTTP ${res.status}`);
                continue;
            }
            const json = await res.json();
            let vimeoUrl = null;
            if (json.included) {
                const videoItem = json.included.find(x => x.type === 'media--video');
                if (videoItem && videoItem.attributes && videoItem.attributes.field_media_oembed_video) {
                    vimeoUrl = videoItem.attributes.field_media_oembed_video;
                }
            }

            // Extract Vimeo ID
            let vimeoId = null;
            if (vimeoUrl) {
                const match = vimeoUrl.match(/vimeo\.com\/(\d+)/);
                if (match) vimeoId = match[1];
            }

            lessonsList.push({
                index: i,
                lessonNumber: lessonNum,
                title: title,
                slug: item.bt_router_slug,
                lessonId: lessonId,
                vimeoUrl: vimeoUrl,
                vimeoId: vimeoId
            });
            console.log(`  -> Vimeo ID: ${vimeoId || 'NONE'}`);
        } catch (err) {
            console.error(`  Error fetching ${title}:`, err.message);
        }
    }

    fs.writeFileSync('all_lessons.json', JSON.stringify(lessonsList, null, 2));
    console.log(`Saved ${lessonsList.length} lessons to all_lessons.json`);
}

main().catch(console.error);
