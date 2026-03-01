const state = {
  query: "",
  tag: "",
  strategy: "hybrid",
  articles: [],
  total: 0,
  generatedAt: "",
  current: null,
  viewMode: window.localStorage.getItem("article-view-mode") || "preview",
  cardHeight: Number.parseInt(window.localStorage.getItem("article-card-height") || "138", 10),
  autoFitHeight: window.localStorage.getItem("article-autofit-height") === "true",
  cardFont: Number.parseInt(window.localStorage.getItem("article-card-font") || "14", 10),
  fontFamily: window.localStorage.getItem("article-font-family") || "segoe",
  primarySort: window.localStorage.getItem("article-primary-sort") || "year_desc",
  secondarySort: window.localStorage.getItem("article-secondary-sort") || "title_asc",
  tagFilterMode: window.localStorage.getItem("article-tag-mode") || "all",
  filterIncomplete: window.localStorage.getItem("article-filter-incomplete") === "true",
  menuOpen: false,
  showErrorsGlobally: window.localStorage.getItem("article-show-errors") !== "false",
};

const dom = {
  settingsWrap: document.getElementById("settings-wrap"),
  menuToggle: document.getElementById("menu-toggle"),
  settingsMenu: document.getElementById("settings-menu"),
  primarySort: document.getElementById("primary-sort"),
  secondarySort: document.getElementById("secondary-sort"),
  cardHeightSlider: document.getElementById("card-height-slider"),
  cardHeightValue: document.getElementById("card-height-value"),
  cardHeightAutofit: document.getElementById("card-height-autofit"),
  cardFontSlider: document.getElementById("card-font-slider"),
  cardFontValue: document.getElementById("card-font-value"),
  fontFamilySelect: document.getElementById("font-family-select"),
  searchInput: document.getElementById("search-input"),
  tagFilter: document.getElementById("tag-filter"),
  tagFilterMode: document.getElementById("tag-filter-mode"),
  filterIncomplete: document.getElementById("filter-incomplete"),
  strategySelect: document.getElementById("strategy-select"),
  viewMode: document.getElementById("view-mode"),
  reindexBtn: document.getElementById("reindex-btn"),
  statusLine: document.getElementById("status-line"),
  grid: document.getElementById("grid"),
  modal: document.getElementById("edit-modal"),
  modalClose: document.getElementById("modal-close"),
  modalThumbWrap: document.getElementById("modal-thumb-wrap"),
  modalThumb: document.getElementById("modal-thumb"),
  thumbFile: document.getElementById("thumb-file"),
  thumbUpload: document.getElementById("thumb-upload"),
  thumbReset: document.getElementById("thumb-reset"),
  form: document.getElementById("metadata-form"),
  title: document.getElementById("f-title"),
  authors: document.getElementById("f-authors"),
  year: document.getElementById("f-year"),
  journal: document.getElementById("f-journal"),
  doi: document.getElementById("f-doi"),
  doiFetchBtn: document.getElementById("doi-fetch-btn"),
  abstract: document.getElementById("f-abstract"),
  tags: document.getElementById("f-tags"),
  notes: document.getElementById("f-notes"),
  abstractModal: document.getElementById("abstract-modal"),
  abstractClose: document.getElementById("abstract-close"),
  abstractTitle: document.getElementById("abstract-title"),
  abstractMeta: document.getElementById("abstract-meta"),
  abstractText: document.getElementById("abstract-text"),
  abstractReferencesSection: document.getElementById("abstract-references-section"),
  abstractReferencesList: document.getElementById("abstract-references-list"),
  duplicateModal: document.getElementById("duplicate-modal"),
  duplicateClose: document.getElementById("duplicate-close"),
  duplicateList: document.getElementById("duplicate-list"),
  metaRemove: document.getElementById("meta-remove"),
  errorBanner: document.getElementById("error-banner"),
  errorBannerText: document.getElementById("error-banner-text"),
  errorBannerClose: document.getElementById("error-banner-close"),
  showErrorsCheckbox: document.getElementById("show-errors-checkbox"),
  errorLogList: document.getElementById("error-log-list"),
  errorLogClear: document.getElementById("error-log-clear"),
};

const SORT_KEYS = new Set([
  "year_desc",
  "year_asc",
  "title_asc",
  "authors_asc",
  "journal_asc",
  "doi_asc",
  "file_modified_desc",
  "file_modified_asc",
  "none",
]);

const FONT_FAMILIES = {
  segoe: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  georgia: 'Georgia, "Times New Roman", Times, serif',
  trebuchet: '"Trebuchet MS", "Lucida Sans Unicode", "Lucida Grande", "Lucida Sans", Arial, sans-serif',
  courier: '"Courier New", Courier, monospace',
};

