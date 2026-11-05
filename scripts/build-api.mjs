// Builds static JSON API files from a Google Drive folder.
// Runs in GitHub Actions so the API key stays a secret and never ships to the site.
//
//   GOOGLE_API_KEY=... ROOT_FOLDER_ID=... node scripts/build-api.mjs
//
// Output:
//   dist/api/folders.json            all subfolders of ROOT_FOLDER_ID
//   dist/api/folders/<folderId>.json all files inside that subfolder
//   dist/api/miqaats.json            miqaats.json from the root folder, if present (validated)
//   dist/api/ziyarat.json            ziyarat.json from the root folder, if present (validated)

import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const API = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const OUT = process.env.OUT_DIR || "dist";
const CONCURRENCY = 4;

const apiKey = process.env.GOOGLE_API_KEY;
const rootFolderId = process.env.ROOT_FOLDER_ID;
if (!apiKey || !rootFolderId) {
  console.error("Set GOOGLE_API_KEY and ROOT_FOLDER_ID environment variables.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetches every page of results for a Drive query, retrying on rate limits.
async function listAll(q, fields) {
  const items = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q,
      key: apiKey,
      pageSize: "1000",
      orderBy: "name",
      fields: `nextPageToken, files(${fields})`,
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    let res;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(`${API}?${params}`);
      if (res.status !== 429 && res.status < 500) break;
      await sleep(1000 * 2 ** attempt);
    }
    const body = await res.json();
    if (!res.ok) throw new Error(body.error?.message || `HTTP ${res.status}`);
    items.push(...body.files);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return items;
}

async function getFolders(parentId) {
  const files = await listAll(
    `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    "id, name, modifiedTime"
  );
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    url: `https://drive.google.com/drive/folders/${f.id}`,
    filesApi: `api/folders/${f.id}.json`,
  }));
}

async function getFiles(folderId) {
  const files = await listAll(
    `'${folderId}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`,
    "id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink"
  );
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime,
    viewUrl: f.webViewLink,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
    // thumbnailLink is short-lived and tied to the API key, so use the public endpoint.
    thumbnailUrl: f.thumbnailLink ? `https://drive.google.com/thumbnail?id=${f.id}` : null,
  }));
}

/**
 * Copies [name] from the root folder into the API after [validate] checks every item. A broken file
 * fails the build, so the previously deployed (good) list stays live instead of being replaced.
 */
async function publishRootList(name, validate) {
  const [file] = await listAll(
    `'${rootFolderId}' in parents and name = '${name}' and trashed = false`,
    "id, name, modifiedTime"
  );
  if (!file) {
    console.log(`${name}: not in the root folder, skipped (the app uses its built-in list)`);
    return;
  }
  const res = await fetch(`${API}/${file.id}?alt=media&key=${apiKey}`);
  if (!res.ok) throw new Error(`${name}: download failed (HTTP ${res.status})`);
  const text = await res.text();
  let items;
  try {
    items = JSON.parse(text);
  } catch (e) {
    throw new Error(`${name} is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${name} must be a non-empty JSON array`);
  }
  items.forEach((item, i) => validate(item, `${name} item ${i + 1}`));
  // Published as the bare array, exactly the format the app bundles.
  await writeFile(join(OUT, `api/${name}`), JSON.stringify(items));
  console.log(`${name}: ${items.length} items`);
}

function publishMiqaats() {
  const ids = new Set();
  return publishRootList("miqaats.json", (m, item) => {
    const where = `${item} (${m?.title ?? "no title"})`;
    if (typeof m?.id !== "string" || !m.id) throw new Error(`${where}: missing "id"`);
    if (ids.has(m.id)) throw new Error(`${where}: duplicate id "${m.id}"`);
    ids.add(m.id);
    if (typeof m.title !== "string" || !m.title) throw new Error(`${where}: missing "title"`);
    if (!Number.isInteger(m.misriMonth) || m.misriMonth < 1 || m.misriMonth > 12) {
      throw new Error(`${where}: "misriMonth" must be 1-12`);
    }
    if (!Number.isInteger(m.misriDay) || m.misriDay < 1 || m.misriDay > 30) {
      throw new Error(`${where}: "misriDay" must be 1-30`);
    }
  });
}

function publishZiyarat() {
  const queries = new Set();
  return publishRootList("ziyarat.json", (p, item) => {
    const where = `${item} (${p?.name ?? "no name"})`;
    for (const field of ["name", "about", "city", "country", "mapsQuery"]) {
      if (typeof p?.[field] !== "string" || !p[field].trim()) throw new Error(`${where}: missing "${field}"`);
    }
    // The app tells places apart by their map search, so each must be different.
    if (queries.has(p.mapsQuery)) throw new Error(`${where}: duplicate mapsQuery "${p.mapsQuery}"`);
    queries.add(p.mapsQuery);
  });
}

async function writeJson(path, data) {
  await writeFile(join(OUT, path), JSON.stringify(data, null, 2));
}

const generatedAt = new Date().toISOString();

await rm(join(OUT, "api"), { recursive: true, force: true });
await mkdir(join(OUT, "api/folders"), { recursive: true });

await publishMiqaats();
await publishZiyarat();

const folders = await getFolders(rootFolderId);
await writeJson("api/folders.json", { generatedAt, count: folders.length, folders });
console.log(`folders.json: ${folders.length} folders`);

// Fetch folder contents a few at a time to stay under Drive rate limits.
const queue = [...folders];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let f; (f = queue.shift()); ) {
      const files = await getFiles(f.id);
      await writeJson(`api/folders/${f.id}.json`, {
        generatedAt,
        folderId: f.id,
        folderName: f.name,
        count: files.length,
        files,
      });
      console.log(`${f.name}: ${files.length} files`);
    }
  })
);
