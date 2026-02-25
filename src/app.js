// Tauri IPC bridge
const { invoke } = window.__TAURI__.core;

// Thumbnail cache: relPath -> dataUrl
const thumbCache = new Map();

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
    cardFont: Number.parseInt(window.localStorage.getItem("article-card-font") || "14", 10),
    fontFamily: window.localStorage.getItem("article-font-family") || "segoe",
    primarySort: window.localStorage.getItem("article-primary-sort") || "year_desc",
    secondarySort: window.localStorage.getItem("article-secondary-sort") || "title_asc",
    menuOpen: false,
};

const dom = {
    settingsWrap: document.getElementById("settings-wrap"),
    menuToggle: document.getElementById("menu-toggle"),
    settingsMenu: document.getElementById("settings-menu"),
    primarySort: document.getElementById("primary-sort"),
    secondarySort: document.getElementById("secondary-sort"),
    cardHeightSlider: document.getElementById("card-height-slider"),
    cardHeightValue: document.getElementById("card-height-value"),
    cardFontSlider: document.getElementById("card-font-slider"),
    cardFontValue: document.getElementById("card-font-value"),
    fontFamilySelect: document.getElementById("font-family-select"),
    searchInput: document.getElementById("search-input"),
    tagFilter: document.getElementById("tag-filter"),
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
    abstract: document.getElementById("f-abstract"),
    tags: document.getElementById("f-tags"),
    notes: document.getElementById("f-notes"),
    abstractModal: document.getElementById("abstract-modal"),
    abstractClose: document.getElementById("abstract-close"),
    abstractTitle: document.getElementById("abstract-title"),
    abstractMeta: document.getElementById("abstract-meta"),
    abstractText: document.getElementById("abstract-text"),
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

function normalizeWhitespace(text) {
    return (text || "").replace(/\s+/g, " ").trim();
}

// Get thumbnail data URL (cached)
async function getThumbDataUrl(relPath) {
    if (!relPath) return "";
    if (thumbCache.has(relPath)) return thumbCache.get(relPath);
    try {
        const dataUrl = await invoke("get_thumbnail_url", { relPath });
        if (dataUrl) thumbCache.set(relPath, dataUrl);
        return dataUrl || "";
    } catch {
        return "";
    }
}

function articleThumbPath(article) {
    return article?.thumbnail?.path || "";
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

async function openPdf(article) {
    try {
        await invoke("open_pdf", { relpath: article.pdf_relpath });
    } catch (err) {
        setStatus(`Failed to open PDF: ${err}`, true);
    }
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
    dom.abstractModal.classList.remove("hidden");
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
    thumb.alt = md.title || article.pdf_filename;
    // Load thumbnail asynchronously
    const thumbPath = articleThumbPath(article);
    if (thumbPath) {
        getThumbDataUrl(thumbPath).then((url) => {
            if (url) thumb.src = url;
        });
    }
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
    table.innerHTML =
        "<thead><tr><th>Year</th><th>Authors</th><th>Title</th><th>Journal</th><th>DOI</th><th>Actions</th></tr></thead>";

    const body = document.createElement("tbody");
    articles.forEach((article) => {
        const md = article.metadata || {};
        const row = document.createElement("tr");
        row.className = "details-row";
        row.addEventListener("click", () => openPdf(article));

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
    const result = await invoke("get_tags");
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
    const res = await invoke("get_articles", {
        query: state.query || null,
        tag: state.tag || null,
        limit: 500,
        offset: 0,
    });
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

    // Load thumbnail into modal
    const thumbPath = articleThumbPath(article);
    if (thumbPath) {
        getThumbDataUrl(thumbPath).then((url) => {
            if (url) dom.modalThumb.src = url;
        });
    }
    dom.modal.classList.remove("hidden");
}

function closeEditor() {
    state.current = null;
    dom.modal.classList.add("hidden");
    dom.thumbFile.value = "";
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
        const result = await invoke("save_metadata", {
            articleId: currentId,
            payload,
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
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
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

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            // Remove "data:...;base64," prefix
            const base64 = result.split(",")[1] || "";
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
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

    try {
        const base64Data = await fileToBase64(file);
        await invoke("upload_thumbnail", {
            articleId: currentId,
            data: base64Data,
        });
        // Invalidate thumbnail cache for this article
        const thumbPath = articleThumbPath(state.current);
        if (thumbPath) thumbCache.delete(thumbPath);

        await loadArticles();
        state.current = state.articles.find((a) => a.id === currentId) || null;
        if (state.current) openEditor(state.current);
        dom.thumbFile.value = "";
        setStatus("Manual thumbnail saved.");
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Upload failed: ${message}`, true);
    }
}

async function resetAutoThumbnail() {
    if (!state.current) return;
    const currentId = state.current.id;
    setStatus("Switching back to auto thumbnail...");
    try {
        await invoke("save_metadata", {
            articleId: state.current.id,
            payload: { thumbnail_mode: "auto" },
        });
        const thumbPath = articleThumbPath(state.current);
        if (thumbPath) thumbCache.delete(thumbPath);

        await loadArticles();
        state.current = state.articles.find((a) => a.id === currentId) || null;
        if (state.current) openEditor(state.current);
        setStatus("Auto thumbnail restored.");
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Reset failed: ${message}`, true);
    }
}

async function doReindex() {
    const strategy = dom.strategySelect.value;
    setMenuOpen(false);
    setStatus(`Reindexing with ${strategy} strategy...`);
    dom.reindexBtn.disabled = true;
    try {
        await invoke("reindex", { strategy });
        thumbCache.clear();
        await Promise.all([loadTags(), loadArticles()]);
        setStatus("Reindex complete.");
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Reindex failed: ${message}`, true);
    } finally {
        dom.reindexBtn.disabled = false;
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
    dom.reindexBtn.addEventListener("click", doReindex);
    dom.modalClose.addEventListener("click", closeEditor);
    dom.abstractClose.addEventListener("click", closeAbstract);
    dom.form.addEventListener("submit", saveMetadata);
    dom.thumbUpload.addEventListener("click", () => uploadManualThumbnail());
    dom.thumbFile.addEventListener("change", async () => {
        const file = dom.thumbFile.files?.[0];
        if (!file) return;
        await uploadManualThumbnail(file);
    });

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

async function init() {
    wireEvents();
    try {
        await Promise.all([loadTags(), loadArticles()]);
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to load: ${message}`, true);
    }
}

init();