function normalizeSortKey(value, fallback) {
  const v = String(value || "").trim();
  return SORT_KEYS.has(v) ? v : fallback;
}

function normalizeFontKey(value, fallback) {
  const key = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FONT_FAMILIES, key) ? key : fallback;
}

function toSortString(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function clampCardHeight(value) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) return 138;
  return Math.max(100, Math.min(640, n));
}

function applyCardHeight(value) {
  const cardHeight = clampCardHeight(value);
  const thumbHeight = Math.max(44, Math.min(420, Math.round(cardHeight * 0.55)));
  state.cardHeight = cardHeight;
  document.documentElement.style.setProperty("--card-height", `${cardHeight}px`);
  document.documentElement.style.setProperty("--thumb-height", `${thumbHeight}px`);
  dom.cardHeightSlider.value = String(cardHeight);
  dom.cardHeightValue.textContent = String(cardHeight);
  dom.grid.classList.toggle("autofit-cards", Boolean(state.autoFitHeight));
  dom.cardHeightSlider.disabled = Boolean(state.autoFitHeight);
}

function clampCardFont(value) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) return 14;
  return Math.max(10, Math.min(32, n));
}

function applyCardFont(value) {
  const cardFont = clampCardFont(value);
  const metaFont = Math.max(10, Math.round(cardFont * 0.85));
  const hoverFont = Math.max(10, Math.round(cardFont * 0.86));
  const btnFont = Math.max(10, Math.round(cardFont * 0.86));
  state.cardFont = cardFont;
  document.documentElement.style.setProperty("--card-font-size", `${cardFont}px`);
  document.documentElement.style.setProperty("--card-meta-size", `${metaFont}px`);
  document.documentElement.style.setProperty("--card-hover-size", `${hoverFont}px`);
  document.documentElement.style.setProperty("--card-btn-size", `${btnFont}px`);
  dom.cardFontSlider.value = String(cardFont);
  dom.cardFontValue.textContent = String(cardFont);
}

function applyFontFamily(value) {
  const fontKey = normalizeFontKey(value, "segoe");
  state.fontFamily = fontKey;
  document.documentElement.style.setProperty("--app-font-family", FONT_FAMILIES[fontKey]);
  if (dom.fontFamilySelect) {
    dom.fontFamilySelect.value = fontKey;
  }
}

function setMenuOpen(isOpen) {
  state.menuOpen = Boolean(isOpen);
  dom.settingsMenu.classList.toggle("hidden", !state.menuOpen);
  dom.menuToggle.setAttribute("aria-expanded", state.menuOpen ? "true" : "false");
}

function setStatus(text, isWarning = false) {
  dom.statusLine.textContent = text;
  dom.statusLine.classList.toggle("warning", isWarning);
  if (isWarning) {
    logGlobalError(text, "", "");
  }
}

function debounce(fn, waitMs) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), waitMs);
  };
}

function prettyDate(isoText) {
  if (!isoText) return "";
  const dt = new Date(isoText);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString();
}

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

