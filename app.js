// Browses the static JSON API built by scripts/build-api.mjs. No API key needed here.
const $ = (sel) => document.querySelector(sel);
const els = {
  folders: $("#folders"),
  json: $("#json"),
  title: $("#title"),
  status: $("#status"),
  endpoint: $("#endpoint"),
  copy: $("#copy"),
  download: $("#download"),
  back: $("#back"),
};

let current = { name: "folders" };

async function getJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status === 404 ? "Not found" : `HTTP ${res.status}`);
  return res.json();
}

function showJson(name, path, data) {
  current = { name };
  const url = new URL(path, location.href).href;
  els.endpoint.textContent = url;
  els.endpoint.href = url;
  els.json.textContent = JSON.stringify(data, null, 2);
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

function renderFolderList(folders) {
  els.folders.replaceChildren(
    ...folders.map((f) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#/folder/${f.id}`;
      a.textContent = f.name;
      a.dataset.id = f.id;
      li.append(a);
      return li;
    })
  );
}

function markActive(id) {
  els.folders.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.dataset.id === id);
  });
}

let rootData = null;

async function loadRoot() {
  rootData ??= await getJson("api/folders.json");
  renderFolderList(rootData.folders);
  return rootData;
}

async function showRoot() {
  els.title.textContent = "Folders";
  els.back.hidden = true;
  setStatus("Loading folders…");
  try {
    const data = await loadRoot();
    markActive(null);
    showJson("folders", "api/folders.json", data);
    setStatus(`${data.count} folders · updated ${new Date(data.generatedAt).toLocaleString()}`);
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function showFolder(id) {
  els.back.hidden = false;
  setStatus("Loading files…");
  try {
    await loadRoot();
    markActive(id);
    const path = `api/folders/${id}.json`;
    const data = await getJson(path);
    els.title.textContent = data.folderName;
    showJson(data.folderName, path, data);
    setStatus(`${data.count} files · updated ${new Date(data.generatedAt).toLocaleString()}`);
  } catch (e) {
    setStatus(e.message, true);
  }
}

function route() {
  const match = location.hash.match(/^#\/folder\/([\w-]+)/);
  match ? showFolder(match[1]) : showRoot();
}

els.copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.json.textContent);
  els.copy.textContent = "Copied";
  setTimeout(() => (els.copy.textContent = "Copy JSON"), 1200);
});

els.download.addEventListener("click", () => {
  const blob = new Blob([els.json.textContent], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${current.name.replace(/[^\w-]+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

els.back.addEventListener("click", () => (location.hash = ""));

window.addEventListener("hashchange", route);
route();
