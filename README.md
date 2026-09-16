# BiblicalTraining 1080p Video & Transcript Downloader
### Survey of Biblical Theology (BT504) - Dr. Thomas Schreiner

Downloads all 27 lectures from [BiblicalTraining.org](https://www.biblicaltraining.org/learn/institute/survey-of-biblical-theology-bt504) in **Full 1080p HD** along with **Lecture Transcripts and Outlines**.

---

## What Was Updated

1. **Target Save Location**:
   - All videos and transcripts are saved directly to:
     ```
     D:\Survey of the Old Testament
     ```
2. **Lecture Transcripts & Outlines**:
   - Each lecture's full outline and verbatim transcript are extracted, cleaned, and saved alongside each video:
     - `BT504 - Lesson 01 - History of Biblical Theology.txt`
     - `BT504 - Lesson 01 - History of Biblical Theology.mp4`
3. **High-Speed Multi-Threaded Engine (16x Turbo)**:
   - Fixed slow download speed by enabling **16 concurrent fragment connections** (`--concurrent-fragments 16`), **16MB buffer**, and **10MB chunk streaming**, accelerating downloads from ~95 KB/s to **several MB/s**!

---

## How to Run

### Option 1: Web Dashboard (Recommended)

1. Open a terminal in this directory:
   ```powershell
   npm start
   ```
2. Open your browser and go to:
   ```
   http://localhost:3000
   ```
3. Click **"Download All 27 Videos (1080p)"** or download specific lessons!
4. Click **"Open D:\ Folder"** at any time to view all files.

---

### Option 2: CLI Batch Downloader

To download all videos directly from the terminal:
```powershell
npm run download:all
```

#### CLI Options:
- Download specific range:
  ```powershell
  node cli_download.js --from=1 --to=5
  ```
- Download specific lessons:
  ```powershell
  node cli_download.js --only=1,2,3
  ```
- Download all transcripts only:
  ```powershell
  node cli_download.js --transcripts-only
  ```