async function fetchJson(url, options = undefined) {
  const requestOptions = options ? { ...options } : {};
  const method = String(requestOptions.method || "GET").toUpperCase();
  if (method === "GET" && !requestOptions.cache) {
    requestOptions.cache = "no-store";
  }

  const res = await fetch(url, requestOptions);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

function articleThumbSrc(article) {
  const path = article?.thumbnail?.path;
  if (!path) return "";
  return `/${path}`;
}

function normalizeWhitespace(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function yearValue(article) {
  const raw = normalizeWhitespace(article?.metadata?.year);
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? -1 : n;
}

function modifiedEpoch(article) {
  const raw = normalizeWhitespace(article?.file_modified);
  if (!raw) return -1;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? -1 : t;
}

function compareSortKey(a, b, key) {
  const aMd = a.metadata || {};
  const bMd = b.metadata || {};
  switch (key) {
    case "year_desc":
      return yearValue(b) - yearValue(a);
    case "year_asc":
      return yearValue(a) - yearValue(b);
    case "title_asc":
      return toSortString(aMd.title).localeCompare(toSortString(bMd.title));
    case "authors_asc":
      return toSortString(aMd.authors).localeCompare(toSortString(bMd.authors));
    case "journal_asc":
      return toSortString(aMd.journal).localeCompare(toSortString(bMd.journal));
    case "doi_asc":
      return toSortString(aMd.doi).localeCompare(toSortString(bMd.doi));
    case "file_modified_desc":
      return modifiedEpoch(b) - modifiedEpoch(a);
    case "file_modified_asc":
      return modifiedEpoch(a) - modifiedEpoch(b);
    default:
      return 0;
  }
}

function sortArticles(articles) {
  const primary = normalizeSortKey(state.primarySort, "year_desc");
  const secondary = normalizeSortKey(state.secondarySort, "title_asc");
  const keys = [primary];
  if (secondary !== "none" && secondary !== primary) {
    keys.push(secondary);
  }
  if (!keys.includes("title_asc")) {
    keys.push("title_asc");
  }

  const sorted = [...articles];
  sorted.sort((a, b) => {
    for (const key of keys) {
      const cmp = compareSortKey(a, b, key);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  return sorted;
}

async function copyToClipboard(text) {
  const clean = normalizeWhitespace(text);
  if (!clean) return false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(clean);
      return true;
    } catch { }
  }
  try {
    const area = document.createElement("textarea");
    area.value = clean;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return Boolean(ok);
  } catch {
    return false;
  }
}

function splitAuthors(authorsRaw) {
  const normalized = normalizeWhitespace(authorsRaw).replace(/\s+and\s+/gi, ", ");
  return normalized
    .split(/[,;]+/)
    .map((chunk) => normalizeWhitespace(chunk))
    .filter(Boolean);
}

function compactAuthors(authorsRaw) {
  const original = normalizeWhitespace(authorsRaw);
  if (!original) return "Unknown authors";
  if (/et\s+al\.?$/i.test(original) || / et\s+al\.?/i.test(original)) return original;

  const parts = splitAuthors(original);
  if (parts.length === 0) return original;
  if (parts.length > 2) return `${parts[0]} et al`;
  return parts.join(", ");
}

function primaryMeta(md) {
  const bits = [normalizeWhitespace(md.year), compactAuthors(md.authors)].filter(Boolean);
  return bits.join(" | ");
}

function openPdf(article) {
  window.open(`/${article.pdf_relpath}`, "_blank", "noopener,noreferrer");
}

function openAbstract(article) {
  const md = article.metadata || {};
  dom.abstractTitle.textContent = md.title || article.pdf_filename || "Abstract";
  const metaBits = [normalizeWhitespace(md.year), compactAuthors(md.authors), normalizeWhitespace(md.journal)].filter(
    Boolean,
  );
  dom.abstractMeta.textContent = metaBits.join(" | ");
  const abstractText = typeof md.abstract === "string" ? md.abstract.trim() : "";
  dom.abstractText.textContent = abstractText || "No abstract available.";

  if (dom.abstractReferencesSection) {
    dom.abstractReferencesSection.style.display = "none";
    clearNode(dom.abstractReferencesList);
  }

  dom.abstractModal.classList.remove("hidden");

  if (dom.abstractReferencesSection) {
    fetchJson(`/api/articles/${article.id}/text-back`).then(res => {
      if (!res || !res.text) return;
      const matches = res.text.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/g) || [];
      const uniqueDois = [...new Set(matches)];
      const ownDoi = normalizeWhitespace(md.doi);
      const refDois = uniqueDois.filter(d => d && d !== ownDoi);

      if (refDois.length > 0) {
        refDois.forEach(doi => {
          const link = document.createElement("a");
          link.href = `https://doi.org/${doi}`;
          link.target = "_blank";
          link.textContent = doi;
          link.style.display = "block";
          link.style.color = "var(--accent)";
          link.style.textDecoration = "none";
          link.addEventListener("mouseover", () => link.style.textDecoration = "underline");
          link.addEventListener("mouseout", () => link.style.textDecoration = "none");
          dom.abstractReferencesList.appendChild(link);
        });
        dom.abstractReferencesSection.style.display = "block";
      }
    }).catch(err => console.warn("Failed to extract backend text:", err));
  }
}

function closeAbstract() {
  dom.abstractModal.classList.add("hidden");
}

function buildCard(article) {
  const md = article.metadata || {};
  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "link");
  card.setAttribute("aria-label", `Open PDF: ${md.title || article.pdf_filename}`);
  card.addEventListener("click", () => openPdf(article));
  card.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      openPdf(article);
    }
  });

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.src = articleThumbSrc(article);
  thumb.alt = md.title || article.pdf_filename;
  card.appendChild(thumb);

  const content = document.createElement("div");
  content.className = "card-content";

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = md.title || article.pdf_filename;
  content.appendChild(title);

  const compact = document.createElement("div");
  compact.className = "card-primary-meta";
  compact.textContent = primaryMeta(md);
  content.appendChild(compact);

  const hoverPanel = document.createElement("div");
  hoverPanel.className = "hover-panel";

  const journal = document.createElement("div");
  journal.className = "hover-journal";
  journal.textContent = normalizeWhitespace(md.journal) || "Journal info unavailable";
  hoverPanel.appendChild(journal);

  const hoverActions = document.createElement("div");
  hoverActions.className = "hover-actions";

  const abstractBtn = document.createElement("button");
  abstractBtn.type = "button";
  abstractBtn.className = "card-btn";
  abstractBtn.textContent = "Read abstract";
  abstractBtn.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    openAbstract(article);
  });
  hoverActions.appendChild(abstractBtn);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "card-btn secondary";
  editBtn.textContent = "Edit metadata";
  editBtn.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    openEditor(article);
  });
  hoverActions.appendChild(editBtn);

  hoverPanel.appendChild(hoverActions);
  content.appendChild(hoverPanel);
  card.appendChild(content);
  return card;
}

