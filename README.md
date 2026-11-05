# Drive JSON API

A JSON API for one Google Drive folder, hosted for free on GitHub Pages:

- `GET /api/folders.json` returns all subfolders of the root folder.
- `GET /api/folders/<folderId>.json` returns all files in that subfolder.

A GitHub Action reads Drive with your API key and publishes the results as static JSON. The key is stored as a **GitHub secret**, so it never appears in the repo, the website or the API responses.

The site also includes a small browser UI (`index.html`) for clicking through the folders.

## How it works

```
GitHub Action (every 6 hours / on push / manual)
  └─ scripts/build-api.mjs  ── uses secret GOOGLE_API_KEY ──▶ Google Drive API
        └─ writes dist/api/*.json
              └─ deployed to GitHub Pages ──▶ your app fetches plain JSON
```

The data refreshes every 6 hours by default. After uploading new files, refresh straight away from **Actions → Build Drive API and deploy to Pages → Run workflow**.

## Setup

### 1. Share the Drive folder
In Google Drive, right-click the parent folder, choose **Share**, and set **General access** to **Anyone with the link → Viewer**.

Copy the folder ID from its URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`

### 2. Create an API key
1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Go to **APIs & Services → Library → Google Drive API → Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → API key**.
4. Edit the key and set **API restrictions → Restrict key → Google Drive API**. Leave **Application restrictions** set to *None*, because the key is called from GitHub's servers.

### 3. Push to GitHub
```sh
git init && git add . && git commit -m "Drive JSON API"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```

### 4. Add the secrets
In the repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Name | Value |
|---|---|
| `GOOGLE_API_KEY` | your API key |
| `ROOT_FOLDER_ID` | the parent folder ID |

### 5. Turn on Pages
Go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Then go to **Actions → Build Drive API and deploy to Pages → Run workflow**. When it finishes, the API is live at:

```
https://<your-username>.github.io/<repo>/api/folders.json
https://<your-username>.github.io/<repo>/api/folders/<folderId>.json
```

## Response format

**`api/folders.json`**
```json
{
  "generatedAt": "2026-10-30T10:00:00.000Z",
  "count": 2,
  "folders": [
    {
      "id": "1XyZ...",
      "name": "Marasiya",
      "modifiedTime": "2026-10-01T10:00:00.000Z",
      "url": "https://drive.google.com/drive/folders/1XyZ...",
      "filesApi": "api/folders/1XyZ....json"
    }
  ]
}
```

**`api/folders/<folderId>.json`**
```json
{
  "generatedAt": "2026-10-30T10:00:00.000Z",
  "folderId": "1XyZ...",
  "folderName": "Marasiya",
  "count": 1,
  "files": [
    {
      "id": "1Qw...",
      "name": "track01.mp3",
      "mimeType": "audio/mpeg",
      "size": 4823011,
      "modifiedTime": "2026-10-01T10:00:00.000Z",
      "viewUrl": "https://drive.google.com/file/d/1Qw.../view",
      "downloadUrl": "https://drive.google.com/uc?export=download&id=1Qw...",
      "thumbnailUrl": "https://drive.google.com/thumbnail?id=1Qw..."
    }
  ]
}
```

GitHub Pages serves these files with `Content-Type: application/json` and `Access-Control-Allow-Origin: *`, so apps and other websites can fetch them directly.

## Run locally
```sh
GOOGLE_API_KEY=your_key ROOT_FOLDER_ID=your_folder_id node scripts/build-api.mjs
cp index.html app.js dist/
python3 -m http.server 8000 -d dist
```
Then open http://localhost:8000. The `dist/` folder is git-ignored.

## Notes
- **Freshness:** the data is only as fresh as the last Action run. To change how often it runs, edit `cron` in `.github/workflows/deploy.yml`.
- **Size limits:** GitHub Pages sites can be up to 1 GB, which is far more than these JSON files need.
- **Private folders:** to keep the Drive folder private, you would need a Google service account instead of an API key. Ask if you need that.

## Lists the app reads from the root folder

Put these JSON files directly in the root Drive folder (not in a subfolder). The workflow checks each one before publishing it. If a file has a mistake, the build fails with a message naming the item, and the last good list stays live. If a file isn't there, the app uses its built-in copy. The app checks for a new version at most every 12 hours.

### `miqaats.json`
An array of Miqaats, each with `id`, `title`, `misriMonth` (1–12) and `misriDay` (1–30).

### `ziyarat.json`
An array of places for the app's Ziyarat Places screen, in the order shown. Places are grouped by `country`, in the order each country first appears.

```json
[
  {
    "name": "Raudat Tahera",
    "about": "Mazaar of Syedna Taher Saifuddin RA and Syedna Mohammed Burhanuddin RA",
    "city": "Mumbai",
    "country": "India",
    "mapsQuery": "Raudat Tahera, Bhendi Bazaar, Mumbai"
  }
]
```

All five fields are required. `mapsQuery` is what the app searches for in the maps app, and it must be different for every place. Start from the app's current list in `DawoodiBohrasOne/app/src/main/assets/ziyarat.json`.
