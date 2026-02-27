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
    cardWidth: Number.parseInt(window.localStorage.getItem("article-card-width") || "200", 10),
    cardFont: Number.parseInt(window.localStorage.getItem("article-card-font") || "14", 10),
    fontFamily: window.localStorage.getItem("article-font-family") || "segoe",
    primarySort: window.localStorage.getItem("article-primary-sort") || "year_desc",
    secondarySort: window.localStorage.getItem("article-secondary-sort") || "title_asc",
    menuOpen: false,
    highlightIncomplete: window.localStorage.getItem("article-highlight-incomplete") === "true",
    tintByTag: window.localStorage.getItem("article-tint-by-tag") === "true",
    colorIntensity: Number.parseInt(window.localStorage.getItem("article-color-intensity") || "13", 10),
    tagColors: JSON.parse(window.localStorage.getItem("article-tag-colors") || "{}"),
    acIndex: -1,
};

const dom = {
    topbar: document.getElementById("topbar"),
    settingsWrap: document.getElementById("settings-wrap"),
    menuToggle: document.getElementById("menu-toggle"),
    settingsMenu: document.getElementById("settings-menu"),
    primarySort: document.getElementById("primary-sort"),
    secondarySort: document.getElementById("secondary-sort"),
    cardHeightSlider: document.getElementById("card-height-slider"),
    cardHeightValue: document.getElementById("card-height-value"),
    cardWidthSlider: document.getElementById("card-width-slider"),
    cardWidthValue: document.getElementById("card-width-value"),
    cardFontSlider: document.getElementById("card-font-slider"),
    cardFontValue: document.getElementById("card-font-value"),
    colorIntensitySlider: document.getElementById("color-intensity-slider"),
    colorIntensityValue: document.getElementById("color-intensity-value"),
    fontFamilySelect: document.getElementById("font-family-select"),
    searchInput: document.getElementById("search-input"),
    tagFilter: document.getElementById("tag-filter"),
    strategySelect: document.getElementById("strategy-select"),
    viewModeToggle: document.getElementById("view-mode-toggle"),
    parsePdfs: document.getElementById("parse-pdfs"),
    reindexBtn: document.getElementById("reindex-btn"),
    openArticlesBtn: document.getElementById("open-articles-btn"),
    statusLine: document.getElementById("status-line"),
    grid: document.getElementById("grid"),
    modal: document.getElementById("edit-modal"),
    modalClose: document.getElementById("modal-close"),
    modalThumbWrap: document.getElementById("modal-thumb-wrap"),
    modalThumb: document.getElementById("modal-thumb"),
    emptyState: document.getElementById("empty-state"),
    emptyUploadBtn: document.getElementById("empty-upload-btn"),
    emptyReindexBtn: document.getElementById("empty-reindex-btn"),
    emptyFileInput: document.getElementById("empty-file-input"),
    thumbPaste: document.getElementById("thumb-paste"),
    thumbReset: document.getElementById("thumb-reset"),
    form: document.getElementById("metadata-form"),
    title: document.getElementById("f-title"),
    authors: document.getElementById("f-authors"),
    year: document.getElementById("f-year"),
    journal: document.getElementById("f-journal"),
    volume: document.getElementById("f-volume"),
    issue: document.getElementById("f-issue"),
    pages: document.getElementById("f-pages"),
    doi: document.getElementById("f-doi"),
    doiFetchBtn: document.getElementById("doi-fetch-btn"),
    abstract: document.getElementById("f-abstract"),
    pasteCleanup: document.getElementById("paste-cleanup"),
    tagChipContainer: document.getElementById("tag-chip-container"),
    tagInput: document.getElementById("f-tag-input"),
    tagAutocomplete: document.getElementById("tag-autocomplete"),
    notes: document.getElementById("f-notes"),
    autoHideTopbar: document.getElementById("auto-hide-topbar"),
    abstractModal: document.getElementById("abstract-modal"),
    abstractClose: document.getElementById("abstract-close"),
    abstractTitle: document.getElementById("abstract-title"),
    abstractMeta: document.getElementById("abstract-meta"),
    abstractText: document.getElementById("abstract-text"),
    highlightBtn: document.getElementById("highlight-btn"),
    dropOverlay: document.getElementById("drop-overlay"),
    tintByTag: document.getElementById("tint-by-tag"),
    editTagColorsBtn: document.getElementById("edit-tag-colors-btn"),
    tagColorEditor: document.getElementById("tag-color-editor"),
    tagColorList: document.getElementById("tag-color-list"),
    tagColorClose: document.getElementById("tag-color-close"),
    toast: document.getElementById("toast"),
    hotkeysBtn: document.getElementById("hotkeys-btn"),
    hotkeysModal: document.getElementById("hotkeys-modal"),
    hotkeysClose: document.getElementById("hotkeys-close"),
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
    "date_added_desc",
    "date_added_asc",
    "last_opened_desc",
    "last_opened_asc",
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

function clampCardWidth(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return 200;
    return Math.max(120, Math.min(600, n));
}

function applyCardWidth(value) {
    const cardWidth = clampCardWidth(value);
    state.cardWidth = cardWidth;
    document.documentElement.style.setProperty("--card-min-width", `${cardWidth}px`);
    dom.cardWidthSlider.value = String(cardWidth);
    dom.cardWidthValue.textContent = String(cardWidth);
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

// Clean pasted author text from PDF copy
function cleanAuthors(raw) {
    let s = raw;
    // Remove unicode superscript digits and letters (⁰¹²³⁴⁵⁶⁷⁸⁹ᵃᵇᶜᵈᵉ...)
    s = s.replace(/[\u2070-\u209F\u00B2\u00B3\u00B9\u1D43-\u1D6A\u2071\u207F]/g, "");
    // Remove asterisks, daggers, double daggers, section signs
    s = s.replace(/[*†‡§¶]/g, "");
    // Remove standalone numeric superscripts (digits sitting alone between words — e.g. "Smith1,2 Jones")
    s = s.replace(/(?<=\w)\s*\d+(?:\s*[,;]\s*\d+)*(?=\s*[,;&]|\s+[A-Z]|\s*$)/g, "");
    // Remove stray standalone single digits not part of years or words
    s = s.replace(/(?<=,\s*)\d+\s*(?=,|$)/g, "");
    // Remove trailing numbers after names
    s = s.replace(/\b(\d+)\b(?!\s*\d{3})/g, (match, num) => {
        // Keep 4-digit years, remove everything else
        return num.length === 4 ? match : "";
    });
    // Collapse multiple spaces/commas
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/,\s*,+/g, ",");
    // Normalize "&" → "and"
    s = s.replace(/\s*&\s*/g, " and ");
    // Normalize line breaks → space
    s = s.replace(/[\r\n]+/g, " ").trim();
    // Split into individual author tokens by comma or "and"
    let authors = s.split(/\s*,\s*/).map((a) => a.trim()).filter(Boolean);
    // Handle "and" in last entry: "Smith and Jones" → ["Smith", "Jones"]
    if (authors.length > 0) {
        const last = authors[authors.length - 1];
        const andParts = last.split(/\s+and\s+/i);
        if (andParts.length === 2 && andParts[0].trim() && andParts[1].trim()) {
            authors[authors.length - 1] = andParts[0].trim();
            authors.push(andParts[1].trim());
        }
    }
    // Remove stray single-letter superscripts: a lone single letter between authors
    // that isn't part of an initial pattern (e.g., "a" between "Smith" and "Jones")
    authors = authors.filter((a) => {
        // Keep if it's longer than 1 char, or if it looks like an initial (A. or A)
        if (a.length > 2) return true;
        if (a.length === 0) return false;
        // Single letter with optional period — could be initial or superscript
        // Keep it if it has a period (initial), reject bare single letters
        if (/^[a-z]$/i.test(a)) return false; // bare single letter = superscript artifact
        return true;
    });
    // Ensure periods after initials: "J Smith" → "J. Smith", "A B Smith" → "A. B. Smith"
    authors = authors.map((author) => {
        return author.replace(/\b([A-Z])(?=\s|$)/g, "$1.");
    });
    // Rejoin with ", " and "and" before last
    if (authors.length <= 1) return authors.join("");
    if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
    return `${authors.slice(0, -1).join(", ")}, and ${authors[authors.length - 1]}`;
}

// Clean pasted abstract text from PDF copy
function cleanAbstract(raw) {
    let s = raw;
    // Join hyphenated line breaks (word-\n continuation)
    s = s.replace(/-\s*[\r\n]+\s*/g, "");
    // Replace remaining line breaks with space
    s = s.replace(/[\r\n]+/g, " ");
    // Remove stray super/subscript unicode chars
    s = s.replace(/[\u2070-\u209F\u00B2\u00B3\u00B9\u1D43-\u1D6A\u2071\u207F]/g, "");
    // Collapse whitespace
    s = s.replace(/\s+/g, " ").trim();
    // Split into sentences (keep the delimiter with the preceding sentence)
    const sentences = s.match(/[^.!?]*[.!?]+(\s|$)/g) || [s];
    const cleaned = sentences.map((sent) => sent.trim()).filter(Boolean);
    if (cleaned.length <= 3) return cleaned.join(" ");
    // Split into 3 roughly equal-size groups
    const perGroup = Math.ceil(cleaned.length / 3);
    const groups = [];
    for (let i = 0; i < cleaned.length; i += perGroup) {
        groups.push(cleaned.slice(i, i + perGroup).join(" "));
    }
    return groups.join("\n\n");
}

// ---- Tag chip system ----
function getAllKnownTags() {
    const set = new Set();
    for (const article of state.articles) {
        for (const tag of (article.metadata?.tags || [])) {
            const t = tag.trim();
            if (t) set.add(t);
        }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function addTagChip(tag) {
    const t = tag.trim();
    if (!t) return;
    // Don't dupe
    const existing = getTagChips();
    if (existing.some((e) => e.toLowerCase() === t.toLowerCase())) return;
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.dataset.tag = t;
    chip.textContent = t;
    const x = document.createElement("span");
    x.className = "chip-x";
    x.textContent = "×";
    x.addEventListener("click", () => chip.remove());
    chip.appendChild(x);
    // Insert before the input
    dom.tagChipContainer.insertBefore(chip, dom.tagInput);
}

function setTagChips(tags) {
    // Remove existing chips
    dom.tagChipContainer.querySelectorAll(".tag-chip").forEach((c) => c.remove());
    for (const tag of tags) addTagChip(tag);
}

function getTagChips() {
    return Array.from(dom.tagChipContainer.querySelectorAll(".tag-chip"))
        .map((c) => c.dataset.tag)
        .filter(Boolean);
}

function fuzzyMatch(tag, query) {
    const lower = tag.toLowerCase();
    const q = query.toLowerCase();
    if (lower.includes(q)) return { match: true, score: lower.indexOf(q) === 0 ? 2 : 1, tag };
    // Simple fuzzy: all query chars appear in order
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i++) {
        if (lower[i] === q[qi]) qi++;
    }
    if (qi === q.length) return { match: true, score: 0, tag };
    return { match: false, score: -1, tag };
}

function updateTagAutocomplete(query) {
    clearNode(dom.tagAutocomplete);
    if (!query.trim()) {
        dom.tagAutocomplete.classList.add("hidden");
        state.acIndex = -1;
        return;
    }
    const currentTags = new Set(getTagChips().map((t) => t.toLowerCase()));
    const allTags = getAllKnownTags().filter((t) => !currentTags.has(t.toLowerCase()));
    const matches = allTags
        .map((t) => fuzzyMatch(t, query))
        .filter((m) => m.match)
        .sort((a, b) => b.score - a.score);
    if (matches.length === 0) {
        dom.tagAutocomplete.classList.add("hidden");
        state.acIndex = -1;
        return;
    }
    state.acIndex = 0;
    const q = query.toLowerCase();
    for (let i = 0; i < matches.length && i < 8; i++) {
        const item = document.createElement("div");
        item.className = "ac-item" + (i === 0 ? " active" : "");
        // Highlight matching portion
        const tag = matches[i].tag;
        const idx = tag.toLowerCase().indexOf(q);
        if (idx >= 0) {
            item.innerHTML =
                escapeHtml(tag.slice(0, idx)) +
                `<span class="ac-match">${escapeHtml(tag.slice(idx, idx + q.length))}</span>` +
                escapeHtml(tag.slice(idx + q.length));
        } else {
            item.textContent = tag;
        }
        item.dataset.tag = tag;
        item.addEventListener("mousedown", (evt) => {
            evt.preventDefault(); // keep focus on input
            addTagChip(tag);
            dom.tagInput.value = "";
            dom.tagAutocomplete.classList.add("hidden");
        });
        dom.tagAutocomplete.appendChild(item);
    }
    dom.tagAutocomplete.classList.remove("hidden");
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
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

function dateEpoch(dateStr) {
    const raw = normalizeWhitespace(dateStr);
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
        case "date_added_desc":
            return dateEpoch(b.date_added) - dateEpoch(a.date_added);
        case "date_added_asc":
            return dateEpoch(a.date_added) - dateEpoch(b.date_added);
        case "last_opened_desc":
            return dateEpoch(b.last_opened) - dateEpoch(a.last_opened);
        case "last_opened_asc":
            return dateEpoch(a.last_opened) - dateEpoch(b.last_opened);
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

function openFileLocation(article) {
    invoke("open_file_location", { relpath: article.pdf_relpath }).then(() => {
        showToast("Opened file location");
    }).catch((err) => {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to open location: ${message}`, true);
    });
}

// Toast notification
let toastTimer = null;
function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.remove("hidden");
    dom.toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        dom.toast.classList.remove("visible");
        setTimeout(() => dom.toast.classList.add("hidden"), 300);
    }, 2200);
}

// BibTeX generation
function generateBibtex(article) {
    const md = article.metadata || {};
    const authors = splitAuthors(md.authors || "").join(" and ");
    const lastName = (md.authors || "Unknown").split(/[,;\s]+/)[0].toLowerCase();
    const yr = md.year || "0000";
    const key = `${lastName}${yr}`;
    let bib = `@article{${key},\n`;
    bib += `  title     = {${md.title || ""}},\n`;
    bib += `  author    = {${authors}},\n`;
    bib += `  year      = {${yr}},\n`;
    if (md.journal) bib += `  journal   = {${md.journal}},\n`;
    if (md.volume) bib += `  volume    = {${md.volume}},\n`;
    if (md.number) bib += `  number    = {${md.number}},\n`;
    if (md.pages) bib += `  pages     = {${md.pages}},\n`;
    if (md.doi) bib += `  doi       = {${md.doi}},\n`;
    bib += `}`;
    return bib;
}

// Color helpers for tag tinting
function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s * 100, l * 100];
}

function getCardTint(article) {
    if (!state.tintByTag) return null;
    const tags = (article.metadata?.tags || []).filter((t) => t.trim() && state.tagColors[t.trim()]);
    if (tags.length === 0) return null;
    let hSum = 0, sSum = 0, lSum = 0;
    for (const tag of tags) {
        const [h, s, l] = hexToHsl(state.tagColors[tag.trim()]);
        hSum += h; sSum += s; lSum += l;
    }
    const n = tags.length;
    let alpha = state.colorIntensity / 100;
    return `hsla(${Math.round(hSum / n)}, ${Math.round(sSum / n)}%, ${Math.round(lSum / n)}%, ${alpha})`;
}

function saveTagColors() {
    window.localStorage.setItem("article-tag-colors", JSON.stringify(state.tagColors));
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

function hasEmptyMetadata(article) {
    const md = article.metadata || {};
    const fields = [
        normalizeWhitespace(md.title),
        normalizeWhitespace(md.authors),
        normalizeWhitespace(md.year),
        normalizeWhitespace(md.journal),
        normalizeWhitespace(md.doi),
        normalizeWhitespace(typeof md.abstract_text === "string" ? md.abstract_text : (md.abstract || "")),
    ];
    const tagsEmpty = !md.tags || md.tags.length === 0 || md.tags.every((t) => !t.trim());
    return fields.some((f) => !f) || tagsEmpty;
}

function buildCard(article) {
    const md = article.metadata || {};
    const card = document.createElement("article");
    card.className = "card";
    if (state.highlightIncomplete && hasEmptyMetadata(article)) {
        card.classList.add("card-incomplete");
    }
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `Open PDF: ${md.title || article.pdf_filename}`);
    card.addEventListener("click", (evt) => {
        if (evt.ctrlKey && evt.shiftKey) {
            evt.preventDefault();
            evt.stopPropagation();
            openEditor(article);
            return;
        }
        if (evt.ctrlKey || evt.metaKey) {
            evt.preventDefault();
            evt.stopPropagation();
            const bib = generateBibtex(article);
            copyToClipboard(bib).then((ok) => {
                showToast(ok ? "BibTeX copied to clipboard" : "Failed to copy BibTeX");
            });
            return;
        }
        if (evt.altKey && evt.shiftKey) {
            evt.preventDefault();
            evt.stopPropagation();
            openAbstract(article);
            return;
        }
        if (evt.altKey) {
            evt.preventDefault();
            evt.stopPropagation();
            openFileLocation(article);
            return;
        }
        openPdf(article);
    });
    card.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            openPdf(article);
        }
    });

    // Apply tag tint
    const tint = getCardTint(article);
    if (tint) {
        card.style.borderColor = tint.replace("0.13", "0.45");
        card.style.background = `linear-gradient(135deg, ${tint}, transparent 70%)`;
    }

    // Image drag-and-drop onto card for thumbnail replacement
    // Only highlight and intercept for image files; let PDFs bubble to body handler
    ["dragenter", "dragover"].forEach((name) => {
        card.addEventListener(name, (evt) => {
            if (!evt.dataTransfer || !evt.dataTransfer.types.includes("Files")) return;
            // Check if drag contains an image (not PDF)
            const items = Array.from(evt.dataTransfer.items || []);
            const hasImage = items.some((it) => it.kind === "file" && it.type.startsWith("image/"));
            const hasPdf = items.some((it) => it.kind === "file" && it.type === "application/pdf");
            if (hasImage && !hasPdf) {
                evt.preventDefault();
                evt.stopPropagation();
                card.classList.add("drag-over");
            }
            // If it's a PDF, don't preventDefault/stopPropagation — let it bubble to body
        });
    });
    ["dragleave", "dragend"].forEach((name) => {
        card.addEventListener(name, (evt) => {
            card.classList.remove("drag-over");
        });
    });
    card.addEventListener("drop", async (evt) => {
        card.classList.remove("drag-over");
        const file = evt.dataTransfer?.files?.[0];
        if (!file || !isImageFile(file)) return;
        // It's an image drop — handle it here
        evt.preventDefault();
        evt.stopPropagation();
        setStatus(`Updating thumbnail for "${md.title || article.pdf_filename}"...`);
        try {
            const base64Data = await fileToBase64(file);
            await invoke("upload_thumbnail", {
                articleId: article.id,
                data: base64Data,
            });
            const thumbPath = articleThumbPath(article);
            if (thumbPath) thumbCache.delete(thumbPath);
            await loadArticles();
            setStatus("Thumbnail updated.");
        } catch (err) {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Thumbnail update failed: ${message}`, true);
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
        if (state.highlightIncomplete && hasEmptyMetadata(article)) {
            row.classList.add("card-incomplete");
        }
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

    if (state.articles.length === 0 && !state.query && !state.tag) {
        dom.emptyState.classList.remove("hidden");
        return;
    } else {
        dom.emptyState.classList.add("hidden");
    }

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
    dom.volume.value = md.volume || "";
    dom.issue.value = md.number || "";
    dom.pages.value = md.pages || "";
    dom.doi.value = md.doi || "";
    dom.abstract.value = md.abstract || "";
    // Render tag chips
    setTagChips(md.tags || []);
    dom.tagInput.value = "";
    dom.tagAutocomplete.classList.add("hidden");
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
        volume: dom.volume.value.trim(),
        number: dom.issue.value.trim(),
        pages: dom.pages.value.trim(),
        doi: dom.doi.value.trim(),
        abstract: abstractValue,
        tags: getTagChips(),
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

async function uploadManualThumbnail(file) {
    if (!state.current) return;
    const currentId = state.current.id;
    if (!file) {
        setStatus("Choose an image first.", true);
        return;
    }
    if (!isImageFile(file)) {
        setStatus("Dropped/selected file is not an image.", true);
        return;
    }

    // Snapshot unsaved form values before reload
    const formSnapshot = {
        title: dom.title.value,
        authors: dom.authors.value,
        year: dom.year.value,
        journal: dom.journal.value,
        volume: dom.volume.value,
        issue: dom.issue.value,
        pages: dom.pages.value,
        doi: dom.doi.value,
        abstract: dom.abstract.value,
        tags: getTagChips(),
        notes: dom.notes.value,
    };

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

        // Restore unsaved form values
        dom.title.value = formSnapshot.title;
        dom.authors.value = formSnapshot.authors;
        dom.year.value = formSnapshot.year;
        dom.journal.value = formSnapshot.journal;
        dom.volume.value = formSnapshot.volume;
        dom.issue.value = formSnapshot.issue;
        dom.pages.value = formSnapshot.pages;
        dom.doi.value = formSnapshot.doi;
        dom.abstract.value = formSnapshot.abstract;
        setTagChips(formSnapshot.tags);
        dom.notes.value = formSnapshot.notes;

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
    const fast = !dom.parsePdfs.checked;
    setMenuOpen(false);
    setStatus(`Reindexing with ${strategy} strategy${fast ? " (fast mode)" : ""}...`);
    dom.reindexBtn.disabled = true;
    try {
        await invoke("reindex", { strategy, fast });
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
    dom.viewModeToggle.checked = state.viewMode === "details";
    dom.primarySort.value = state.primarySort;
    dom.secondarySort.value = state.secondarySort;
    applyCardHeight(state.cardHeight);
    applyCardWidth(state.cardWidth);
    applyCardFont(state.cardFont);
    applyFontFamily(state.fontFamily);
    setMenuOpen(false);

    dom.searchInput.addEventListener("input", debouncedSearch);
    dom.tagFilter.addEventListener("change", async () => {
        state.tag = dom.tagFilter.value.trim();
        await loadArticles();
    });

    // Paste cleanup for authors field (gated by checkbox)
    dom.authors.addEventListener("paste", (evt) => {
        if (!dom.pasteCleanup.checked) return;
        const text = evt.clipboardData?.getData("text/plain");
        if (!text) return;
        evt.preventDefault();
        const cleaned = cleanAuthors(text);
        document.execCommand("insertText", false, cleaned);
        showToast("Authors cleaned from PDF paste");
    });

    // Paste cleanup for abstract field (gated by checkbox)
    dom.abstract.addEventListener("paste", (evt) => {
        if (!dom.pasteCleanup.checked) return;
        const text = evt.clipboardData?.getData("text/plain");
        if (!text) return;
        evt.preventDefault();
        const cleaned = cleanAbstract(text);
        document.execCommand("insertText", false, cleaned);
        showToast("Abstract cleaned from PDF paste");
    });

    // Tag input: autocomplete + chip creation
    dom.tagInput.addEventListener("input", () => {
        updateTagAutocomplete(dom.tagInput.value);
    });
    dom.tagInput.addEventListener("keydown", (evt) => {
        const items = dom.tagAutocomplete.querySelectorAll(".ac-item");
        if (evt.key === "Tab" || (evt.key === "Enter" && items.length > 0)) {
            evt.preventDefault();
            const activeIdx = Math.max(0, state.acIndex);
            const active = items[activeIdx];
            if (active) {
                addTagChip(active.dataset.tag);
                dom.tagInput.value = "";
                dom.tagAutocomplete.classList.add("hidden");
            }
            return;
        }
        if (evt.key === "Enter" && items.length === 0) {
            const val = dom.tagInput.value.trim();
            if (val) {
                evt.preventDefault();
                addTagChip(val);
                dom.tagInput.value = "";
                dom.tagAutocomplete.classList.add("hidden");
                return;
            }
        }
        if (evt.key === "ArrowDown") {
            evt.preventDefault();
            if (items.length === 0) return;
            state.acIndex = Math.min(state.acIndex + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle("active", i === state.acIndex));
            return;
        }
        if (evt.key === "ArrowUp") {
            evt.preventDefault();
            if (items.length === 0) return;
            state.acIndex = Math.max(state.acIndex - 1, 0);
            items.forEach((it, i) => it.classList.toggle("active", i === state.acIndex));
            return;
        }
        if (evt.key === "Backspace" && dom.tagInput.value === "") {
            // Remove last chip
            const chips = dom.tagChipContainer.querySelectorAll(".tag-chip");
            if (chips.length > 0) chips[chips.length - 1].remove();
            return;
        }
        if (evt.key === ",") {
            evt.preventDefault();
            const val = dom.tagInput.value.trim();
            if (val) addTagChip(val);
            dom.tagInput.value = "";
            dom.tagAutocomplete.classList.add("hidden");
        }
    });
    dom.tagInput.addEventListener("blur", () => {
        // Small delay so mousedown on autocomplete item fires first
        setTimeout(() => dom.tagAutocomplete.classList.add("hidden"), 150);
    });
    // Click on chip container focuses the input
    dom.tagChipContainer.addEventListener("click", () => dom.tagInput.focus());

    // Ctrl+scroll to resize cards
    document.addEventListener("wheel", (evt) => {
        if (!evt.ctrlKey) return;
        // Don't resize when inside modal or menu
        if (!dom.modal.classList.contains("hidden")) return;
        evt.preventDefault();
        const delta = evt.deltaY > 0 ? -10 : 10;
        const fontDelta = evt.deltaY > 0 ? -1 : 1;
        applyCardHeight(state.cardHeight + delta);
        applyCardWidth(state.cardWidth + delta);
        applyCardFont(state.cardFont + fontDelta);
        window.localStorage.setItem("article-card-height", String(state.cardHeight));
        window.localStorage.setItem("article-card-width", String(state.cardWidth));
        window.localStorage.setItem("article-card-font", String(state.cardFont));
    }, { passive: false });

    // View mode toggle
    dom.viewModeToggle.checked = state.viewMode === "details";
    dom.viewModeToggle.addEventListener("change", () => {
        state.viewMode = dom.viewModeToggle.checked ? "details" : "preview";
        window.localStorage.setItem("article-view-mode", state.viewMode);
        renderArticles();
    });

    // Tint by tag
    dom.tintByTag.checked = state.tintByTag;
    dom.tintByTag.addEventListener("change", () => {
        state.tintByTag = dom.tintByTag.checked;
        window.localStorage.setItem("article-tint-by-tag", state.tintByTag ? "true" : "false");
        renderArticles();
    });

    // Tag color editor
    dom.editTagColorsBtn.addEventListener("click", () => {
        // Count tag usage for sorting
        const tagCounts = {};
        for (const article of state.articles) {
            for (const tag of (article.metadata?.tags || [])) {
                const t = tag.trim();
                if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
            }
        }
        clearNode(dom.tagColorList);
        const sorted = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
        if (sorted.length === 0) {
            const msg = document.createElement("p");
            msg.className = "meta";
            msg.textContent = "No tags found. Add tags to articles first.";
            dom.tagColorList.appendChild(msg);
        } else {
            for (const tag of sorted) {
                const row = document.createElement("div");
                row.className = "tag-color-row";
                const picker = document.createElement("input");
                picker.type = "color";
                picker.value = state.tagColors[tag] || "#1a3145";
                picker.addEventListener("input", () => {
                    state.tagColors[tag] = picker.value;
                    saveTagColors();
                    renderArticles();
                });
                const label = document.createElement("span");
                label.textContent = tag;
                row.appendChild(picker);
                row.appendChild(label);
                dom.tagColorList.appendChild(row);
            }
        }
        dom.tagColorEditor.classList.remove("hidden");
    });
    dom.tagColorClose.addEventListener("click", () => {
        dom.tagColorEditor.classList.add("hidden");
    });
    // Hotkeys modal
    dom.hotkeysBtn.addEventListener("click", () => {
        dom.hotkeysModal.classList.remove("hidden");
    });
    dom.hotkeysClose.addEventListener("click", () => {
        dom.hotkeysModal.classList.add("hidden");
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
    dom.cardWidthSlider.addEventListener("input", () => {
        applyCardWidth(dom.cardWidthSlider.value);
        window.localStorage.setItem("article-card-width", String(state.cardWidth));
    });
    dom.cardFontSlider.addEventListener("input", () => {
        applyCardFont(dom.cardFontSlider.value);
        window.localStorage.setItem("article-card-font", String(state.cardFont));
    });
    if (dom.colorIntensitySlider) {
        dom.colorIntensitySlider.addEventListener("input", () => {
            state.colorIntensity = Number.parseInt(dom.colorIntensitySlider.value, 10);
            if (dom.colorIntensityValue) dom.colorIntensityValue.textContent = state.colorIntensity;
            window.localStorage.setItem("article-color-intensity", String(state.colorIntensity));
            renderArticles();
        });
    }
    if (dom.fontFamilySelect) {
        dom.fontFamilySelect.addEventListener("change", () => {
            applyFontFamily(dom.fontFamilySelect.value);
            window.localStorage.setItem("article-font-family", state.fontFamily);
        });
    }
    dom.reindexBtn.addEventListener("click", doReindex);
    if (dom.openArticlesBtn) {
        dom.openArticlesBtn.addEventListener("click", () => {
            invoke("open_articles_folder").catch(err => {
                setStatus(`Failed to open folder: ${err}`, true);
            });
        });
    }
    dom.modalClose.addEventListener("click", closeEditor);
    dom.abstractClose.addEventListener("click", closeAbstract);
    dom.form.addEventListener("submit", saveMetadata);

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

    // DOI Fetch button in modal
    dom.doiFetchBtn.addEventListener("click", async () => {
        const doiStr = dom.doi.value.trim();
        if (!doiStr) {
            alert("Please input a DOI string first.");
            return;
        }

        const originalText = dom.doiFetchBtn.textContent;
        dom.doiFetchBtn.textContent = "Fetching...";
        dom.doiFetchBtn.disabled = true;

        try {
            const meta = await invoke("fetch_doi_metadata", { doi: doiStr });
            if (meta.title) dom.title.value = meta.title;
            if (meta.authors) dom.authors.value = meta.authors;
            if (meta.year) dom.year.value = meta.year;
            if (meta.journal) dom.journal.value = meta.journal;
            if (meta.volume) dom.volume.value = meta.volume;
            if (meta.number) dom.issue.value = meta.number;
            if (meta.pages) dom.pages.value = meta.pages;
            if (meta.abstract) dom.abstract.value = meta.abstract;
            if (meta.doi) dom.doi.value = meta.doi; // updates cleaned DOI

            setStatus("Metadata successfully fetched from Crossref.");
        } catch (err) {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            alert(`Failed to fetch DOI metadata from Crossref: ${message}`);
            setStatus(`DOI Fetch Failed: ${message}`, true);
        } finally {
            dom.doiFetchBtn.textContent = originalText;
            dom.doiFetchBtn.disabled = false;
        }
    });

    // Paste thumbnail from clipboard
    dom.thumbPaste.addEventListener("click", async () => {
        if (!state.current) return;
        try {
            const clipItems = await navigator.clipboard.read();
            let imageBlob = null;
            for (const item of clipItems) {
                for (const type of item.types) {
                    if (type.startsWith("image/")) {
                        imageBlob = await item.getType(type);
                        break;
                    }
                }
                if (imageBlob) break;
            }
            if (!imageBlob) {
                setStatus("No image found in clipboard.", true);
                return;
            }
            const file = new File([imageBlob], "clipboard-image.png", { type: imageBlob.type });
            previewSelectedThumb(file);
            await uploadManualThumbnail(file);
        } catch (err) {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Clipboard paste failed: ${message}`, true);
        }
    });

    // Highlight incomplete toggle
    function updateHighlightBtn() {
        dom.highlightBtn.classList.toggle("highlight-btn-active", state.highlightIncomplete);
        dom.highlightBtn.textContent = state.highlightIncomplete ? "Highlighting Incomplete" : "Highlight Incomplete";
    }
    updateHighlightBtn();
    dom.highlightBtn.addEventListener("click", () => {
        state.highlightIncomplete = !state.highlightIncomplete;
        window.localStorage.setItem("article-highlight-incomplete", state.highlightIncomplete ? "true" : "false");
        updateHighlightBtn();
        renderArticles();
    });

    // Empty state buttons
    dom.emptyReindexBtn.addEventListener("click", doReindex);
    dom.emptyUploadBtn.addEventListener("click", () => dom.emptyFileInput.click());
    dom.emptyFileInput.addEventListener("change", async (evt) => {
        const files = Array.from(evt.target.files || []);
        const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
        if (pdfs.length === 0) return;

        setStatus(`Importing ${pdfs.length} PDF(s)...`);
        try {
            for (const pdf of pdfs) {
                const base64Data = await fileToBase64(pdf);
                await invoke("import_pdf", {
                    filename: pdf.name,
                    data: base64Data,
                });
            }
            dom.emptyFileInput.value = "";
            await loadTags();
            await loadArticles();
            setStatus(`Imported ${pdfs.length} PDF(s).`);
        } catch (err) {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Import failed: ${message}`, true);
        }
    });

    // Body-level PDF drag-and-drop import
    let dragCounter = 0;

    // Tauri Native File Drop (needed for release builds where Webview2 blocks HTML5 drop)
    if (window.__TAURI__ && window.__TAURI__.event) {
        window.__TAURI__.event.listen("tauri://drag-enter", (evt) => {
            if (!dom.modal.classList.contains("hidden")) return;
            dragCounter++;
            dom.dropOverlay.classList.remove("hidden");
        });
        window.__TAURI__.event.listen("tauri://drag-leave", () => {
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                dom.dropOverlay.classList.add("hidden");
            }
        });

        const handleNativeDrop = async (evt) => {
            dragCounter = 0;
            dom.dropOverlay.classList.add("hidden");
            if (!dom.modal.classList.contains("hidden")) return;

            const paths = evt.payload.paths || [];
            if (!paths || paths.length === 0) return;
            const pdfPaths = paths.filter(p => p.toLowerCase().endsWith(".pdf"));
            if (pdfPaths.length === 0) return;

            setStatus(`Importing ${pdfPaths.length} PDF(s). Please wait for metadata...`);
            try {
                // Batch processing is handled concurrently on the Rust side
                await invoke("import_pdfs_from_paths", { paths: pdfPaths });
                await loadTags();
                await loadArticles();
                setStatus(`Imported ${pdfPaths.length} PDF(s).`);
            } catch (err) {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Import failed: ${message}`, true);
            }
        };

        window.__TAURI__.event.listen("tauri://drop", handleNativeDrop);
        window.__TAURI__.event.listen("tauri://drag-drop", handleNativeDrop);
        window.__TAURI__.event.listen("tauri://file-drop", handleNativeDrop);
    }

    document.body.addEventListener("dragenter", (evt) => {
        // Don't show overlay if the edit modal is open
        if (!dom.modal.classList.contains("hidden")) return;
        if (!evt.dataTransfer || !evt.dataTransfer.types.includes("Files")) return;
        // Check if drag contains a PDF
        const items = Array.from(evt.dataTransfer.items || []);
        const hasPdf = items.some((it) => it.kind === "file" && it.type === "application/pdf");
        if (hasPdf) {
            evt.preventDefault();
            dragCounter++;
            dom.dropOverlay.classList.remove("hidden");
        }
    });
    document.body.addEventListener("dragover", (evt) => {
        if (!dom.modal.classList.contains("hidden")) return;
        if (evt.dataTransfer && evt.dataTransfer.types.includes("Files")) {
            evt.preventDefault();
        }
    });
    document.body.addEventListener("dragleave", (evt) => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            dom.dropOverlay.classList.add("hidden");
        }
    });
    document.body.addEventListener("drop", async (evt) => {
        dragCounter = 0;
        dom.dropOverlay.classList.add("hidden");
        // Don't handle if modal is open
        if (!dom.modal.classList.contains("hidden")) return;
        evt.preventDefault();
        const files = Array.from(evt.dataTransfer?.files || []);
        const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
        if (pdfs.length === 0) return;

        setStatus(`Importing ${pdfs.length} PDF(s). Please wait for metadata...`);
        let imported = 0;

        // Since we are uploading data blobs instead of paths, we iterate sequentially here on the frontend.
        for (let i = 0; i < pdfs.length; i++) {
            const pdf = pdfs[i];
            try {
                setStatus(`Importing (${i + 1}/${pdfs.length}) ${pdf.name}...`);
                const base64Data = await fileToBase64(pdf);
                await invoke("import_pdf", {
                    filename: pdf.name,
                    data: base64Data,
                });
                imported++;
            } catch (err) {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to import ${pdf.name}: ${message}`, true);
            }
        }
        if (imported > 0) {
            thumbCache.clear();
            await Promise.all([loadTags(), loadArticles()]);
            setStatus(`Imported ${imported} PDF(s).`);
        }
    });

    document.addEventListener("click", (evt) => {
        if (!state.menuOpen) return;
        if (dom.settingsWrap.contains(evt.target)) return;
        setMenuOpen(false);
    });

    // Mousedown on modal backdrops to close
    [dom.modal, dom.abstractModal, dom.tagColorEditor, dom.hotkeysModal].forEach((modalEl) => {
        modalEl.addEventListener("mousedown", (evt) => {
            if (evt.target === modalEl) {
                modalEl.classList.add("hidden");
            }
        });
    });

    // Global keyboard handlers
    document.addEventListener("keydown", (evt) => {
        if (evt.key === "Escape") {
            if (state.menuOpen) setMenuOpen(false);
            if (!dom.modal.classList.contains("hidden")) closeEditor();
            if (!dom.abstractModal.classList.contains("hidden")) closeAbstract();
            dom.tagColorEditor.classList.add("hidden");
            dom.hotkeysModal.classList.add("hidden");
        }

        // Ctrl+Tab to toggle hamburger menu or Tab to focus search (if not auto-completing tags)
        if (evt.key === "Tab") {
            if (evt.ctrlKey) {
                evt.preventDefault();
                setMenuOpen(!state.menuOpen);
            } else if (state.acIndex === -1 && !state.menuOpen && dom.modal.classList.contains("hidden")) {
                evt.preventDefault();
                dom.searchInput.focus();
            }
        }

        if (evt.key === "Enter" && !dom.modal.classList.contains("hidden")) {
            // Don't trigger if user is in a textarea or the tag input
            if (evt.target.tagName === "TEXTAREA") return;
            if (evt.target === dom.tagInput) return;
            evt.preventDefault();
            saveMetadata(evt).then(() => closeEditor());
        }
        // Ctrl+P to paste thumbnail when modal is open
        if (evt.key === "p" && evt.ctrlKey && !dom.modal.classList.contains("hidden")) {
            evt.preventDefault();
            dom.thumbPaste.click();
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