function buildDetailsTable(articles) {
  const wrap = document.createElement("div");
  wrap.className = "list-wrap";

  const table = document.createElement("table");
  table.className = "details-table";

  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  const cols = [
    { label: "Year", sortKey: "year" },
    { label: "Authors", sortKey: "authors" },
    { label: "Title", sortKey: "title" },
    { label: "Journal", sortKey: "journal" },
    { label: "DOI", sortKey: "doi" },
    { label: "Actions", sortKey: null }
  ];
  cols.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label;
    if (col.sortKey) {
      th.style.cursor = "pointer";
      th.title = `Sort by ${col.label}`;
      const isPrimary = state.primarySort.startsWith(col.sortKey);
      if (isPrimary) {
        th.textContent += state.primarySort.endsWith("_desc") ? " ▼" : " ▲";
      }
      th.addEventListener("click", () => {
        if (state.primarySort.startsWith(col.sortKey)) {
          state.primarySort = state.primarySort.endsWith("_desc") ? `${col.sortKey}_asc` : `${col.sortKey}_desc`;
        } else {
          state.primarySort = col.sortKey === "year" ? "year_desc" : `${col.sortKey}_asc`;
        }
        dom.primarySort.value = state.primarySort;
        window.localStorage.setItem("article-primary-sort", state.primarySort);
        renderArticles();
      });
    }
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const body = document.createElement("tbody");
  articles.forEach((article) => {
    const md = article.metadata || {};
    const row = document.createElement("tr");
    row.className = "details-row";

    row.tabIndex = 0;
    row.addEventListener("click", () => openPdf(article));
    row.addEventListener("keydown", (evt) => {
      if (evt.target !== row) return;
      if (evt.key === "e" || evt.key === "E") {
        evt.preventDefault();
        evt.stopPropagation();
        openEditor(article);
      } else if (evt.key === "a" || evt.key === "A") {
        evt.preventDefault();
        evt.stopPropagation();
        openAbstract(article);
      } else if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        evt.stopPropagation();
        openPdf(article);
      }
    });

    const tdYear = document.createElement("td");
    tdYear.textContent = normalizeWhitespace(md.year) || "-";
    row.appendChild(tdYear);

    const tdAuthors = document.createElement("td");
    tdAuthors.textContent = normalizeWhitespace(md.authors) || "-";
    row.appendChild(tdAuthors);

    const tdTitle = document.createElement("td");
    tdTitle.className = "table-title";
    tdTitle.textContent = normalizeWhitespace(md.title) || article.pdf_filename;
    row.appendChild(tdTitle);

    const tdJournal = document.createElement("td");
    tdJournal.textContent = normalizeWhitespace(md.journal) || "-";
    row.appendChild(tdJournal);

    const tdDoi = document.createElement("td");
    const doi = normalizeWhitespace(md.doi);
    if (doi) {
      const doiCopy = document.createElement("span");
      doiCopy.className = "doi-copy";
      doiCopy.textContent = doi;
      doiCopy.title = "Click to copy DOI";
      doiCopy.tabIndex = 0;
      doiCopy.setAttribute("role", "button");
      doiCopy.addEventListener("click", async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const ok = await copyToClipboard(doi);
        setStatus(ok ? `DOI copied: ${doi}` : "Failed to copy DOI.", !ok);
      });
      doiCopy.addEventListener("keydown", async (evt) => {
        if (evt.key !== "Enter" && evt.key !== " ") return;
        evt.preventDefault();
        evt.stopPropagation();
        const ok = await copyToClipboard(doi);
        setStatus(ok ? `DOI copied: ${doi}` : "Failed to copy DOI.", !ok);
      });
      tdDoi.appendChild(doiCopy);
    } else {
      tdDoi.textContent = "-";
    }
    row.appendChild(tdDoi);

    const tdActions = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "table-actions";

    const abstractBtn = document.createElement("button");
    abstractBtn.type = "button";
    abstractBtn.className = "card-btn";
    abstractBtn.textContent = "Abstract";
    abstractBtn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openAbstract(article);
    });
    actionWrap.appendChild(abstractBtn);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "card-btn secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openEditor(article);
    });
    actionWrap.appendChild(editBtn);

    tdActions.appendChild(actionWrap);
    row.appendChild(tdActions);
    body.appendChild(row);
  });

  table.appendChild(body);
  wrap.appendChild(table);
  return wrap;
}

