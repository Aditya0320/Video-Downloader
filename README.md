# BiblicalTraining Universal 1080p Video & Transcript Downloader

Download lectures in **Full 1080p HD** along with **Lecture Transcripts and Outlines** from **ANY** topic or course on [BiblicalTraining.org](https://www.biblicaltraining.org).

---

## What's New: Universal Topic / Course Support

You can now download **any course or topic** on BiblicalTraining by simply pasting its URL!

1. **Dynamic Course URL Loader**:
   - Paste any URL (e.g. `https://www.biblicaltraining.org/learn/...`) into the dashboard and click **"Load Topic"**.
   - The engine automatically resolves:
     - Course Title, Instructor, and Lecture count
     - High-definition Vimeo 1080p video streams
     - Full verbatim transcripts and outlines
     - Auto-configures a dedicated save folder on drive `D:\` (e.g. `D:\<Course Title>`).

2. **Quick Topic Presets**:
   - One-click presets are available on the dashboard for popular topics like:
     - *Survey of Biblical Theology (BT504)*
     - *52 Major Stories of the Bible (TH101)*
     - *Life is a Journey (TH100)*

2. **Custom Destination Folder Selection**:
   - Change or select ANY destination folder on your computer at any time:
     - Click **"Change Folder"** in the navigation bar or next to the folder label.
     - **Browse... Button**: Launches the native Windows Folder Picker dialog to graphically choose any drive or directory.
     - **Manual Input**: Type or paste any folder path (e.g. `D:\My Biblical Studies`, `E:\Lectures`, `C:\Downloads`).
     - **Suggestions**: Quick one-click chips for common paths.

3. **High-Speed Multi-Threaded Engine (16x Turbo)**:
   - Uses 16 concurrent fragment connections (`--concurrent-fragments 16`) to maximize network bandwidth.

---

## How to Run

### Option 1: Web Dashboard (Recommended)

1. Start the server:
   ```powershell
   npm start
   ```
2. Open your browser:
   ```
   http://localhost:3000
   ```
3. (Optional) Click **"Change Folder"** to select where videos will be saved.
4. Paste any BiblicalTraining course URL in the top box and click **"Load Topic"**.
5. Click **"Download All Videos (1080p)"** or **"Download All Transcripts (.txt)"**!
6. Click **"Open Save Folder"** to open your files in Windows Explorer.

---

### Option 2: CLI Runner for Any Course & Folder

To download any course to a custom destination directory directly from the terminal:
```powershell
node cli_download.js --url="https://www.biblicaltraining.org/learn/institute/survey-of-biblical-theology-bt504" --folder="D:\Survey of the Old Testament"
```

Or download all transcripts to a custom folder:
```powershell
node cli_download.js --url="https://www.biblicaltraining.org/learn/institute/survey-of-biblical-theology-bt504" --folder="D:\My Transcripts" --transcripts-only
```