function renderArticles() {
  clearNode(dom.grid);
  dom.grid.classList.toggle("details-mode", state.viewMode === "details");
  const sortedArticles = sortArticles(state.articles);
  if (!sortedArticles.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "No articles found for the current filters.";
    dom.grid.appendChild(empty);
    return;
  }
  if (state.viewMode === "details") {
    dom.grid.appendChild(buildDetailsTable(sortedArticles));
    return;
  }
  sortedArticles.forEach((article) => dom.grid.appendChild(buildCard(article)));
}

async function loadTags() {
  const result = await fetchJson("/api/tags");
  const options = result.tags || [];
  const current = state.tag;

  clearNode(dom.tagFilter);
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All tags";
  dom.tagFilter.appendChild(all);

  options.forEach((row) => {
    const opt = document.createElement("option");
    opt.value = row.name;
    opt.textContent = `${row.name} (${row.count})`;
    dom.tagFilter.appendChild(opt);
  });

  dom.tagFilter.value = current;
}

async function loadArticles() {
  setStatus("Loading articles...");
  const query = encodeURIComponent(state.query);
  const tag = encodeURIComponent(state.tag);
  const match_mode = encodeURIComponent(state.tagFilterMode);
  const filter_incomplete = encodeURIComponent(state.filterIncomplete);
  const res = await fetchJson(`/api/articles?query=${query}&tag=${tag}&match_mode=${match_mode}&filter_incomplete=${filter_incomplete}&limit=500`);
  state.articles = res.articles || [];
  state.total = res.total || 0;
  state.generatedAt = res.generated_at || "";
  state.strategy = res.thumbnail_strategy || state.strategy;
  dom.strategySelect.value = state.strategy;

  renderArticles();
  const stamped = prettyDate(state.generatedAt);
  const suffix = stamped ? ` | indexed ${stamped}` : "";
  setStatus(`${state.total} article(s)${suffix}`);
}

function openEditor(article) {
  state.current = article;
  const md = article.metadata || {};
  dom.title.value = md.title || "";
  dom.authors.value = md.authors || "";
  dom.year.value = md.year || "";
  dom.journal.value = md.journal || "";
  dom.doi.value = md.doi || "";
  dom.abstract.value = md.abstract || "";
  dom.tags.value = (md.tags || []).join(", ");
  dom.notes.value = md.notes || "";
  dom.modalThumb.src = articleThumbSrc(article);
  dom.modal.classList.remove("hidden");
}

function closeEditor() {
  state.current = null;
  dom.modal.classList.add("hidden");
  if (dom.thumbFile) dom.thumbFile.value = "";
  dom.modalThumbWrap.classList.remove("drag-active");
}

async function saveMetadata(evt) {
  evt.preventDefault();
  if (!state.current) return;
  const currentId = state.current.id;
  const abstractValue = dom.abstract.value.replace(/\r\n/g, "\n");
  const notesValue = dom.notes.value.replace(/\r\n/g, "\n");

  const payload = {
    title: dom.title.value.trim(),
    authors: dom.authors.value.trim(),
    year: dom.year.value.trim(),
    journal: dom.journal.value.trim(),
    doi: dom.doi.value.trim(),
    abstract: abstractValue,
    tags: dom.tags.value
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    notes: notesValue,
  };

  setStatus("Saving metadata...");
  try {
    const result = await fetchJson(`/api/articles/${currentId}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const savedArticle = result?.article || null;

    if (!savedArticle) {
      throw new Error("Server did not return updated article.");
    }

    const idx = state.articles.findIndex((a) => a.id === currentId);
    if (idx >= 0) {
      state.articles[idx] = savedArticle;
    } else {
      state.articles.push(savedArticle);
    }

    state.current = savedArticle;
    renderArticles();
    openEditor(savedArticle);

    await loadTags();
    setStatus("Metadata saved.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setStatus(`Save failed: ${message}`, true);
  }
}

function isImageFile(file) {
  return Boolean(file && typeof file.type === "string" && file.type.toLowerCase().startsWith("image/"));
}

function previewSelectedThumb(file) {
  if (!file) return;
  const blobUrl = URL.createObjectURL(file);
  dom.modalThumb.src = blobUrl;
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

async function uploadManualThumbnail(fileOverride = null) {
  if (!state.current) return;
  const currentId = state.current.id;
  const file = fileOverride || dom.thumbFile.files?.[0];
  if (!file) {
    setStatus("Choose an image first.", true);
    return;
  }
  if (!isImageFile(file)) {
    setStatus("Dropped/selected file is not an image.", true);
    return;
  }

  previewSelectedThumb(file);
  setStatus("Uploading manual thumbnail...");
  const formData = new FormData();
  formData.append("thumbnail", file);
  await fetchJson(`/api/articles/${currentId}/thumbnail`, {
    method: "POST",
    body: formData,
  });
  await loadArticles();
  state.current = state.articles.find((a) => a.id === currentId) || null;
  if (state.current) openEditor(state.current);
  dom.thumbFile.value = "";
  setStatus("Manual thumbnail saved.");
}

async function resetAutoThumbnail() {
  if (!state.current) return;
  const currentId = state.current.id;
  setStatus("Switching back to auto thumbnail...");
  await fetchJson(`/api/articles/${state.current.id}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thumbnail_mode: "auto" }),
  });
  await loadArticles();
  state.current = state.articles.find((a) => a.id === currentId) || null;
  if (state.current) openEditor(state.current);
  setStatus("Auto thumbnail restored.");
}

async function reindex() {
  const strategy = dom.strategySelect.value;
  setMenuOpen(false);
  setStatus(`Reindexing with ${strategy} strategy...`);
  dom.reindexBtn.disabled = true;
  try {
    await fetchJson("/api/reindex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy }),
    });
    await Promise.all([loadTags(), loadArticles()]);
    setStatus("Reindex complete.");
    if (state.articles.length > 0) {
      checkDuplicates();
    }
  } finally {
    dom.reindexBtn.disabled = false;
  }
}

async function checkDuplicates() {
  // Group articles by DOI
  const doiMap = new Map();
  for (const article of state.articles) {
    const doi = (article.metadata && article.metadata.doi || "").trim();
    if (!doi) continue;
    if (!doiMap.has(doi)) doiMap.set(doi, []);
    doiMap.get(doi).push(article);
  }

  const duplicates = [];
  for (const [doi, list] of doiMap.entries()) {
    if (list.length > 1) {
      duplicates.push({ doi, articles: list });
    }
  }

  if (duplicates.length === 0) return;

  // Show modal
  clearNode(dom.duplicateList);
  for (const group of duplicates) {
    const groupEl = document.createElement("div");
    groupEl.style.border = "1px solid var(--line)";
    groupEl.style.padding = "10px";
    groupEl.style.borderRadius = "6px";

    const header = document.createElement("h3");
    header.style.margin = "0 0 10px 0";
    header.style.fontSize = "1rem";
    header.textContent = `DOI: ${group.doi}`;
    groupEl.appendChild(header);

    for (const article of group.articles) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "6px 0";
      row.style.borderTop = "1px solid var(--line)";

      const info = document.createElement("div");
      const title = document.createElement("div");
      title.style.fontWeight = "bold";
      title.textContent = article.metadata?.title || article.pdf_filename;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = article.pdf_filename;
      info.appendChild(title);
      info.appendChild(meta);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "danger";
      delBtn.style.padding = "4px 8px";
      delBtn.style.fontSize = "0.8rem";
      delBtn.textContent = "Remove";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Permanently remove ${article.pdf_filename}?`)) return;
        try {
          await fetchJson(`/api/articles/${article.id}`, { method: "DELETE" });
          row.remove();
          state.articles = state.articles.filter(a => a.id !== article.id);
          renderArticles();
          if (groupEl.querySelectorAll("button").length <= 1) {
            groupEl.remove();
          }
          if (dom.duplicateList.querySelectorAll("h3").length === 0) {
            dom.duplicateModal.classList.add("hidden");
          }
        } catch (err) {
          alert(`Failed to remove: ${err}`);
        }
      });

      row.appendChild(info);
      row.appendChild(delBtn);
      groupEl.appendChild(row);
    }
    dom.duplicateList.appendChild(groupEl);
  }

  if (dom.duplicateModal) {
    dom.duplicateModal.classList.remove("hidden");
  }
}

const debouncedSearch = debounce(async () => {
  state.query = dom.searchInput.value.trim();
  await loadArticles();
}, 180);

function wireEvents() {
  if (state.viewMode !== "preview" && state.viewMode !== "details") {
    state.viewMode = "preview";
  }
  state.primarySort = normalizeSortKey(state.primarySort, "year_desc");
  state.secondarySort = normalizeSortKey(state.secondarySort, "title_asc");
  state.fontFamily = normalizeFontKey(state.fontFamily, "segoe");
  dom.viewMode.value = state.viewMode;
  dom.primarySort.value = state.primarySort;
  dom.secondarySort.value = state.secondarySort;
  applyCardHeight(state.cardHeight);
  applyCardFont(state.cardFont);
  applyFontFamily(state.fontFamily);
  setMenuOpen(false);

  dom.searchInput.addEventListener("input", debouncedSearch);
  dom.tagFilter.addEventListener("change", async () => {
    state.tag = dom.tagFilter.value.trim();
    await loadArticles();
  });
  if (dom.tagFilterMode) {
    dom.tagFilterMode.checked = state.tagFilterMode === "all";
    dom.tagFilterMode.addEventListener("change", async () => {
      state.tagFilterMode = dom.tagFilterMode.checked ? "all" : "any";
      window.localStorage.setItem("article-tag-mode", state.tagFilterMode);
      await loadArticles();
    });
  }
  if (dom.filterIncomplete) {
    dom.filterIncomplete.checked = state.filterIncomplete;
    dom.filterIncomplete.addEventListener("change", async () => {
      state.filterIncomplete = dom.filterIncomplete.checked;
      window.localStorage.setItem("article-filter-incomplete", String(state.filterIncomplete));
      await loadArticles();
    });
  }
  dom.viewMode.addEventListener("change", () => {
    state.viewMode = dom.viewMode.value === "details" ? "details" : "preview";
    window.localStorage.setItem("article-view-mode", state.viewMode);
    renderArticles();
  });
  dom.primarySort.addEventListener("change", () => {
    state.primarySort = normalizeSortKey(dom.primarySort.value, "year_desc");
    dom.primarySort.value = state.primarySort;
    window.localStorage.setItem("article-primary-sort", state.primarySort);
    renderArticles();
  });
  dom.secondarySort.addEventListener("change", () => {
    state.secondarySort = normalizeSortKey(dom.secondarySort.value, "title_asc");
    dom.secondarySort.value = state.secondarySort;
    window.localStorage.setItem("article-secondary-sort", state.secondarySort);
    renderArticles();
  });
  dom.menuToggle.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMenuOpen(!state.menuOpen);
  });
  dom.cardHeightSlider.addEventListener("input", () => {
    applyCardHeight(dom.cardHeightSlider.value);
    window.localStorage.setItem("article-card-height", String(state.cardHeight));
  });

  if (dom.cardHeightAutofit) {
    dom.cardHeightAutofit.checked = state.autoFitHeight;
    dom.cardHeightAutofit.addEventListener("change", () => {
      state.autoFitHeight = dom.cardHeightAutofit.checked;
      window.localStorage.setItem("article-autofit-height", String(state.autoFitHeight));
      applyCardHeight(state.cardHeight);
    });
  }

  dom.cardFontSlider.addEventListener("input", () => {
    applyCardFont(dom.cardFontSlider.value);
    window.localStorage.setItem("article-card-font", String(state.cardFont));
  });
  if (dom.fontFamilySelect) {
    dom.fontFamilySelect.addEventListener("change", () => {
      applyFontFamily(dom.fontFamilySelect.value);
      window.localStorage.setItem("article-font-family", state.fontFamily);
    });
  }
  dom.metaRemove.addEventListener("click", async () => {
    if (!state.current) return;
    const md = state.current.metadata || {};
    const title = md.title || state.current.pdf_filename;
    if (!confirm(`Are you sure you want to permanently remove "${title}"? This will delete the PDF file and cannot be undone.`)) {
      return;
    }
    setStatus("Removing article...");
    try {
      await fetchJson(`/api/articles/${state.current.id}`, { method: "DELETE" });
      closeEditor();
      await Promise.all([loadTags(), loadArticles()]);
      setStatus("Article removed.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Failed to remove article: ${message}`, true);
    }
  });

  dom.reindexBtn.addEventListener("click", reindex);
  dom.modalClose.addEventListener("click", closeEditor);
  dom.abstractClose.addEventListener("click", closeAbstract);
  if (dom.duplicateClose) dom.duplicateClose.addEventListener("click", () => dom.duplicateModal.classList.add("hidden"));
  dom.form.addEventListener("submit", saveMetadata);
  dom.thumbUpload.addEventListener("click", () => uploadManualThumbnail());
  dom.thumbFile.addEventListener("change", async () => {
    const file = dom.thumbFile.files?.[0];
    if (!file) return;
    await uploadManualThumbnail(file);
  });

  if (dom.doiFetchBtn) {
    dom.doiFetchBtn.addEventListener("click", async () => {
      let doiStr = dom.doi.value.trim();
      const originalText = dom.doiFetchBtn.textContent;
      dom.doiFetchBtn.textContent = "Fetching...";
      dom.doiFetchBtn.disabled = true;

      if (!doiStr) {
        try {
          const res = await fetchJson(`/api/articles/${state.current.id}/text-front`);
          const match = (res.text || "").match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
          if (match) {
            doiStr = match[0];
            dom.doi.value = doiStr;
            setStatus("DOI found in PDF text.");
          } else {
            alert("No DOI found in PDF text. Please input a DOI string manually.");
            dom.doiFetchBtn.textContent = originalText;
            dom.doiFetchBtn.disabled = false;
            return;
          }
        } catch (err) {
          alert(`Failed to extract text from PDF: ${err.message || err}`);
          dom.doiFetchBtn.textContent = originalText;
          dom.doiFetchBtn.disabled = false;
          return;
        }
      }

      try {
        const resp = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doiStr)}`);
        if (!resp.ok) throw new Error(`Crossref API returned ${resp.status}`);
        const crossref = await resp.json();
        const msg = crossref.message;

        const title = msg.title?.[0] || "";
        const authors_list = (msg.author || []).map(a => {
          if (a.given && a.family) return `${a.given} ${a.family}`;
          return a.family || "";
        }).filter(Boolean);
        const authors = authors_list.join(", ");

        let year = "";
        const dates_to_try = [msg.published, msg["published-print"], msg["published-online"]];
        for (const d of dates_to_try) {
          if (d && d["date-parts"] && d["date-parts"][0] && d["date-parts"][0][0]) {
            year = String(d["date-parts"][0][0]);
            break;
          }
        }

        const journal = msg["container-title"]?.[0] || "";
        const returned_doi = msg.DOI || doiStr;

        let abstract_text = msg.abstract_raw || msg.abstract || "";
        abstract_text = abstract_text.replace(/<[^>]*>?/gm, "").trim();

        if (title) dom.title.value = title;
        if (authors) dom.authors.value = authors;
        if (year) dom.year.value = year;
        if (journal) dom.journal.value = journal;
        if (abstract_text) dom.abstract.value = abstract_text;
        if (returned_doi) dom.doi.value = returned_doi;

        setStatus("Metadata successfully fetched from Crossref.");
      } catch (err) {
        alert(`Failed to fetch DOI metadata from Crossref: ${err.message || err}`);
        setStatus(`DOI Fetch Failed: ${err.message || err}`, true);
      } finally {
        dom.doiFetchBtn.textContent = originalText;
        dom.doiFetchBtn.disabled = false;
      }
    });
  }


  ["dragenter", "dragover"].forEach((name) => {
    dom.modalThumbWrap.addEventListener(name, (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      dom.modalThumbWrap.classList.add("drag-active");
    });
  });
  ["dragleave", "dragend"].forEach((name) => {
    dom.modalThumbWrap.addEventListener(name, (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      dom.modalThumbWrap.classList.remove("drag-active");
    });
  });
  dom.modalThumbWrap.addEventListener("drop", async (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    dom.modalThumbWrap.classList.remove("drag-active");
    const file = evt.dataTransfer?.files?.[0];
    if (!file) return;
    await uploadManualThumbnail(file);
  });
  dom.thumbReset.addEventListener("click", resetAutoThumbnail);

  if (dom.errorBannerClose) {
    dom.errorBannerClose.addEventListener("click", () => {
      dom.errorBanner.style.display = "none";
    });
  }
  if (dom.errorLogClear) {
    dom.errorLogClear.addEventListener("click", () => {
      if (dom.errorLogList) dom.errorLogList.innerHTML = "";
    });
  }
  if (dom.showErrorsCheckbox) {
    dom.showErrorsCheckbox.checked = state.showErrorsGlobally;
    dom.showErrorsCheckbox.addEventListener("change", () => {
      state.showErrorsGlobally = dom.showErrorsCheckbox.checked;
      window.localStorage.setItem("article-show-errors", String(state.showErrorsGlobally));
      if (!state.showErrorsGlobally && dom.errorBanner) {
        dom.errorBanner.style.display = "none";
      }
    });
  }

  document.addEventListener("click", (evt) => {
    if (!state.menuOpen) return;
    if (dom.settingsWrap.contains(evt.target)) return;
    setMenuOpen(false);
  });

  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && state.menuOpen) {
      setMenuOpen(false);
    }
  });
}

function logGlobalError(message, source, lineno) {
  const time = new Date().toLocaleTimeString();
  const li = document.createElement("li");
  let text = `[${time}] ${message}`;
  if (source) text += ` (${source}:${lineno})`;
  li.textContent = text;
  if (dom.errorLogList) {
    dom.errorLogList.prepend(li);
    while (dom.errorLogList.children.length > 50) {
      dom.errorLogList.removeChild(dom.errorLogList.lastChild);
    }
  }

  if (state.showErrorsGlobally) {
    if (dom.errorBannerText) dom.errorBannerText.textContent = message;
    if (dom.errorBanner) dom.errorBanner.style.display = "flex";
  }
}

window.addEventListener("error", (e) => {
  logGlobalError(e.message, e.filename, e.lineno);
});

window.addEventListener("unhandledrejection", (e) => {
  logGlobalError(e.reason?.message || String(e.reason));
});

async function init() {
  wireEvents();
  try {
    await Promise.all([loadTags(), loadArticles()]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setStatus(`Failed to load: ${message}`, true);
  }
}

init();
