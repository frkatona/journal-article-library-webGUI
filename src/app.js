// Tauri IPC bridge
const { invoke } = window.__TAURI__.core;

// Thumbnail cache: relPath -> dataUrl
const thumbCache = new Map();

const DEFAULT_HOTKEYS = {
    openPdf: { ctrl: false, alt: false, shift: false },  // plain click
    editMetadata: { ctrl: true, alt: false, shift: false },  // Ctrl+click
    openAbstract: { ctrl: false, alt: true, shift: false },  // Alt+click
    copyBibtex: { ctrl: false, alt: false, shift: true },  // Shift+click
    openLocation: { ctrl: true, alt: false, shift: true },  // Ctrl+Shift+click
};
const KEYBOARD_SHORTCUTS_STORAGE_KEY = "article-keyboard-shortcuts";
const DEMO_MODE_KEY = "article-demo-mode";
const DEFAULT_KEYBOARD_SHORTCUTS = {
    pasteThumb: ["P"],
    enter: ["Ctrl+Enter"],
    arrowToggle: ["ArrowUp", "ArrowDown"],
    prevArticle: ["ArrowLeft"],
    nextArticle: ["ArrowRight"],
};

const ENABLE_NICHE_KEY = "article-enable-niche";
const SHOW_NICHE_KEY = "article-show-niche";
const SHOW_REF_DOIS_KEY = "article-show-ref-dois";
const SHOW_REF_DOIS_PREF_TOUCHED_KEY = "article-show-ref-dois-pref-touched";

function initShowRefDoisPreference() {
    const raw = window.localStorage.getItem(SHOW_REF_DOIS_KEY);
    const wasTouched = window.localStorage.getItem(SHOW_REF_DOIS_PREF_TOUCHED_KEY) === "true";

    // Migrate older installs where this preference could be persisted off unexpectedly.
    if (!wasTouched && raw === "false") {
        window.localStorage.setItem(SHOW_REF_DOIS_KEY, "true");
        return true;
    }
    return raw !== "false";
}

function initEnableNichePreference() {
    return window.localStorage.getItem(ENABLE_NICHE_KEY) === "true";
}

function initShowNichePreference() {
    const raw = window.localStorage.getItem(SHOW_NICHE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;

    const legacyHide = window.localStorage.getItem("article-hide-niche");
    if (legacyHide === "false") return true;
    if (legacyHide === "true") return false;
    return false;
}

function cloneDefaultKeyboardShortcuts() {
    return Object.fromEntries(
        Object.entries(DEFAULT_KEYBOARD_SHORTCUTS).map(([key, bindings]) => [key, [...bindings]]),
    );
}

function normalizeShortcutKey(key) {
    const raw = String(key || "").trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    if (lower === "meta") return "Ctrl";
    if (lower === "control" || lower === "ctrl") return "Ctrl";
    if (lower === "alt" || lower === "option") return "Alt";
    if (lower === "shift") return "Shift";
    if (lower === "esc") return "Escape";
    if (lower === "spacebar" || lower === "space") return "Space";
    if (lower === "arrowup" || lower === "arrow up" || lower === "up") return "ArrowUp";
    if (lower === "arrowdown" || lower === "arrow down" || lower === "down") return "ArrowDown";
    if (lower === "arrowleft" || lower === "arrow left" || lower === "left") return "ArrowLeft";
    if (lower === "arrowright" || lower === "arrow right" || lower === "right") return "ArrowRight";
    return raw.length === 1 ? raw.toUpperCase() : `${raw[0].toUpperCase()}${raw.slice(1)}`;
}

function normalizeShortcutBinding(binding) {
    const parts = String(binding || "")
        .split("+")
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length === 0) return "";

    let ctrl = false;
    let alt = false;
    let shift = false;
    let keyPart = "";

    for (const part of parts) {
        const normalized = normalizeShortcutKey(part);
        if (!normalized) continue;
        if (normalized === "Ctrl") ctrl = true;
        else if (normalized === "Alt") alt = true;
        else if (normalized === "Shift") shift = true;
        else keyPart = normalized;
    }

    if (!keyPart) return "";

    const out = [];
    if (ctrl) out.push("Ctrl");
    if (alt) out.push("Alt");
    if (shift) out.push("Shift");
    out.push(keyPart);
    return out.join("+");
}

function formatShortcutBinding(binding) {
    return normalizeShortcutBinding(binding)
        .replace("ArrowUp", "Arrow Up")
        .replace("ArrowDown", "Arrow Down")
        .replace("ArrowLeft", "Arrow Left")
        .replace("ArrowRight", "Arrow Right");
}

function loadKeyboardShortcuts() {
    const defaults = cloneDefaultKeyboardShortcuts();
    try {
        const raw = JSON.parse(window.localStorage.getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY) || "null");
        if (!raw || typeof raw !== "object") return defaults;

        for (const key of Object.keys(defaults)) {
            const value = raw[key];
            const asList = typeof value === "string" ? [value] : (Array.isArray(value) ? value : []);
            const normalized = asList.map(normalizeShortcutBinding).filter(Boolean);
            if (normalized.length > 0) defaults[key] = normalized;
        }
    } catch {
        return defaults;
    }
    return defaults;
}

function saveKeyboardShortcuts() {
    window.localStorage.setItem(KEYBOARD_SHORTCUTS_STORAGE_KEY, JSON.stringify(state.keyboardShortcuts));
}

function getKeyboardShortcutBindings(shortcutKey) {
    return state.keyboardShortcuts?.[shortcutKey] || DEFAULT_KEYBOARD_SHORTCUTS[shortcutKey] || [];
}

function getKeyboardShortcutDisplay(shortcutKey) {
    const bindings = getKeyboardShortcutBindings(shortcutKey);
    return bindings.map(formatShortcutBinding).join(" / ");
}

function eventToShortcutBinding(evt) {
    const key = normalizeShortcutKey(evt.key);
    if (!key || ["Ctrl", "Alt", "Shift"].includes(key)) return "";

    const parts = [];
    if (evt.ctrlKey || evt.metaKey) parts.push("Ctrl");
    if (evt.altKey) parts.push("Alt");
    if (evt.shiftKey) parts.push("Shift");
    parts.push(key);
    return parts.join("+");
}

function matchesKeyboardShortcut(evt, shortcutKey) {
    const binding = eventToShortcutBinding(evt);
    if (!binding) return false;
    return getKeyboardShortcutBindings(shortcutKey).includes(binding);
}

function getReferenceDois(md) {
    const metadata = md || {};
    const rawList = [metadata.ref_dois, metadata.refDois, metadata.reference_dois, metadata.referenceDois]
        .find(Array.isArray) || [];

    return rawList
        .map((item) => {
            if (typeof item === "string") return item.trim();
            if (item && typeof item === "object") {
                const doiLike = item.DOI || item.doi || item.reference_doi || item.referenceDOI || "";
                return typeof doiLike === "string" ? doiLike.trim() : "";
            }
            return "";
        })
        .filter(Boolean);
}

const state = {
    query: "",
    tags: [],
    strategy: "hybrid",
    articles: [],
    total: 0,
    generatedAt: "",
    current: null,
    hoveredArticleId: null,
    viewMode: window.localStorage.getItem("article-view-mode") || "preview",
    cardHeight: Number.parseInt(window.localStorage.getItem("article-card-height") || "138", 10),
    autoFitHeight: window.localStorage.getItem("article-autofit-height") === "true",
    cardWidth: Number.parseInt(window.localStorage.getItem("article-card-width") || "200", 10),
    cardFont: Number.parseInt(window.localStorage.getItem("article-card-font") || "14", 10),
    fontFamily: window.localStorage.getItem("article-font-family") || "segoe",
    theme: window.localStorage.getItem("article-theme") || "ocean",
    primarySort: window.localStorage.getItem("article-primary-sort") || "year_desc",
    secondarySort: window.localStorage.getItem("article-secondary-sort") || "title_asc",
    displayMenuOpen: false,
    filesMenuOpen: false,
    tagFilterMode: window.localStorage.getItem("article-tag-mode") || "all",
    tintByTag: window.localStorage.getItem("article-tint-by-tag") === "true",
    filterIncomplete: window.localStorage.getItem("article-filter-incomplete") === "true",
    autoRefCompile: window.localStorage.getItem("article-auto-ref") === "true",
    showDupeWarnings: window.localStorage.getItem("article-dupe-warnings") !== "false",
    colorIntensity: Number.parseInt(window.localStorage.getItem("article-color-intensity") || "13", 10),
    modalBackdropDarkness: Number.parseInt(window.localStorage.getItem("article-modal-backdrop-darkness") || "58", 10),
    surfaceOpacity: Number.parseInt(window.localStorage.getItem("article-surface-opacity") || "100", 10),
    nightFilterMode: window.localStorage.getItem("article-night-filter-mode") || "warm",
    nightFilterStrength: Number.parseInt(window.localStorage.getItem("article-night-filter-strength") || "0", 10),
    tagColors: JSON.parse(window.localStorage.getItem("article-tag-colors") || "{}"),
    hotkeys: JSON.parse(window.localStorage.getItem("article-hotkeys") || "null") || { ...DEFAULT_HOTKEYS },
    keyboardShortcuts: loadKeyboardShortcuts(),
    nicheTags: JSON.parse(window.localStorage.getItem("article-niche-tags") || "[]"),
    enableNiche: initEnableNichePreference(),
    showNiche: initShowNichePreference(),
    showRefDois: initShowRefDoisPreference(),
    acIndex: -1,
    isEscaping: false,
    abstractPreviewArticle: null,
    wellnessTipIndex: Number.parseInt(window.localStorage.getItem("article-wellness-tip-index") || "0", 10),
    showErrorsGlobally: window.localStorage.getItem("article-show-errors") !== "false",
    abstractSectionCount: Number.parseInt(window.localStorage.getItem("article-abstract-sections") || "4", 10),
    debugMode: window.localStorage.getItem("article-debug-mode") === "true",
    demoMode: window.localStorage.getItem(DEMO_MODE_KEY) === "true",
    modalArrowBusy: false,
    thumbnailUndo: null,
};

const dom = {
    topbar: document.getElementById("topbar"),
    settingsWrapDisplay: document.getElementById("settings-wrap-display"),
    displayMenuToggle: document.getElementById("display-menu-toggle"),
    displayMenu: document.getElementById("display-menu"),
    settingsWrapFiles: document.getElementById("settings-wrap-files"),
    filesMenuToggle: document.getElementById("files-menu-toggle"),
    filesMenu: document.getElementById("files-menu"),
    primarySort: document.getElementById("primary-sort"),
    secondarySort: document.getElementById("secondary-sort"),
    cardHeightSlider: document.getElementById("card-height-slider"),
    cardHeightValue: document.getElementById("card-height-value"),
    cardHeightAutofit: document.getElementById("card-height-autofit"),
    cardWidthSlider: document.getElementById("card-width-slider"),
    cardWidthValue: document.getElementById("card-width-value"),
    cardFontSlider: document.getElementById("card-font-slider"),
    cardFontValue: document.getElementById("card-font-value"),
    modalBackdropSlider: document.getElementById("modal-backdrop-slider"),
    modalBackdropValue: document.getElementById("modal-backdrop-value"),
    surfaceOpacitySlider: document.getElementById("surface-opacity-slider"),
    surfaceOpacityValue: document.getElementById("surface-opacity-value"),
    nightFilterMode: document.getElementById("night-filter-mode"),
    nightFilterStrengthSlider: document.getElementById("night-filter-strength-slider"),
    nightFilterStrengthValue: document.getElementById("night-filter-strength-value"),
    nightFilterPreMatrix: document.getElementById("night-filter-pre-matrix"),
    nightFilterPostMatrix: document.getElementById("night-filter-post-matrix"),
    nightFilterFuncR: document.getElementById("night-filter-func-r"),
    nightFilterFuncG: document.getElementById("night-filter-func-g"),
    nightFilterFuncB: document.getElementById("night-filter-func-b"),
    colorIntensitySlider: document.getElementById("color-intensity-slider"),
    colorIntensityValue: document.getElementById("color-intensity-value"),
    fontFamilySelect: document.getElementById("font-family-select"),
    searchInput: document.getElementById("search-input"),
    tagFilterContainer: document.getElementById("tag-filter-container"),
    tagFilterBtn: document.getElementById("tag-filter-btn"),
    tagFilterCount: document.getElementById("tag-filter-count"),
    tagFilterMenu: document.getElementById("tag-filter-menu"),
    tagFilterList: document.getElementById("tag-filter-list"),
    showNicheRow: document.getElementById("show-niche-row"),
    showNicheCheckbox: document.getElementById("show-niche"),
    filterIncomplete: document.getElementById("filter-incomplete"),
    tagFilterAll: document.getElementById("tag-filter-all"),
    tagFilterNone: document.getElementById("tag-filter-none"),
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
    editorOpenBtn: document.getElementById("editor-open-btn"),
    editorLocateBtn: document.getElementById("editor-locate-btn"),
    emptyState: document.getElementById("empty-state"),
    emptyUploadBtn: document.getElementById("empty-upload-btn"),
    emptyReindexBtn: document.getElementById("empty-reindex-btn"),
    emptyFileInput: document.getElementById("empty-file-input"),
    restoreBackupBtn: document.getElementById("restore-backup-btn"),
    storageReportBtn: document.getElementById("storage-report-btn"),
    storageReportContent: document.getElementById("storage-report-content"),
    backupModal: document.getElementById("backup-modal"),
    backupClose: document.getElementById("backup-close"),
    backupOptions: document.getElementById("backup-options"),
    backupStatus: document.getElementById("backup-status"),
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
    abstractCleanBtn: document.getElementById("abstract-clean-btn"),
    tagChipContainer: document.getElementById("tag-chip-container"),
    tagInput: document.getElementById("f-tag-input"),
    tagAutocomplete: document.getElementById("tag-autocomplete"),
    notes: document.getElementById("f-notes"),
    autoHideTopbar: document.getElementById("auto-hide-topbar"),
    abstractModal: document.getElementById("abstract-modal"),
    abstractTitle: document.getElementById("abstract-title"),
    duplicateModal: document.getElementById("duplicate-modal"),
    duplicateClose: document.getElementById("duplicate-close"),
    duplicateList: document.getElementById("duplicate-list"),
    abstractMeta: document.getElementById("abstract-meta"),
    abstractMetaDivider: document.getElementById("abstract-meta-divider"),
    abstractText: document.getElementById("abstract-text"),
    abstractReferencesSection: document.getElementById("abstract-references-section"),
    abstractReferencesList: document.getElementById("abstract-references-list"),
    metaRemove: document.getElementById("meta-remove"),
    dropOverlay: document.getElementById("drop-overlay"),
    tintByTag: document.getElementById("tint-by-tag"),
    editTagColorsBtn: document.getElementById("edit-tag-colors-btn"),
    tagColorEditor: document.getElementById("tag-color-editor"),
    tagColorList: document.getElementById("tag-color-list"),
    tagColorClose: document.getElementById("tag-color-close"),
    toast: document.getElementById("toast"),
    thumbnailUndo: document.getElementById("thumbnail-undo"),
    thumbnailUndoMessage: document.getElementById("thumbnail-undo-message"),
    thumbnailUndoBtn: document.getElementById("thumbnail-undo-btn"),
    thumbnailUndoProgress: document.getElementById("thumbnail-undo-progress"),
    hotkeysBtn: document.getElementById("hotkeys-btn"),
    hotkeysModal: document.getElementById("hotkeys-modal"),
    hotkeysClose: document.getElementById("hotkeys-close"),
    errorBanner: document.getElementById("error-banner"),
    errorBannerText: document.getElementById("error-banner-text"),
    errorBannerClose: document.getElementById("error-banner-close"),
    showErrorsCheckbox: document.getElementById("show-errors-checkbox"),
    autoRefCompile: document.getElementById("auto-ref-compile"),
    showDupeWarnings: document.getElementById("show-dupe-warnings"),
    enableNicheCheckbox: document.getElementById("enable-niche"),
    themeSelect: document.getElementById("theme-select"),
    experimentalSection: document.getElementById("experimental-section"),
    experimentalArrow: document.getElementById("experimental-arrow"),
    debugModeCheckbox: document.getElementById("debug-mode"),
    demoModeCheckbox: document.getElementById("demo-mode"),
    errorLogList: document.getElementById("error-log-list"),
    errorLogCopy: document.getElementById("error-log-copy"),
    errorLogClear: document.getElementById("error-log-clear"),
    hotkeyTableContainer: document.getElementById("hotkey-table-container"),
    hotkeyTipText: document.getElementById("hotkey-tip-text"),
    hotkeyTipSource: document.getElementById("hotkey-tip-source"),
    hotkeyTipNext: document.getElementById("hotkey-tip-next"),
    crashLogBtn: document.getElementById("crash-log-btn"),
    crashLogContent: document.getElementById("crash-log-content"),
    nicheTagsField: document.getElementById("niche-tags-field"),
    nicheTagChipContainer: document.getElementById("niche-tag-chip-container"),
    nicheTagsInput: document.getElementById("niche-tags-input"),
    showRefDoisCheckbox: document.getElementById("show-ref-dois"),
    abstractSectionCountValue: document.getElementById("abstract-section-count-value"),
    abstractSectionCountInput: document.getElementById("abstract-section-count"),
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
    dom.grid.classList.toggle("autofit-cards", Boolean(state.autoFitHeight));
    dom.cardHeightSlider.disabled = Boolean(state.autoFitHeight);
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

function clampModalBackdropDarkness(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return 58;
    return Math.max(0, Math.min(95, n));
}

function applyModalBackdropDarkness(value) {
    const darkness = clampModalBackdropDarkness(value);
    state.modalBackdropDarkness = darkness;
    document.documentElement.style.setProperty("--modal-backdrop-alpha", (darkness / 100).toFixed(2));
    if (dom.modalBackdropSlider) dom.modalBackdropSlider.value = String(darkness);
    if (dom.modalBackdropValue) dom.modalBackdropValue.textContent = String(darkness);
}

function clampSurfaceOpacity(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return 100;
    return Math.max(30, Math.min(100, n));
}

function applySurfaceOpacity(value) {
    const opacityPercent = clampSurfaceOpacity(value);
    state.surfaceOpacity = opacityPercent;
    document.documentElement.style.setProperty("--surface-opacity-factor", (opacityPercent / 100).toFixed(2));
    if (dom.surfaceOpacitySlider) dom.surfaceOpacitySlider.value = String(opacityPercent);
    if (dom.surfaceOpacityValue) dom.surfaceOpacityValue.textContent = String(opacityPercent);
}

const NIGHT_FILTER_MODES = new Set([
    "warm",
    "scalar_dimming",
    "gamma_remap",
    "luminance_remap",
    "sigmoid_contrast",
    "soft_knee",
]);

const IDENTITY_COLOR_MATRIX = "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0";
const LUMA_PRE_MATRIX = "0.2126 0.7152 0.0722 0 0  -0.1063 -0.3576 0.4639 0 0.5  0.3937 -0.3576 -0.0361 0 0.5  0 0 0 1 0";
const LUMA_POST_MATRIX = "1 0 2 0 -1  1 -0.2019 -0.5945 0 0.3982  1 2 0 0 -1  0 0 0 1 0";

function clampUnit(value) {
    return Math.max(0, Math.min(1, value));
}

function normalizeNightFilterMode(value) {
    const mode = normalizeWhitespace(value).toLowerCase();
    return NIGHT_FILTER_MODES.has(mode) ? mode : "warm";
}

function clampNightFilterStrength(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

function buildFilterTableValues(mapper, points = 65) {
    const safePoints = Math.max(2, points);
    const values = [];
    for (let i = 0; i < safePoints; i++) {
        const x = i / (safePoints - 1);
        values.push(clampUnit(mapper(x)).toFixed(6));
    }
    return values.join(" ");
}

function setFilterMatrix(el, values) {
    if (el) el.setAttribute("values", values);
}

function applyNightFilter(modeValue, strengthValue) {
    const mode = normalizeNightFilterMode(modeValue);
    const strength = clampNightFilterStrength(strengthValue);
    const s = strength / 100;

    state.nightFilterMode = mode;
    state.nightFilterStrength = strength;

    if (dom.nightFilterMode) dom.nightFilterMode.value = mode;
    if (dom.nightFilterStrengthSlider) dom.nightFilterStrengthSlider.value = String(strength);
    if (dom.nightFilterStrengthValue) dom.nightFilterStrengthValue.textContent = String(strength);

    if (strength <= 0) {
        document.body.style.filter = "";
        setFilterMatrix(dom.nightFilterPreMatrix, IDENTITY_COLOR_MATRIX);
        setFilterMatrix(dom.nightFilterPostMatrix, IDENTITY_COLOR_MATRIX);
        if (dom.nightFilterFuncR) dom.nightFilterFuncR.setAttribute("tableValues", "0 1");
        if (dom.nightFilterFuncG) dom.nightFilterFuncG.setAttribute("tableValues", "0 1");
        if (dom.nightFilterFuncB) dom.nightFilterFuncB.setAttribute("tableValues", "0 1");
        return;
    }

    document.body.style.filter = "url(#night-display-filter)";

    let mapR = (x) => x;
    let mapG = (x) => x;
    let mapB = (x) => x;
    let preMatrix = IDENTITY_COLOR_MATRIX;
    let postMatrix = IDENTITY_COLOR_MATRIX;

    switch (mode) {
        case "warm": {
            const gScale = 1 - (0.15 * s);
            const bScale = 1 - (0.4 * s);
            mapR = (x) => x;
            mapG = (x) => x * gScale;
            mapB = (x) => x * bScale;
            break;
        }
        case "scalar_dimming": {
            const dim = 1 - (0.85 * s);
            mapR = (x) => x * dim;
            mapG = (x) => x * dim;
            mapB = (x) => x * dim;
            break;
        }
        case "gamma_remap": {
            const gamma = 1 + (2.8 * s);
            mapR = (x) => Math.pow(x, gamma);
            mapG = (x) => Math.pow(x, gamma);
            mapB = (x) => Math.pow(x, gamma);
            break;
        }
        case "luminance_remap": {
            const gamma = 1 + (2.2 * s);
            const dim = 1 - (0.25 * s);
            preMatrix = LUMA_PRE_MATRIX;
            postMatrix = LUMA_POST_MATRIX;
            mapR = (y) => Math.pow(y, gamma) * dim;
            mapG = (u) => u; // Preserve chroma U' channel.
            mapB = (v) => v; // Preserve chroma V' channel.
            break;
        }
        case "sigmoid_contrast": {
            const k = 2 + (12 * s);
            const low = 1 / (1 + Math.exp(k * 0.5));
            const high = 1 / (1 + Math.exp(-k * 0.5));
            const span = Math.max(1e-6, high - low);
            const dim = 1 - (0.45 * s);
            const shape = (x) => {
                const sig = 1 / (1 + Math.exp(-k * (x - 0.5)));
                return ((sig - low) / span) * dim;
            };
            mapR = shape;
            mapG = shape;
            mapB = shape;
            break;
        }
        case "soft_knee": {
            const k = 0.35 + (1.65 * s);
            const dim = 1 - (0.55 * s);
            const shape = (x) => (x * dim) / (1 + (k * x));
            mapR = shape;
            mapG = shape;
            mapB = shape;
            break;
        }
        default:
            break;
    }

    setFilterMatrix(dom.nightFilterPreMatrix, preMatrix);
    setFilterMatrix(dom.nightFilterPostMatrix, postMatrix);
    if (dom.nightFilterFuncR) dom.nightFilterFuncR.setAttribute("tableValues", buildFilterTableValues(mapR));
    if (dom.nightFilterFuncG) dom.nightFilterFuncG.setAttribute("tableValues", buildFilterTableValues(mapG));
    if (dom.nightFilterFuncB) dom.nightFilterFuncB.setAttribute("tableValues", buildFilterTableValues(mapB));
}

function applyFontFamily(value) {
    const fontKey = normalizeFontKey(value, "segoe");
    state.fontFamily = fontKey;
    document.documentElement.style.setProperty("--app-font-family", FONT_FAMILIES[fontKey]);
    if (dom.fontFamilySelect) {
        dom.fontFamilySelect.value = fontKey;
    }
}

function setDisplayMenuOpen(isOpen) {
    state.displayMenuOpen = Boolean(isOpen);
    dom.displayMenu.classList.toggle("hidden", !state.displayMenuOpen);
    dom.displayMenuToggle.setAttribute("aria-expanded", state.displayMenuOpen ? "true" : "false");
    if (isOpen && state.filesMenuOpen) setFilesMenuOpen(false);
}

function setFilesMenuOpen(isOpen) {
    state.filesMenuOpen = Boolean(isOpen);
    dom.filesMenu.classList.toggle("hidden", !state.filesMenuOpen);
    dom.filesMenuToggle.setAttribute("aria-expanded", state.filesMenuOpen ? "true" : "false");
    if (isOpen && state.displayMenuOpen) setDisplayMenuOpen(false);
}

function wireSliderToggles(container) {
    if (!container) return;
    const sliderFields = Array.from(container.querySelectorAll("[data-slider-field]"));
    if (sliderFields.length === 0) return;

    const collapseAll = () => {
        sliderFields.forEach((field) => {
            field.classList.remove("expanded");
            const toggle = field.querySelector("[data-slider-toggle]");
            if (toggle) toggle.setAttribute("aria-expanded", "false");
        });
    };

    sliderFields.forEach((field) => {
        const toggle = field.querySelector("[data-slider-toggle]");
        if (!(toggle instanceof HTMLElement)) return;

        toggle.setAttribute("role", "button");
        toggle.setAttribute("tabindex", "0");
        toggle.setAttribute("aria-expanded", field.classList.contains("expanded") ? "true" : "false");

        const activate = (evt) => {
            if (evt.type === "click") {
                const clickTarget = evt.target;
                if (clickTarget instanceof HTMLElement && clickTarget.closest("[data-slider-inline-control]")) return;
                evt.preventDefault();
            } else if (evt.type === "keydown") {
                if (evt.key !== "Enter" && evt.key !== " ") return;
                evt.preventDefault();
            }

            const willExpand = !field.classList.contains("expanded");
            collapseAll();
            if (willExpand) {
                field.classList.add("expanded");
                toggle.setAttribute("aria-expanded", "true");
            }
        };

        toggle.addEventListener("click", activate);
        toggle.addEventListener("keydown", activate);
    });
}

function setStatus(text, isWarning = false) {
    dom.statusLine.textContent = text;
    dom.statusLine.classList.toggle("warning", isWarning);
    if (isWarning) {
        logGlobalError(text, "", "");
    }
}

function clampAbstractSectionCount(value) {
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed)) return 4;
    return Math.max(1, Math.min(7, parsed));
}

function applyAbstractSectionCount(value) {
    const count = clampAbstractSectionCount(value);
    state.abstractSectionCount = count;
    if (dom.abstractSectionCountInput) {
        dom.abstractSectionCountInput.value = String(count);
    }
    if (dom.abstractSectionCountValue) {
        dom.abstractSectionCountValue.textContent = String(count);
    }
}

function debugLog(message) {
    if (!state.debugMode) return;
    const time = new Date().toLocaleTimeString();
    const text = `[${time}] [debug] ${message}`;
    console.debug(text);
    if (dom.errorLogList) {
        const li = document.createElement("li");
        li.textContent = text;
        li.style.color = "var(--muted)";
        dom.errorLogList.prepend(li);
        while (dom.errorLogList.children.length > 100) {
            dom.errorLogList.removeChild(dom.errorLogList.lastChild);
        }
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

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let size = value;
    let unitIndex = -1;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatStorageRow(label, bytes, suffix = "") {
    const left = String(label || "").padEnd(28, " ");
    const right = formatBytes(bytes).padStart(10, " ");
    return `${left} ${right}${suffix ? `  ${suffix}` : ""}`;
}

function formatStorageReport(report) {
    if (!report) return "No storage report returned.";

    const lines = [
        `App folder: ${report.root_dir || "(unknown)"}`,
        `Total size: ${formatBytes(report.total_bytes)}`,
        `Root-level files: ${formatBytes(report.root_file_bytes)} across ${(report.root_file_count || 0).toLocaleString()} file(s)`,
        "",
        "Subfolders (recursive)",
    ];

    if (Array.isArray(report.folders) && report.folders.length > 0) {
        for (const folder of report.folders) {
            const suffix = `${(folder.file_count || 0).toLocaleString()} files, ${(folder.dir_count || 0).toLocaleString()} dirs`;
            lines.push(formatStorageRow(folder.name || "(unnamed)", folder.bytes, suffix));
        }
    } else {
        lines.push("No subfolders found.");
    }

    const metadata = report.metadata || {};
    lines.push("");
    lines.push("Stored metadata (JSON on disk)");
    lines.push(`Articles indexed: ${(metadata.article_count || 0).toLocaleString()}`);
    lines.push(formatStorageRow("index.json", metadata.index_json_bytes || 0));
    lines.push(formatStorageRow("override JSON files", metadata.overrides_bytes || 0));
    lines.push(formatStorageRow("backup JSON files", metadata.backup_bytes || 0));

    lines.push("");
    lines.push("Stored article payload sections");
    if (Array.isArray(metadata.section_bytes) && metadata.section_bytes.length > 0) {
        for (const item of metadata.section_bytes) {
            const suffix = `${(item.non_empty || 0).toLocaleString()} non-empty`;
            lines.push(formatStorageRow(item.name || "(unnamed)", item.bytes || 0, suffix));
        }
    } else {
        lines.push("No section data available.");
    }

    lines.push("");
    lines.push("Merged metadata fields");
    if (Array.isArray(metadata.merged_field_bytes) && metadata.merged_field_bytes.length > 0) {
        for (const item of metadata.merged_field_bytes) {
            const suffix = `${(item.non_empty || 0).toLocaleString()} non-empty`;
            lines.push(formatStorageRow(item.name || "(unnamed)", item.bytes || 0, suffix));
        }
    } else {
        lines.push("No merged metadata field data available.");
    }

    return lines.join("\n");
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
const ABSTRACT_DOT_SENTINEL = "\uE000";
const PDF_LIGATURES = {
    "\uFB00": "ff",
    "\uFB01": "fi",
    "\uFB02": "fl",
    "\uFB03": "ffi",
    "\uFB04": "ffl",
    "\uFB05": "ft",
    "\uFB06": "st",
};

function normalizePdfAbstractText(raw) {
    let s = String(raw || "");
    if (!s) return "";

    if (typeof s.normalize === "function") {
        s = s.normalize("NFKC");
    }

    // Remove invisible joiners and soft hyphen artifacts commonly present in PDF copy.
    s = s.replace(/\u00AD/g, "");
    s = s.replace(/[\u2060\u200B-\u200D\uFEFF]/g, "");

    for (const [ligature, replacement] of Object.entries(PDF_LIGATURES)) {
        s = s.split(ligature).join(replacement);
    }

    // Normalize Unicode hyphen variants before de-wrapping line-broken words.
    s = s.replace(/[\u2010\u2011\u2012\u2013\u2212]/g, "-");
    s = s.replace(/([A-Za-z])-+\s*[\r\n]+\s*([a-z])/g, "$1$2");

    // Recover common copied symbol artifacts seen in some PDF glyph streams.
    // Example: "37C" => "37°C", and "10 G 2" => "10 ± 2".
    s = s.replace(/(\d)\s*\u000E(?=\s*(?:[CFKcfk]|$))/g, "$1°");
    s = s.replace(/\u000E(?=\s*(?:[CFKcfk]))/g, "°");
    s = s.replace(/(\d+(?:\.\d+)?)\s*G\s*(\d+(?:\.\d+)?)/g, "$1 ± $2");

    // Remove stray super/subscript unicode chars.
    s = s.replace(/[\u2070-\u209F\u00B2\u00B3\u00B9\u1D43-\u1D6A\u2071\u207F]/g, "");

    // Strip remaining non-printable control chars (except line breaks handled below).
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000F-\u001F\u007F]/g, "");

    // Flatten remaining line breaks and normalize spacing.
    s = s.replace(/[\r\n]+/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    return s;
}

function tokenizeAbstractSentences(rawText) {
    const source = normalizeWhitespace(rawText);
    if (!source) return [];

    // Prefer built-in sentence segmentation when available.
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
        try {
            const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
            const nativeSentences = Array.from(segmenter.segment(source))
                .map((part) => normalizeWhitespace(part.segment))
                .filter(Boolean);
            if (nativeSentences.length > 0) return nativeSentences;
        } catch {
            // Fallback to lightweight heuristic tokenizer below.
        }
    }

    const protectDots = (match) => match.replace(/\./g, ABSTRACT_DOT_SENTINEL);
    let prepared = source;

    // Protect periods that are unlikely to indicate sentence boundaries.
    prepared = prepared.replace(/\.{2,}/g, protectDots);
    prepared = prepared.replace(
        /\b(?:e\.g|i\.e|etc|vs|cf|al|fig|figs|eq|eqs|ref|refs|dr|mr|mrs|ms|prof|inc|jr|sr|st|no|vol|pp|dept|approx|min|max|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\./gi,
        protectDots,
    );
    prepared = prepared.replace(/\bet al\./gi, protectDots);
    prepared = prepared.replace(/\b(?:[A-Z]\.){2,}/g, protectDots);
    prepared = prepared.replace(/\b[A-Z]\.(?=\s*[A-Z][a-z])/g, protectDots);
    prepared = prepared.replace(/(\d)\.(\d)/g, `$1${ABSTRACT_DOT_SENTINEL}$2`);

    const boundaryRe = /[.!?]+(?=\s+(?:["')\]]*[A-Z0-9]))/g;
    const pieces = [];
    let start = 0;
    let match;
    while ((match = boundaryRe.exec(prepared)) !== null) {
        const end = match.index + match[0].length;
        const part = prepared.slice(start, end).trim();
        if (part) pieces.push(part);
        start = end;
    }
    const tail = prepared.slice(start).trim();
    if (tail) pieces.push(tail);

    const dotSentinelRe = new RegExp(ABSTRACT_DOT_SENTINEL, "g");
    const restored = pieces
        .map((part) => normalizeWhitespace(part.replace(dotSentinelRe, ".")))
        .filter(Boolean);
    return restored.length > 0 ? restored : [source];
}

function splitSentencesIntoSections(sentences, sectionCount) {
    const clean = (sentences || []).map((s) => normalizeWhitespace(s)).filter(Boolean);
    if (clean.length === 0) return [];

    const targetSections = Math.min(clampAbstractSectionCount(sectionCount), clean.length);
    if (targetSections <= 1) return [clean.join(" ")];

    const totalChars = clean.reduce((sum, sentence) => sum + sentence.length, 0);
    const targetCharsPerSection = Math.max(1, Math.ceil(totalChars / targetSections));

    const sections = [];
    let index = 0;
    for (let sectionIndex = 0; sectionIndex < targetSections; sectionIndex++) {
        const remainingSections = targetSections - sectionIndex;
        const remainingSentences = clean.length - index;
        if (remainingSections === 1) {
            sections.push(clean.slice(index));
            break;
        }

        const maxTake = remainingSentences - (remainingSections - 1);
        let take = 0;
        let chars = 0;
        while (take < maxTake) {
            const nextSentence = clean[index + take];
            if (take > 0 && chars >= targetCharsPerSection) break;
            chars += nextSentence.length + 1;
            take += 1;
        }
        if (take < 1) take = 1;

        sections.push(clean.slice(index, index + take));
        index += take;
    }

    // If a section ends up with a single sentence, merge it into the neighboring
    // section that currently has fewer sentences (while preserving sentence order).
    let changed = true;
    while (changed && sections.length > 1) {
        changed = false;
        if (sections.every((section) => section.length === 1)) break;

        for (let i = 0; i < sections.length; i++) {
            if (sections[i].length !== 1) continue;

            const leftCount = i > 0 ? sections[i - 1].length : Number.POSITIVE_INFINITY;
            const rightCount = i < sections.length - 1 ? sections[i + 1].length : Number.POSITIVE_INFINITY;
            const loneSentence = sections[i][0];

            if (!Number.isFinite(leftCount) && !Number.isFinite(rightCount)) continue;

            if (leftCount <= rightCount && Number.isFinite(leftCount)) {
                sections[i - 1].push(loneSentence);
            } else if (Number.isFinite(rightCount)) {
                sections[i + 1].unshift(loneSentence);
            } else if (Number.isFinite(leftCount)) {
                sections[i - 1].push(loneSentence);
            }

            sections.splice(i, 1);
            changed = true;
            break;
        }
    }

    return sections.map((section) => section.join(" ")).filter(Boolean);
}

function cleanAbstract(raw, sectionCount = 3) {
    const source = normalizePdfAbstractText(raw);
    if (!source) return "";

    const sentences = tokenizeAbstractSentences(source);
    const targetSections = clampAbstractSectionCount(sectionCount);
    if (sentences.length <= targetSections) return sentences.join(" ");

    return splitSentencesIntoSections(sentences, targetSections).join("\n\n");
}

function formatAbstractForDisplay(rawText, sectionCount) {
    const source = (rawText || "").replace(/\r\n/g, "\n").trim();
    if (!source) return "";
    const singleLine = source.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    if (!singleLine) return "";

    const sentences = tokenizeAbstractSentences(singleLine);
    if (sentences.length <= 1) return singleLine;

    const targetSections = Math.min(clampAbstractSectionCount(sectionCount), sentences.length);
    if (targetSections <= 1) return singleLine;

    return splitSentencesIntoSections(sentences, targetSections).join("\n\n");
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
    // Keep niche-designated tags available in autocomplete even if hidden from view.
    for (const nicheTag of state.nicheTags || []) {
        const t = normalizeWhitespace(nicheTag);
        if (t) set.add(t);
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
    x.textContent = "x";
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

function updateNicheUiVisibility() {
    const enabled = Boolean(state.enableNiche);
    if (dom.showNicheRow) {
        dom.showNicheRow.classList.toggle("hidden", !enabled);
        dom.showNicheRow.style.display = enabled ? "flex" : "none";
    }
    if (dom.nicheTagsField) {
        dom.nicheTagsField.classList.toggle("hidden", !enabled);
        dom.nicheTagsField.style.display = enabled ? "" : "none";
    }
    if (dom.showNicheCheckbox) {
        dom.showNicheCheckbox.checked = enabled ? state.showNiche : false;
    }
    if (dom.enableNicheCheckbox) {
        dom.enableNicheCheckbox.checked = enabled;
    }
}

function getVisibleSortedArticles() {
    const nicheSet = new Set((state.nicheTags || []).map((t) => t.toLowerCase()));
    const visible = state.enableNiche && !state.showNiche && nicheSet.size > 0
        ? state.articles.filter((article) => {
            const tags = (article.metadata?.tags || []).map((t) => t.trim().toLowerCase());
            return !tags.some((t) => nicheSet.has(t));
        })
        : state.articles;
    return sortArticles(visible);
}

function getNeighborArticleById(articleId, direction) {
    if (!articleId) return null;
    const ordered = getVisibleSortedArticles();
    const currentIndex = ordered.findIndex((article) => article.id === articleId);
    if (currentIndex < 0) return null;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= ordered.length) return null;
    return ordered[nextIndex];
}

function resolveArticleById(articleId) {
    if (!articleId) return null;
    return state.articles.find((article) => article.id === articleId) || null;
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
let thumbnailUndoHideTimer = null;
const THUMBNAIL_UNDO_TIMEOUT_MS = 5000;

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

function isManualThumbnail(article) {
    return Boolean(article?.thumbnail?.path && article?.auto_thumbnail?.path && article.thumbnail.path !== article.auto_thumbnail.path);
}

function collectThumbnailPaths(article) {
    return Array.from(new Set([
        article?.thumbnail?.path,
        article?.auto_thumbnail?.path,
    ].filter(Boolean)));
}

function invalidateThumbnailPaths(paths) {
    for (const path of paths || []) {
        if (path) thumbCache.delete(path);
    }
}

function captureEditorFormSnapshot(articleId) {
    if (!articleId || dom.modal.classList.contains("hidden") || state.current?.id !== articleId) {
        return null;
    }
    return {
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
}

function restoreEditorFormSnapshot(snapshot) {
    if (!snapshot) return;
    dom.title.value = snapshot.title;
    dom.authors.value = snapshot.authors;
    dom.year.value = snapshot.year;
    dom.journal.value = snapshot.journal;
    dom.volume.value = snapshot.volume;
    dom.issue.value = snapshot.issue;
    dom.pages.value = snapshot.pages;
    dom.doi.value = snapshot.doi;
    dom.abstract.value = snapshot.abstract;
    setTagChips(snapshot.tags);
    dom.notes.value = snapshot.notes;
}

async function captureThumbnailUndoState(article) {
    if (!article) return null;
    const previousPaths = collectThumbnailPaths(article);
    if (previousPaths.length === 0) return null;

    const undoState = {
        articleId: article.id,
        title: normalizeWhitespace(article.metadata?.title) || article.pdf_filename,
        previousMode: isManualThumbnail(article) ? "manual" : "auto",
        previousPaths,
        previousData: "",
    };

    if (undoState.previousMode === "manual") {
        const currentPath = articleThumbPath(article);
        const dataUrl = currentPath ? await getThumbDataUrl(currentPath) : "";
        const base64 = String(dataUrl || "").split(",")[1] || "";
        if (!base64) return null;
        undoState.previousData = base64;
    }

    return undoState;
}

function stopThumbnailUndoPrompt() {
    if (state.thumbnailUndo?.rafId) cancelAnimationFrame(state.thumbnailUndo.rafId);
    clearTimeout(thumbnailUndoHideTimer);
    state.thumbnailUndo = null;
    if (!dom.thumbnailUndo) return;
    dom.thumbnailUndo.classList.remove("visible");
    dom.thumbnailUndo.classList.add("hidden");
    dom.thumbnailUndoBtn.disabled = false;
    dom.thumbnailUndoBtn.textContent = "Undo";
    dom.thumbnailUndoProgress.style.transform = "scaleX(0)";
}

function hideThumbnailUndoPrompt() {
    if (state.thumbnailUndo?.rafId) cancelAnimationFrame(state.thumbnailUndo.rafId);
    clearTimeout(thumbnailUndoHideTimer);
    state.thumbnailUndo = null;
    if (!dom.thumbnailUndo) return;
    dom.thumbnailUndo.classList.remove("visible");
    thumbnailUndoHideTimer = setTimeout(() => {
        if (state.thumbnailUndo) return;
        dom.thumbnailUndo.classList.add("hidden");
        dom.thumbnailUndoBtn.disabled = false;
        dom.thumbnailUndoBtn.textContent = "Undo";
        dom.thumbnailUndoProgress.style.transform = "scaleX(0)";
    }, 220);
}

function updateThumbnailUndoProgress() {
    if (!state.thumbnailUndo || !dom.thumbnailUndoProgress) return;
    const progress = Math.max(0, Math.min(1, state.thumbnailUndo.elapsedMs / THUMBNAIL_UNDO_TIMEOUT_MS));
    dom.thumbnailUndoProgress.style.transform = `scaleX(${progress})`;
}

function tickThumbnailUndo(now) {
    const undo = state.thumbnailUndo;
    if (!undo) return;

    if (!undo.lastTick) undo.lastTick = now;
    if (!undo.paused) {
        undo.elapsedMs = Math.min(THUMBNAIL_UNDO_TIMEOUT_MS, undo.elapsedMs + (now - undo.lastTick));
    }
    undo.lastTick = now;
    updateThumbnailUndoProgress();

    if (undo.elapsedMs >= THUMBNAIL_UNDO_TIMEOUT_MS) {
        hideThumbnailUndoPrompt();
        return;
    }

    undo.rafId = requestAnimationFrame(tickThumbnailUndo);
}

function showThumbnailUndoPrompt(undoState) {
    if (!undoState || !dom.thumbnailUndo) return;
    stopThumbnailUndoPrompt();

    state.thumbnailUndo = {
        ...undoState,
        elapsedMs: 0,
        lastTick: 0,
        paused: false,
        restoring: false,
        rafId: 0,
    };

    dom.thumbnailUndoMessage.textContent = "Undo image replacement?";
    dom.thumbnailUndoBtn.disabled = false;
    dom.thumbnailUndoBtn.textContent = "Undo";
    dom.thumbnailUndoProgress.style.transform = "scaleX(0)";
    dom.thumbnailUndo.classList.remove("hidden");

    requestAnimationFrame(() => {
        if (!state.thumbnailUndo) return;
        dom.thumbnailUndo.classList.add("visible");
        state.thumbnailUndo.rafId = requestAnimationFrame(tickThumbnailUndo);
    });
}

async function reloadArticleAfterThumbnailChange(articleId, formSnapshot = null) {
    await loadArticles();
    const updatedArticle = state.articles.find((a) => a.id === articleId) || null;

    if (formSnapshot) {
        state.current = updatedArticle;
        if (updatedArticle) {
            openEditor(updatedArticle);
            restoreEditorFormSnapshot(formSnapshot);
        } else {
            closeEditor();
        }
    } else if (state.current?.id === articleId) {
        state.current = updatedArticle;
    }

    return updatedArticle;
}

async function replaceThumbnailImage(article, file) {
    if (!article) return null;

    const formSnapshot = captureEditorFormSnapshot(article.id);
    const undoState = await captureThumbnailUndoState(article);
    const previousPaths = collectThumbnailPaths(article);
    const base64Data = await fileToBase64(file);

    await invoke("upload_thumbnail", {
        articleId: article.id,
        data: base64Data,
    });

    invalidateThumbnailPaths(previousPaths);
    const updatedArticle = await reloadArticleAfterThumbnailChange(article.id, formSnapshot);

    if (undoState) showThumbnailUndoPrompt(undoState);
    return updatedArticle;
}

async function undoThumbnailReplacement() {
    const undo = state.thumbnailUndo;
    if (!undo || undo.restoring) return;

    undo.restoring = true;
    undo.paused = true;
    dom.thumbnailUndoBtn.disabled = true;
    dom.thumbnailUndoBtn.textContent = "Restoring...";

    const formSnapshot = captureEditorFormSnapshot(undo.articleId);
    const currentArticle = state.articles.find((article) => article.id === undo.articleId) || null;

    try {
        invalidateThumbnailPaths([
            ...undo.previousPaths,
            ...collectThumbnailPaths(currentArticle),
        ]);

        if (undo.previousMode === "manual") {
            if (!undo.previousData) throw new Error("Previous thumbnail data is unavailable.");
            await invoke("upload_thumbnail", {
                articleId: undo.articleId,
                data: undo.previousData,
            });
        } else {
            await invoke("save_metadata", {
                articleId: undo.articleId,
                payload: { thumbnail_mode: "auto" },
            });
        }

        hideThumbnailUndoPrompt();
        await reloadArticleAfterThumbnailChange(undo.articleId, formSnapshot);
        setStatus("Previous thumbnail restored.");
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        undo.restoring = false;
        undo.paused = Boolean(dom.thumbnailUndo?.matches(":hover"));
        undo.lastTick = performance.now();
        dom.thumbnailUndoBtn.disabled = false;
        dom.thumbnailUndoBtn.textContent = "Undo";
        setStatus(`Undo failed: ${message}`, true);
    }
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

// Returns { bg: string, border: string } | null
function getCardTint(article) {
    if (!state.tintByTag) return null;
    const tag = getDominantTag(article);
    if (!tag) return null;
    const [h, s, l] = hexToHsl(state.tagColors[tag]);
    const alpha = state.colorIntensity / 100;
    return {
        bg: `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${alpha})`,
        border: `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(Math.min(l + 10, 90))}%, 0.75)`,
    };
}

// ---- Theme ----
const VALID_THEMES = new Set(["ocean", "midnight", "nord", "monokai", "solarized", "light"]);
function applyTheme(value) {
    const theme = VALID_THEMES.has(value) ? value : "ocean";
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    if (dom.themeSelect) dom.themeSelect.value = theme;
}

// ---- Tag frequency helpers ----
// Returns a map of tag -> count across all currently loaded articles
function getTagFrequencyMap() {
    const freq = new Map();
    for (const article of state.articles) {
        for (const t of (article.metadata?.tags || [])) {
            const tag = t.trim();
            if (tag) freq.set(tag, (freq.get(tag) || 0) + 1);
        }
    }
    return freq;
}

// Returns the dominant (most frequent) tag for a given article that has a color assigned,
// breaking ties alphabetically.
function getDominantTag(article) {
    const freq = getTagFrequencyMap();
    const tags = (article.metadata?.tags || [])
        .map(t => t.trim())
        .filter(t => t && state.tagColors[t]);
    if (tags.length === 0) return null;
    tags.sort((a, b) => {
        const diff = (freq.get(b) || 0) - (freq.get(a) || 0);
        return diff !== 0 ? diff : a.localeCompare(b);
    });
    return tags[0];
}

function saveTagColors() {
    window.localStorage.setItem("article-tag-colors", JSON.stringify(state.tagColors));
}

// ---- Hotkey resolution ----
function modMatch(evt, binding) {
    return evt.ctrlKey === binding.ctrl && evt.altKey === binding.alt && evt.shiftKey === binding.shift;
}

// Returns true if an action was taken, false if we should prevent default
function resolveClickAction(evt, article) {
    const hk = state.hotkeys;
    if (modMatch(evt, hk.editMetadata)) { evt.preventDefault(); evt.stopPropagation(); openEditor(article); return true; }
    if (modMatch(evt, hk.openAbstract)) { evt.preventDefault(); evt.stopPropagation(); openAbstract(article); return true; }
    if (modMatch(evt, hk.copyBibtex)) {
        evt.preventDefault(); evt.stopPropagation();
        const bib = generateBibtex(article);
        copyToClipboard(bib).then(ok => showToast(ok ? "BibTeX copied to clipboard" : "Failed to copy BibTeX"));
        return true;
    }
    if (modMatch(evt, hk.openLocation)) { evt.preventDefault(); evt.stopPropagation(); openFileLocation(article); return true; }
    if (modMatch(evt, hk.openPdf)) { evt.preventDefault(); evt.stopPropagation(); openPdf(article); return true; }
    // No binding matched — fall through (e.g., right-click menus)
    return false;
}

const CLICK_ACTIONS = [
    { key: "openPdf", label: "Open PDF" },
    { key: "editMetadata", label: "Edit Metadata" },
    { key: "openAbstract", label: "Preview Abstract" },
    { key: "copyBibtex", label: "Copy BibTeX" },
    { key: "openLocation", label: "Open File Location" },
];
const KEYBOARD_SHORTCUTS = [
    { label: "Paste thumbnail", key: "pasteThumb" },
    { label: "Save & close", key: "enter" },
    { label: "Switch modal", key: "arrowToggle" },
    { label: "Prev article", key: "prevArticle" },
    { label: "Next article", key: "nextArticle" },
];
const WELLNESS_TIPS = [
    {
        text: "20/20/20 rule! — every 20 minutes, look 20 feet away for 20 seconds!",
        // sourceLabel: "Source: Mayo Clinic",
        // sourceUrl: "https://www.mayoclinic.org/diseases-conditions/eyestrain/diagnosis-treatment/drc-20372403",
    },
    {
        text: "blink! — screen time can lower blink rate by 80%.  Try 5 blinks after each paragraph.",
        // sourceLabel: "Source: Mayo Clinic",
        // sourceUrl: "https://www.mayoclinic.org/diseases-conditions/eyestrain/diagnosis-treatment/drc-20372403",
    },
    {
        text: "water check! — you're already dehydrated by the time you feel thirsty!",
    },
    {
        text: "deep breath! — inhale 4s, hold 7s, exhale 8s!",
    },
    {
        text: "posture reset! — squeeze shoulder blades for 5 seconds, repeat 5 times!",
    },
    {
        text: "mouth check! — relax your jaw and rest your tongue lightly on the roof of your mouth!",
    },
    {
        text: "'name it to tame it'! — reduce distress by identifying your feelings in words!",
        // sourceLabel: "Source: DOI 10.1371/journal.pone.0279303",
        // sourceUrl: "https://doi.org/10.1371/journal.pone.0279303",
    },
];

// Hotkey capture state
let _hkListening = null; // { key, cleanup }

function buildHotkeyTable() {
    const container = dom.hotkeyTableContainer;
    if (!container) return;
    clearNode(container);

    const makeModBtn = (label, active, toggle) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.className = "ghost";
        btn.style.cssText = `padding:2px 6px;font-size:0.75rem;border-radius:4px;font-family:monospace;${active ? "background:var(--accent);color:var(--bg);border-color:var(--accent);" : ""
            }`;
        btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); buildHotkeyTable(); });
        return btn;
    };

    // ─── Click-action section ───
    const clickHeader = document.createElement("div");
    clickHeader.style.cssText = "font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;padding:6px 0 4px;";
    clickHeader.textContent = "Click Actions";
    container.appendChild(clickHeader);

    const clickTable = document.createElement("table");
    clickTable.style.cssText = "width:100%;border-collapse:collapse;font-size:0.85rem;";

    const bindingCounts = {};
    for (const action of CLICK_ACTIONS) {
        const b = state.hotkeys[action.key];
        const key = `${b.ctrl}-${b.alt}-${b.shift}`;
        bindingCounts[key] = (bindingCounts[key] || 0) + 1;
    }

    let hasDuplicates = false;
    for (const action of CLICK_ACTIONS) {
        const binding = state.hotkeys[action.key];
        const isDuplicate = bindingCounts[`${binding.ctrl}-${binding.alt}-${binding.shift}`] > 1;
        if (isDuplicate) hasDuplicates = true;

        const tr = document.createElement("tr");
        if (isDuplicate) {
            tr.style.outline = "2px solid var(--danger)";
            tr.style.backgroundColor = "rgba(255, 60, 60, 0.1)";
        }
        const tdLabel = document.createElement("td");
        tdLabel.textContent = action.label;
        tdLabel.style.padding = "5px 0 5px 4px";
        const tdMods = document.createElement("td");
        tdMods.style.cssText = "display:flex;gap:4px;align-items:center;padding:5px 0;";
        tdMods.appendChild(makeModBtn("Ctrl", binding.ctrl, () => { binding.ctrl = !binding.ctrl; saveHotkeys(); }));
        tdMods.appendChild(makeModBtn("Alt", binding.alt, () => { binding.alt = !binding.alt; saveHotkeys(); }));
        tdMods.appendChild(makeModBtn("Shift", binding.shift, () => { binding.shift = !binding.shift; saveHotkeys(); }));
        const tdClick = document.createElement("td");
        tdClick.style.cssText = "padding:5px 0 5px 6px;opacity:0.6;font-size:0.78rem;white-space:nowrap;";
        tdClick.textContent = "+Click";
        tr.appendChild(tdLabel);
        tr.appendChild(tdMods);
        tr.appendChild(tdClick);
        clickTable.appendChild(tr);
    }
    container.appendChild(clickTable);

    if (hasDuplicates) {
        const warnRow = document.createElement("div");
        warnRow.style.cssText = "color:var(--danger);font-size:0.75rem;margin-top:4px;";
        warnRow.textContent = "Warning: Duplicate hotkeys detected.";
        container.appendChild(warnRow);
    }

    // Reset defaults
    const resetRow = document.createElement("div");
    resetRow.style.cssText = "text-align:right;margin-top:6px;";
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset Defaults";
    resetBtn.className = "ghost";
    resetBtn.style.cssText = "font-size:0.75rem;padding:2px 8px;color:var(--muted);";
    resetBtn.addEventListener("click", () => { state.hotkeys = { ...DEFAULT_HOTKEYS }; saveHotkeys(); buildHotkeyTable(); });
    resetRow.appendChild(resetBtn);
    container.appendChild(resetRow);

    // ─── Separator ───
    const sep = document.createElement("hr");
    sep.style.cssText = "border:none;border-top:1px solid var(--line);margin:12px 0;";
    container.appendChild(sep);

    // ─── Keyboard-shortcut section ───
    const kbHeader = document.createElement("div");
    kbHeader.style.cssText = "font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;padding:0 0 4px;";
    kbHeader.textContent = "Keyboard Shortcuts";
    container.appendChild(kbHeader);

    const kbTable = document.createElement("table");
    kbTable.style.cssText = "width:100%;border-collapse:collapse;font-size:0.85rem;";

    const kbBindingCounts = {};
    for (const shortcut of KEYBOARD_SHORTCUTS) {
        for (const binding of getKeyboardShortcutBindings(shortcut.key)) {
            kbBindingCounts[binding] = (kbBindingCounts[binding] || 0) + 1;
        }
    }

    let hasKeyboardDuplicates = false;

    for (const shortcut of KEYBOARD_SHORTCUTS) {
        const tr = document.createElement("tr");
        const isDuplicate = getKeyboardShortcutBindings(shortcut.key).some((binding) => kbBindingCounts[binding] > 1);
        if (isDuplicate) {
            hasKeyboardDuplicates = true;
            tr.style.outline = "2px solid var(--danger)";
            tr.style.backgroundColor = "rgba(255, 60, 60, 0.1)";
        }
        const tdL = document.createElement("td");
        tdL.textContent = shortcut.label;
        tdL.style.padding = "5px 0";

        const tdDesc = document.createElement("td");
        const isListening = _hkListening?.key === shortcut.key;
        if (isListening) {
            const listening = document.createElement("span");
            listening.textContent = "⌨ Listening…";
            listening.style.cssText = "color:var(--accent-2);font-size:0.8rem;font-style:italic;";
            tdDesc.appendChild(listening);
        } else {
            const kbd = document.createElement("kbd");
            kbd.textContent = getKeyboardShortcutDisplay(shortcut.key);
            tdDesc.appendChild(kbd);
        }

        const tdEdit = document.createElement("td");
        tdEdit.style.cssText = "text-align:right;padding:5px 0;";
        const pencil = document.createElement("button");
        pencil.type = "button";
        pencil.textContent = "···";
        pencil.className = "ghost";
        pencil.title = "Listen for key combo";
        pencil.style.cssText = `font-size:0.85rem;font-weight:bold;padding:1px 6px;${isListening ? "color:var(--accent-2);" : ""}`;
        pencil.addEventListener("click", (e) => {
            e.stopPropagation();
            if (_hkListening) {
                _hkListening.cleanup();
                _hkListening = null;
                buildHotkeyTable();
                return;
            }
            _hkListening = { key: shortcut.key, cleanup: () => { } };
            buildHotkeyTable();
            const handler = (ke) => {
                ke.preventDefault();
                ke.stopPropagation();
                const binding = eventToShortcutBinding(ke);
                if (!binding) return;
                state.keyboardShortcuts[shortcut.key] = [binding];
                saveKeyboardShortcuts();
                _hkListening.cleanup();
                _hkListening = null;
                buildHotkeyTable();
            };
            document.addEventListener("keydown", handler, { capture: true });
            _hkListening.cleanup = () => document.removeEventListener("keydown", handler, { capture: true });
        });
        tdEdit.appendChild(pencil);
        tr.appendChild(tdL);
        tr.appendChild(tdDesc);
        tr.appendChild(tdEdit);
        kbTable.appendChild(tr);
    }
    container.appendChild(kbTable);

    if (hasKeyboardDuplicates) {
        const warnRow = document.createElement("div");
        warnRow.style.cssText = "color:var(--danger);font-size:0.75rem;margin-top:4px;";
        warnRow.textContent = "Warning: Duplicate keyboard shortcuts detected.";
        container.appendChild(warnRow);
    }

    const kbResetRow = document.createElement("div");
    kbResetRow.style.cssText = "text-align:right;margin-top:6px;";
    const kbResetBtn = document.createElement("button");
    kbResetBtn.type = "button";
    kbResetBtn.textContent = "Reset Defaults";
    kbResetBtn.className = "ghost";
    kbResetBtn.style.cssText = "font-size:0.75rem;padding:2px 8px;color:var(--muted);";
    kbResetBtn.addEventListener("click", () => {
        state.keyboardShortcuts = cloneDefaultKeyboardShortcuts();
        saveKeyboardShortcuts();
        buildHotkeyTable();
    });
    kbResetRow.appendChild(kbResetBtn);
    container.appendChild(kbResetRow);
}

function saveHotkeys() {
    window.localStorage.setItem("article-hotkeys", JSON.stringify(state.hotkeys));
}

function normalizeTipIndex(index) {
    if (!Number.isInteger(index) || WELLNESS_TIPS.length === 0) return 0;
    const span = WELLNESS_TIPS.length;
    return ((index % span) + span) % span;
}

function renderWellnessTip() {
    if (!dom.hotkeyTipText || !dom.hotkeyTipSource) return;
    if (WELLNESS_TIPS.length === 0) {
        dom.hotkeyTipText.textContent = "";
        dom.hotkeyTipSource.style.display = "none";
        return;
    }
    state.wellnessTipIndex = normalizeTipIndex(state.wellnessTipIndex);
    const tip = WELLNESS_TIPS[state.wellnessTipIndex];
    dom.hotkeyTipText.textContent = tip.text;
    if (tip.sourceLabel && tip.sourceUrl) {
        dom.hotkeyTipSource.textContent = tip.sourceLabel;
        dom.hotkeyTipSource.href = tip.sourceUrl;
        dom.hotkeyTipSource.style.display = "";
    } else {
        dom.hotkeyTipSource.textContent = "";
        dom.hotkeyTipSource.removeAttribute("href");
        dom.hotkeyTipSource.style.display = "none";
    }
}

function nextWellnessTip() {
    state.wellnessTipIndex = normalizeTipIndex(state.wellnessTipIndex + 1);
    window.localStorage.setItem("article-wellness-tip-index", String(state.wellnessTipIndex));
    renderWellnessTip();
}

function normalizeNicheTag(tag) {
    return normalizeWhitespace(tag).toLowerCase();
}

function getNicheTagChips() {
    if (!dom.nicheTagChipContainer) return [];
    return Array.from(dom.nicheTagChipContainer.querySelectorAll(".niche-tag-chip"))
        .map((chip) => normalizeNicheTag(chip.dataset.nicheTag || ""))
        .filter(Boolean);
}

function persistNicheTags() {
    state.nicheTags = getNicheTagChips();
    window.localStorage.setItem("article-niche-tags", JSON.stringify(state.nicheTags));
    renderArticles();
    debugLog(`Niche tags updated (${state.nicheTags.length}).`);
}

function addNicheTagChip(tag, shouldPersist = true) {
    if (!dom.nicheTagChipContainer || !dom.nicheTagsInput) return;
    const cleanTag = normalizeNicheTag(tag);
    if (!cleanTag) return;
    const existing = getNicheTagChips();
    if (existing.includes(cleanTag)) return;

    const chip = document.createElement("span");
    chip.className = "tag-chip niche-tag-chip";
    chip.dataset.nicheTag = cleanTag;
    chip.textContent = cleanTag;

    const x = document.createElement("span");
    x.className = "chip-x";
    x.textContent = "x";
    x.addEventListener("click", (evt) => {
        evt.stopPropagation();
        chip.remove();
        persistNicheTags();
    });

    chip.appendChild(x);
    dom.nicheTagChipContainer.insertBefore(chip, dom.nicheTagsInput);
    if (shouldPersist) persistNicheTags();
}

function setNicheTagChips(tags) {
    if (!dom.nicheTagChipContainer) return;
    dom.nicheTagChipContainer.querySelectorAll(".niche-tag-chip").forEach((chip) => chip.remove());

    const seen = new Set();
    for (const tag of tags || []) {
        const cleanTag = normalizeNicheTag(tag);
        if (!cleanTag || seen.has(cleanTag)) continue;
        seen.add(cleanTag);
        addNicheTagChip(cleanTag, false);
    }
    state.nicheTags = Array.from(seen);
    window.localStorage.setItem("article-niche-tags", JSON.stringify(state.nicheTags));
}

function extractDoiFromText(value) {
    if (!value) return "";
    const match = String(value).match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
    return match ? match[0] : "";
}

function buildAnnaSciDbUrl(doi) {
    const cleanDoi = normalizeWhitespace(doi).replace(/\/+$/, "");
    if (!cleanDoi) return "";
    return `https://annas-archive.gl/scidb/${encodeURI(cleanDoi)}/`;
}

async function openExternalUrl(url) {
    const target = normalizeWhitespace(url);
    if (!target) return;
    try {
        await invoke("open_external_url", { url: target });
    } catch (err) {
        // Fallback for environments where backend command might not be present yet.
        window.open(target, "_blank", "noopener,noreferrer");
    }
}

function isDoiInLibrary(doi) {
    if (!doi) return false;
    const cleanDoi = normalizeWhitespace(doi).toLowerCase();
    return state.articles.some((article) => {
        const articleDoi = article.metadata?.doi;
        return articleDoi && normalizeWhitespace(articleDoi).toLowerCase() === cleanDoi;
    });
}

function createAbstractReferenceRow(labelText, ordinal = null, muted = false) {
    const doi = extractDoiFromText(labelText);
    const rowTag = doi ? "a" : "div";
    const row = document.createElement(rowTag);
    row.className = "abstract-ref-row";
    if (muted) row.classList.add("muted");
    if (doi) {
        row.href = `https://doi.org/${doi}`;
        row.target = "_blank";
        row.rel = "noopener noreferrer";

        row.addEventListener("click", async (evt) => {
            if (!(evt.ctrlKey && evt.altKey && evt.shiftKey)) return;
            const annaUrl = buildAnnaSciDbUrl(doi);
            if (!annaUrl) return;
            evt.preventDefault();
            evt.stopPropagation();
            await openExternalUrl(annaUrl);
        });
    }

    const iconSlot = document.createElement("span");
    iconSlot.className = "abstract-ref-icon-slot";
    if (isDoiInLibrary(doi)) {
        const icon = document.createElement("img");
        icon.src = "ghost-icon.png";
        icon.alt = "";
        icon.className = "abstract-ref-icon";
        iconSlot.appendChild(icon);
    }

    const indexNode = document.createElement("span");
    indexNode.className = "abstract-ref-index";
    indexNode.textContent = Number.isInteger(ordinal) ? `${ordinal}.` : "";

    const textNode = document.createElement("span");
    textNode.className = "abstract-ref-text";
    textNode.textContent = doi || labelText;

    row.appendChild(iconSlot);
    row.appendChild(indexNode);
    row.appendChild(textNode);
    return row;
}

function createAbstractReferenceColumns(refItems, startOrdinal = 1, muted = false) {
    const refs = (refItems || []).map((item) => String(item || "").trim()).filter(Boolean);
    const wrapper = document.createElement("div");
    wrapper.className = "abstract-ref-columns";
    if (refs.length === 0) return wrapper;

    const columnCount = Math.min(3, refs.length);
    const perColumn = Math.ceil(refs.length / columnCount);
    for (let col = 0; col < columnCount; col++) {
        const columnEl = document.createElement("div");
        columnEl.className = "abstract-ref-column";
        const start = col * perColumn;
        const slice = refs.slice(start, start + perColumn);
        slice.forEach((ref, idx) => {
            columnEl.appendChild(createAbstractReferenceRow(ref, startOrdinal + start + idx, muted));
        });
        wrapper.appendChild(columnEl);
    }
    return wrapper;
}

function openAbstract(article) {
    const md = article.metadata || {};
    state.abstractPreviewArticle = article;
    dom.abstractTitle.textContent = md.title || article.pdf_filename || "Abstract";
    const yearText = normalizeWhitespace(md.year);
    const authorText = compactAuthors(md.authors);
    const journalText = normalizeWhitespace(md.journal);
    if (dom.abstractMeta) {
        clearNode(dom.abstractMeta);
        let hasMeta = false;
        if (yearText) {
            const yearEl = document.createElement("strong");
            yearEl.textContent = yearText;
            dom.abstractMeta.appendChild(yearEl);
            hasMeta = true;
        }
        if (authorText) {
            if (hasMeta) dom.abstractMeta.appendChild(document.createTextNode(" | "));
            dom.abstractMeta.appendChild(document.createTextNode(authorText));
            hasMeta = true;
        }
        if (journalText) {
            if (hasMeta) dom.abstractMeta.appendChild(document.createTextNode(" | "));
            dom.abstractMeta.appendChild(document.createTextNode(journalText));
            hasMeta = true;
        }
        if (!hasMeta) {
            dom.abstractMeta.textContent = "Unknown metadata";
        }
        dom.abstractMeta.style.display = "";
    }
    const abstractText = typeof md.abstract === "string" ? md.abstract.trim() : "";
    const formattedAbstract = formatAbstractForDisplay(abstractText, state.abstractSectionCount);
    dom.abstractText.textContent = formattedAbstract || "No abstract available.";
    debugLog(`Opened abstract modal for article ${article.id} (sections=${state.abstractSectionCount}).`);

    if (dom.abstractReferencesSection) {
        dom.abstractReferencesSection.style.display = "none";
        clearNode(dom.abstractReferencesList);
    }

    dom.abstractModal.classList.remove("hidden");

    // Show stored ref_dois from DOI fetch (if any and enabled)
    const storedRefDois = getReferenceDois(md);
    let nextReferenceOrdinal = 1;
    if (dom.abstractReferencesSection && storedRefDois.length > 0 && state.showRefDois) {
        const ownDoi = normalizeWhitespace(md.doi).toLowerCase();
        const filtered = storedRefDois
            .map((d) => (typeof d === "string" ? d.trim() : ""))
            .filter(Boolean)
            .filter((ref) => {
                const refDoi = normalizeWhitespace(extractDoiFromText(ref)).toLowerCase();
                return !ownDoi || refDoi !== ownDoi;
            });
        if (filtered.length > 0) {
            const toShow = filtered.slice(0, 3);
            const toHide = filtered.slice(3);
            dom.abstractReferencesList.appendChild(
                createAbstractReferenceColumns(toShow, nextReferenceOrdinal),
            );
            nextReferenceOrdinal += toShow.length;

            if (toHide.length > 0) {
                const hiddenContainer = document.createElement("div");
                hiddenContainer.style.display = "none";
                hiddenContainer.style.marginTop = "4px";
                hiddenContainer.appendChild(
                    createAbstractReferenceColumns(toHide, nextReferenceOrdinal),
                );
                nextReferenceOrdinal += toHide.length;

                const toggleRefsBtn = document.createElement("button");
                toggleRefsBtn.type = "button";
                toggleRefsBtn.className = "ghost";
                toggleRefsBtn.style.padding = "2px 6px";
                toggleRefsBtn.style.fontSize = "0.75rem";
                toggleRefsBtn.style.marginTop = "6px";
                toggleRefsBtn.textContent = `Show more (${toHide.length})`;
                let expanded = false;

                toggleRefsBtn.addEventListener("click", () => {
                    expanded = !expanded;
                    hiddenContainer.style.display = expanded ? "block" : "none";
                    toggleRefsBtn.textContent = expanded ? "Show less" : `Show more (${toHide.length})`;
                });

                dom.abstractReferencesList.appendChild(hiddenContainer);
                dom.abstractReferencesList.appendChild(toggleRefsBtn);
            }
            dom.abstractReferencesSection.style.display = "block";
        }
    }

    // Also scan text for DOIs if autoRefCompile is on (supplemental)
    if (dom.abstractReferencesSection && state.autoRefCompile) {
        invoke("get_article_text_back", { articleId: article.id }).then(text => {
            if (!text) return;
            const matches = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/g) || [];
            const uniqueDois = [...new Set(matches)];
            const ownDoi = normalizeWhitespace(md.doi).toLowerCase();
            const alreadyShown = new Set(getReferenceDois(md).map((d) =>
                normalizeWhitespace(extractDoiFromText(d) || d).toLowerCase(),
            ));
            const refDois = uniqueDois.filter((d) => {
                const clean = normalizeWhitespace(d).toLowerCase();
                return clean && clean !== ownDoi && !alreadyShown.has(clean);
            });
            if (refDois.length > 0) {
                dom.abstractReferencesList.appendChild(
                    createAbstractReferenceColumns(refDois, nextReferenceOrdinal, true),
                );
                nextReferenceOrdinal += refDois.length;
                dom.abstractReferencesSection.style.display = "block";
            }
        }).catch(err => console.warn("Failed to extract backend text:", err));
    }
}

function closeAbstract() {
    dom.abstractModal.classList.add("hidden");
    state.abstractPreviewArticle = null;
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
    card.dataset.articleId = article.id;
    if (state.highlightIncomplete && hasEmptyMetadata(article)) {
        card.classList.add("card-incomplete");
    }
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `Open PDF: ${md.title || article.pdf_filename}`);
    card.addEventListener("click", (evt) => {
        if (!resolveClickAction(evt, article)) {
            evt.preventDefault();
            evt.stopPropagation();
        }
    });
    card.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            openPdf(article);
        }
    });
    card.addEventListener("mouseenter", () => {
        state.hoveredArticleId = article.id;
    });
    card.addEventListener("mouseleave", () => {
        if (state.hoveredArticleId === article.id) state.hoveredArticleId = null;
    });

    // Apply tag tint
    const tint = getCardTint(article);
    if (tint) {
        card.style.borderColor = tint.border;
        card.style.background = `linear-gradient(135deg, ${tint.bg}, transparent 70%)`;
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
            await replaceThumbnailImage(article, file);
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
        row.dataset.articleId = article.id;
        if (state.highlightIncomplete && hasEmptyMetadata(article)) {
            row.classList.add("card-incomplete");
        }

        row.tabIndex = 0;
        const tint = getCardTint(article);
        if (tint) {
            row.style.backgroundColor = tint.bg;
            row.style.borderLeft = `3px solid ${tint.border}`;
        }

        row.addEventListener("click", (evt) => {
            if (!resolveClickAction(evt, article)) {
                evt.preventDefault();
                evt.stopPropagation();
            }
        });
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
        row.addEventListener("mouseenter", () => {
            state.hoveredArticleId = article.id;
        });
        row.addEventListener("mouseleave", () => {
            if (state.hoveredArticleId === article.id) state.hoveredArticleId = null;
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
    state.hoveredArticleId = null;
    clearNode(dom.grid);
    dom.grid.classList.toggle("details-mode", state.viewMode === "details");

    const visibleArticles = getVisibleSortedArticles();

    if (visibleArticles.length === 0 && !state.query && state.tags.length === 0) {
        dom.emptyState.classList.remove("hidden");
        return;
    } else {
        dom.emptyState.classList.add("hidden");
    }

    const sortedArticles = visibleArticles;
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

    const optionNames = options.map((tagRow) => tagRow.name);
    const existingNames = Array.from(dom.tagFilterList.querySelectorAll("input[type='checkbox']"))
        .map((cb) => cb.value);
    const needsRebuild = dom.tagFilterList.children.length === 0
        || existingNames.length !== optionNames.length
        || existingNames.some((name, index) => name !== optionNames[index]);

    if (needsRebuild) {
        clearNode(dom.tagFilterList);
        options.forEach((tagRow) => {
            const row = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.value = tagRow.name;
            cb.checked = state.tags.includes(tagRow.name);

            cb.addEventListener("change", (evt) => {
                evt.stopPropagation();
                if (cb.checked) {
                    if (!state.tags.includes(tagRow.name)) state.tags.push(tagRow.name);
                } else {
                    state.tags = state.tags.filter(t => t !== tagRow.name);
                }
                updateTagFilterUI();
                loadArticles();
            });

            row.addEventListener("click", (evt) => {
                evt.stopPropagation();
            });

            const span = document.createElement("span");
            span.className = "tag-count-span";
            span.textContent = `${tagRow.name} (${tagRow.count})`;

            row.appendChild(cb);
            row.appendChild(span);
            dom.tagFilterList.appendChild(row);
        });
    } else {
        const labels = Array.from(dom.tagFilterList.querySelectorAll("label"));
        const optionsMap = new Map();
        options.forEach(o => optionsMap.set(o.name, o.count));

        labels.forEach(row => {
            const cb = row.querySelector("input[type='checkbox']");
            const span = row.querySelector(".tag-count-span");
            if (!cb || !span) return;
            cb.checked = state.tags.includes(cb.value);
            const count = optionsMap.get(cb.value) || 0;
            span.textContent = `${cb.value} (${count})`;
        });
    }

    updateTagFilterUI();
}

function updateTagFilterUI() {
    dom.tagFilterCount.textContent = state.tags.length;
    if (state.tags.length === 0) {
        dom.tagFilterBtn.textContent = "All tags (0)";
    } else if (state.tags.length === 1) {
        dom.tagFilterBtn.textContent = `${state.tags[0]} (1)`;
    } else {
        dom.tagFilterBtn.textContent = `Multiple (${state.tags.length})`;
    }
}

function persistDemoModePreference(enabled) {
    state.demoMode = Boolean(enabled);
    window.localStorage.setItem(DEMO_MODE_KEY, state.demoMode ? "true" : "false");
    if (dom.demoModeCheckbox) {
        dom.demoModeCheckbox.checked = state.demoMode;
    }
}

async function reloadLibraryForStorageSwitch() {
    closeEditor();
    closeAbstract();
    stopThumbnailUndoPrompt();
    thumbCache.clear();
    state.current = null;
    state.abstractPreviewArticle = null;
    state.hoveredArticleId = null;
    state.query = "";
    state.tags = [];
    if (dom.searchInput) dom.searchInput.value = "";
    clearNode(dom.tagFilterList);
    updateTagFilterUI();
    await Promise.all([loadTags(), loadArticles()]);
}

async function setDemoModeEnabled(enabled, { startup = false } = {}) {
    const nextMode = Boolean(enabled);
    const previousMode = startup ? false : Boolean(state.demoMode);
    if (startup && !nextMode) return true;
    if (!startup && nextMode === previousMode) return true;

    if (!nextMode && !startup) {
        const confirmed = window.confirm(
            "Turning off demo mode will permanently delete the demo articles, metadata, thumbnails, and backups created while demo mode was active. Continue?",
        );
        if (!confirmed) {
            if (dom.demoModeCheckbox) dom.demoModeCheckbox.checked = previousMode;
            return false;
        }
    }

    setFilesMenuOpen(false);
    setStatus(nextMode ? "Enabling demo mode..." : "Exiting demo mode...");

    try {
        await invoke("set_demo_mode", {
            enabled: nextMode,
            clearDemoData: !nextMode,
        });
    } catch (err) {
        persistDemoModePreference(previousMode);
        if (dom.demoModeCheckbox) dom.demoModeCheckbox.checked = previousMode;
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to switch demo mode: ${message}`, true);
        return false;
    }

    persistDemoModePreference(nextMode);

    if (!startup) {
        try {
            await reloadLibraryForStorageSwitch();
        } catch (err) {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Demo mode switched, but reload failed: ${message}`, true);
            return false;
        }
        showToast(nextMode ? "Demo mode enabled" : "Demo data deleted");
    }

    return true;
}

async function loadArticles() {
    setStatus("Loading articles...");
    debugLog(`Loading articles (query="${state.query}", tags=${state.tags.length}, mode=${state.tagFilterMode}).`);
    const res = await invoke("get_articles", {
        query: state.query || null,
        tags: state.tags.length > 0 ? state.tags : null,
        matchMode: state.tagFilterMode,
        filterIncomplete: state.filterIncomplete,
        limit: 500,
        offset: 0,
    });
    state.articles = res.articles || [];
    state.total = res.total || 0;
    state.generatedAt = res.generated_at || "";
    state.strategy = res.thumbnail_strategy || state.strategy;
    if (dom.strategySelect) dom.strategySelect.value = state.strategy;

    renderArticles();
    if (state.showDupeWarnings) checkDuplicates();
    const stamped = prettyDate(state.generatedAt);
    const suffix = stamped ? ` | indexed ${stamped}` : "";
    const prefix = state.demoMode ? "Demo mode | " : "";
    setStatus(`${prefix}${state.total} article(s)${suffix}`);
    debugLog(`Loaded ${state.total} article(s); generated_at=${state.generatedAt || "n/a"}.`);
}

function openEditor(article) {
    state.current = article;
    debugLog(`Opened metadata editor for article ${article.id}.`);
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
    if (dom.thumbFile) dom.thumbFile.value = "";
    dom.modalThumbWrap.classList.remove("drag-active");
}

async function saveMetadata(evt) {
    if (evt && typeof evt.preventDefault === "function") evt.preventDefault();
    if (!state.current) return;
    const currentId = state.current.id;
    const abstractValue = dom.abstract.value.replace(/\r\n/g, "\n");
    const notesValue = dom.notes.value.replace(/\r\n/g, "\n");
    const trigger = evt?.type || "manual";
    const refDois = getReferenceDois(state.current?.metadata);

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
        ref_dois: refDois,
    };

    setStatus("Saving metadata...");
    debugLog(`Saving metadata for article ${currentId} (trigger=${trigger}, ref_dois=${refDois.length}).`);
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

        if (state.current?.id === currentId && !dom.modal.classList.contains("hidden")) {
            state.current = savedArticle;
        }
        renderArticles();

        await loadTags();
        setStatus("Metadata saved.");
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Save failed: ${message}`, true);
    }
}

async function copyRawToClipboard(text) {
    const raw = String(text || "");
    if (!raw.trim()) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        try {
            await navigator.clipboard.writeText(raw);
            return true;
        } catch { }
    }
    try {
        const area = document.createElement("textarea");
        area.value = raw;
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

function isMetadataEditableField(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (!dom.form || !dom.form.contains(element)) return false;
    if (element.matches("textarea, select")) return true;
    if (!element.matches("input")) return element.isContentEditable;

    const inputType = (element.getAttribute("type") || "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "file", "hidden"].includes(inputType);
}

async function persistReferenceDois(articleId, refDois) {
    if (!articleId) return;
    const safeDois = Array.isArray(refDois)
        ? refDois.map((d) => String(d || "").trim()).filter(Boolean)
        : [];
    try {
        const result = await invoke("save_metadata", {
            articleId,
            payload: { ref_dois: safeDois },
        });
        const savedArticle = result?.article || null;
        if (!savedArticle) return;

        const idx = state.articles.findIndex((a) => a.id === articleId);
        if (idx >= 0) state.articles[idx] = savedArticle;
        if (state.current?.id === articleId) state.current = savedArticle;
        debugLog(`Persisted ${safeDois.length} reference DOI item(s) for article ${articleId}.`);
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Could not persist reference DOIs: ${message}`, true);
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

async function readClipboardImageAsFile() {
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
    if (!imageBlob) return null;
    return new File([imageBlob], "clipboard-image.png", { type: imageBlob.type });
}

async function uploadThumbnailForArticle(article, file) {
    if (!article) return;
    await replaceThumbnailImage(article, file);
}

async function pasteClipboardThumbnailToArticle(article) {
    if (!article) return;
    try {
        const file = await readClipboardImageAsFile();
        if (!file) {
            setStatus("No image found in clipboard.", true);
            return;
        }
        if (!isImageFile(file)) {
            setStatus("Clipboard content is not an image.", true);
            return;
        }
        setStatus(`Updating thumbnail for "${article.metadata?.title || article.pdf_filename}"...`);
        await uploadThumbnailForArticle(article, file);
        setStatus("Thumbnail updated from clipboard.");
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Clipboard paste failed: ${message}`, true);
    }
}

async function uploadManualThumbnail(file) {
    if (!state.current) return;
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
        await replaceThumbnailImage(state.current, file);
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
    const strategy = dom.strategySelect?.value || state.strategy || "hybrid";
    const fast = !dom.parsePdfs.checked;
    setFilesMenuOpen(false);
    setStatus(`Reindexing with ${strategy} strategy${fast ? " (fast mode)" : ""}...`);
    debugLog(`Reindex requested (strategy=${strategy}, fast=${fast}).`);
    dom.reindexBtn.disabled = true;
    try {
        await invoke("reindex", { strategy, fast });
        thumbCache.clear();
        await Promise.all([loadTags(), loadArticles()]);
        setStatus("Reindex complete.");
        debugLog("Reindex completed successfully.");
        if (state.articles.length > 0) {
            checkDuplicates();
        }
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Reindex failed: ${message}`, true);
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
                    await invoke("remove_article", { articleId: article.id });
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

    dom.duplicateModal.classList.remove("hidden");
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
    state.wellnessTipIndex = normalizeTipIndex(state.wellnessTipIndex);
    state.abstractSectionCount = clampAbstractSectionCount(state.abstractSectionCount);
    state.nightFilterMode = normalizeNightFilterMode(state.nightFilterMode);
    state.nightFilterStrength = clampNightFilterStrength(state.nightFilterStrength);
    dom.viewModeToggle.checked = state.viewMode === "details";
    dom.primarySort.value = state.primarySort;
    dom.secondarySort.value = state.secondarySort;
    applyCardHeight(state.cardHeight);
    applyCardWidth(state.cardWidth);
    applyCardFont(state.cardFont);
    applyModalBackdropDarkness(state.modalBackdropDarkness);
    applySurfaceOpacity(state.surfaceOpacity);
    applyFontFamily(state.fontFamily);
    applyNightFilter(state.nightFilterMode, state.nightFilterStrength);
    applyAbstractSectionCount(state.abstractSectionCount);
    setDisplayMenuOpen(false);
    setFilesMenuOpen(false);
    wireSliderToggles(dom.displayMenu);
    wireSliderToggles(dom.filesMenu);

    dom.searchInput.addEventListener("input", debouncedSearch);
    if (dom.thumbnailUndo) {
        dom.thumbnailUndo.addEventListener("mouseenter", () => {
            if (state.thumbnailUndo) state.thumbnailUndo.paused = true;
        });
        dom.thumbnailUndo.addEventListener("mouseleave", () => {
            if (state.thumbnailUndo) {
                state.thumbnailUndo.paused = false;
                state.thumbnailUndo.lastTick = performance.now();
            }
        });
    }
    if (dom.thumbnailUndoBtn) {
        dom.thumbnailUndoBtn.addEventListener("click", undoThumbnailReplacement);
    }

    const tagMatchRadios = document.querySelectorAll('input[name="tag-match-mode"]');
    const tmAnyLbl = document.getElementById("tm-any-lbl");
    const tmAllLbl = document.getElementById("tm-all-lbl");
    const tmNoneLbl = document.getElementById("tm-none-lbl");

    function updateTagMatchUI(mode) {
        if (mode === "all") {
            if (tmAllLbl) { tmAllLbl.style.background = "var(--accent)"; tmAllLbl.style.color = "white"; }
            if (tmAnyLbl) { tmAnyLbl.style.background = "var(--bg)"; tmAnyLbl.style.color = "var(--text)"; }
            if (tmNoneLbl) { tmNoneLbl.style.background = "var(--bg)"; tmNoneLbl.style.color = "var(--text)"; }
        } else if (mode === "none") {
            if (tmNoneLbl) { tmNoneLbl.style.background = "var(--accent)"; tmNoneLbl.style.color = "white"; }
            if (tmAnyLbl) { tmAnyLbl.style.background = "var(--bg)"; tmAnyLbl.style.color = "var(--text)"; }
            if (tmAllLbl) { tmAllLbl.style.background = "var(--bg)"; tmAllLbl.style.color = "var(--text)"; }
        } else {
            if (tmAnyLbl) { tmAnyLbl.style.background = "var(--accent)"; tmAnyLbl.style.color = "white"; }
            if (tmAllLbl) { tmAllLbl.style.background = "var(--bg)"; tmAllLbl.style.color = "var(--text)"; }
            if (tmNoneLbl) { tmNoneLbl.style.background = "var(--bg)"; tmNoneLbl.style.color = "var(--text)"; }
        }
    }

    if (tagMatchRadios.length > 0) {
        const initialMode = ["all", "none"].includes(state.tagFilterMode) ? state.tagFilterMode : "any";
        tagMatchRadios.forEach(r => {
            r.checked = r.value === initialMode;
            r.addEventListener("change", (e) => {
                if (e.target.checked) {
                    state.tagFilterMode = e.target.value;
                    window.localStorage.setItem("article-tag-mode", state.tagFilterMode);
                    updateTagMatchUI(state.tagFilterMode);
                    loadArticles();
                }
            });
        });
        updateTagMatchUI(initialMode);
    }

    if (dom.autoRefCompile) {
        dom.autoRefCompile.checked = state.autoRefCompile;
        dom.autoRefCompile.addEventListener("change", () => {
            state.autoRefCompile = dom.autoRefCompile.checked;
            window.localStorage.setItem("article-auto-ref", state.autoRefCompile ? "true" : "false");
        });
    }

    if (dom.filterIncomplete) {
        dom.filterIncomplete.checked = state.filterIncomplete;
        dom.filterIncomplete.addEventListener("change", () => {
            state.filterIncomplete = dom.filterIncomplete.checked;
            window.localStorage.setItem("article-filter-incomplete", state.filterIncomplete ? "true" : "false");
            loadArticles();
        });
    }

    // Theme selector
    if (dom.themeSelect) {
        applyTheme(state.theme);
        dom.themeSelect.addEventListener("change", () => {
            applyTheme(dom.themeSelect.value);
            window.localStorage.setItem("article-theme", state.theme);
        });
    }

    // Experimental section — animate the arrow on open/close
    if (dom.experimentalSection && dom.experimentalArrow) {
        dom.experimentalSection.addEventListener("toggle", () => {
            dom.experimentalArrow.style.transform = dom.experimentalSection.open ? "rotate(90deg)" : "";
        });
    }

    // Duplicate DOI warnings experimental toggle
    if (dom.showDupeWarnings) {
        dom.showDupeWarnings.checked = state.showDupeWarnings;
        dom.showDupeWarnings.addEventListener("change", () => {
            state.showDupeWarnings = dom.showDupeWarnings.checked;
            window.localStorage.setItem("article-dupe-warnings", state.showDupeWarnings ? "true" : "false");
        });
    }

    if (dom.debugModeCheckbox) {
        dom.debugModeCheckbox.checked = state.debugMode;
        dom.debugModeCheckbox.addEventListener("change", () => {
            state.debugMode = dom.debugModeCheckbox.checked;
            window.localStorage.setItem("article-debug-mode", state.debugMode ? "true" : "false");
            debugLog(`Debug mode ${state.debugMode ? "enabled" : "disabled"}.`);
            if (state.debugMode) setStatus("Debug mode enabled.");
        });
    }

    if (dom.demoModeCheckbox) {
        dom.demoModeCheckbox.checked = state.demoMode;
        dom.demoModeCheckbox.addEventListener("change", async () => {
            const wantsDemoMode = dom.demoModeCheckbox.checked;
            dom.demoModeCheckbox.disabled = true;
            try {
                await setDemoModeEnabled(wantsDemoMode);
            } finally {
                dom.demoModeCheckbox.disabled = false;
            }
        });
    }

    if (dom.storageReportBtn && dom.storageReportContent) {
        dom.storageReportBtn.addEventListener("click", async () => {
            const isShown = dom.storageReportContent.style.display !== "none";
            if (isShown) {
                dom.storageReportContent.style.display = "none";
                dom.storageReportBtn.textContent = "Show Storage Report";
                return;
            }

            dom.storageReportContent.style.display = "block";
            dom.storageReportBtn.textContent = "Hide Storage Report";
            dom.storageReportContent.textContent = "Loading storage report...";

            try {
                const report = await invoke("get_storage_report");
                dom.storageReportContent.textContent = formatStorageReport(report);
            } catch (err) {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                dom.storageReportContent.textContent = `Failed to load storage report: ${message}`;
            }
        });
    }

    // Crash log viewer
    if (dom.crashLogBtn && dom.crashLogContent) {
        dom.crashLogBtn.addEventListener("click", async () => {
            const isShown = dom.crashLogContent.style.display !== "none";
            if (isShown) {
                dom.crashLogContent.style.display = "none";
                dom.crashLogBtn.textContent = "View Crash Log";
            } else {
                dom.crashLogContent.style.display = "block";
                dom.crashLogBtn.textContent = "Hide Crash Log";
                dom.crashLogContent.textContent = "Loading...";
                try {
                    const log = await invoke("get_crash_log");
                    dom.crashLogContent.textContent = log || "No entries.";
                } catch (e) {
                    dom.crashLogContent.textContent = "Failed to read crash log.";
                }
            }
        });
    }

    // Show reference DOIs toggle
    if (dom.showRefDoisCheckbox) {
        dom.showRefDoisCheckbox.checked = state.showRefDois;
        dom.showRefDoisCheckbox.addEventListener("change", () => {
            state.showRefDois = dom.showRefDoisCheckbox.checked;
            window.localStorage.setItem(SHOW_REF_DOIS_KEY, state.showRefDois ? "true" : "false");
            window.localStorage.setItem(SHOW_REF_DOIS_PREF_TOUCHED_KEY, "true");
        });
    }

    if (dom.abstractSectionCountInput) {
        dom.abstractSectionCountInput.value = String(state.abstractSectionCount);
        const commitSectionCount = () => {
            applyAbstractSectionCount(dom.abstractSectionCountInput.value);
            window.localStorage.setItem("article-abstract-sections", String(state.abstractSectionCount));
            debugLog(`Abstract partitioning strength set to ${state.abstractSectionCount}.`);
        };
        dom.abstractSectionCountInput.addEventListener("input", commitSectionCount);
        dom.abstractSectionCountInput.addEventListener("change", commitSectionCount);
        dom.abstractSectionCountInput.addEventListener("blur", commitSectionCount);
    }

    // Niche tags chip input
    if (dom.nicheTagChipContainer && dom.nicheTagsInput) {
        dom.nicheTagsInput.value = "";
        setNicheTagChips(state.nicheTags);
        const commitNicheInput = () => {
            const value = normalizeNicheTag(dom.nicheTagsInput.value);
            if (!value) return;
            addNicheTagChip(value);
            dom.nicheTagsInput.value = "";
        };
        dom.nicheTagsInput.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter" || evt.key === ",") {
                evt.preventDefault();
                commitNicheInput();
                return;
            }
            if (evt.key === "Backspace" && dom.nicheTagsInput.value === "") {
                const chips = dom.nicheTagChipContainer.querySelectorAll(".niche-tag-chip");
                if (chips.length > 0) {
                    chips[chips.length - 1].remove();
                    persistNicheTags();
                }
            }
        });
        dom.nicheTagsInput.addEventListener("blur", commitNicheInput);
        dom.nicheTagChipContainer.addEventListener("click", () => dom.nicheTagsInput.focus());
    }

    if (dom.enableNicheCheckbox) {
        dom.enableNicheCheckbox.checked = state.enableNiche;
        dom.enableNicheCheckbox.addEventListener("change", () => {
            state.enableNiche = dom.enableNicheCheckbox.checked;
            window.localStorage.setItem(ENABLE_NICHE_KEY, state.enableNiche ? "true" : "false");
            updateNicheUiVisibility();
            renderArticles();
        });
    }

    if (dom.showNicheCheckbox) {
        dom.showNicheCheckbox.checked = state.showNiche;
        dom.showNicheCheckbox.addEventListener("change", () => {
            state.showNiche = dom.showNicheCheckbox.checked;
            window.localStorage.setItem(SHOW_NICHE_KEY, state.showNiche ? "true" : "false");
            renderArticles();
        });
    }
    updateNicheUiVisibility();

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
        const cleaned = cleanAbstract(text, state.abstractSectionCount);
        document.execCommand("insertText", false, cleaned);
        showToast("Abstract cleaned from PDF paste");
    });
    if (dom.abstractCleanBtn) {
        dom.abstractCleanBtn.addEventListener("click", async (evt) => {
            evt.preventDefault();
            const currentText = dom.abstract.value || "";
            if (!currentText.trim()) {
                showToast("No abstract text to clean");
                return;
            }
            const cleaned = cleanAbstract(currentText, state.abstractSectionCount);
            if (cleaned === currentText) {
                showToast("Abstract already looks clean");
                return;
            }
            dom.abstract.value = cleaned;
            showToast("Abstract cleaned");
            if (state.current && !dom.modal.classList.contains("hidden")) {
                await saveMetadata({ type: "clean-abstract-click" });
            }
        });
    }

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

                const btnContainer = document.createElement("div");
                btnContainer.style.display = "flex";
                btnContainer.style.gap = "4px";
                btnContainer.style.marginLeft = "auto";

                const btnCopy = document.createElement("button");
                btnCopy.type = "button";
                btnCopy.className = "ghost";
                btnCopy.style.padding = "2px 6px";
                btnCopy.style.fontSize = "0.75rem";
                btnCopy.textContent = "Copy";
                btnCopy.title = "Copy hex value";
                btnCopy.addEventListener("click", () => {
                    navigator.clipboard.writeText(picker.value).then(() => {
                        showToast("Color copied to clipboard!");
                    }).catch(() => {
                        showToast("Failed to copy color.");
                    });
                });

                const btnReset = document.createElement("button");
                btnReset.type = "button";
                btnReset.className = "ghost";
                btnReset.style.padding = "2px 6px";
                btnReset.style.fontSize = "0.75rem";
                btnReset.style.color = "var(--danger)";
                btnReset.textContent = "Reset";
                btnReset.title = "Reset to default color";
                btnReset.addEventListener("click", () => {
                    picker.value = "#1a3145";
                    delete state.tagColors[tag]; // Remove from state
                    saveTagColors();
                    renderArticles();
                });

                btnContainer.appendChild(btnCopy);
                btnContainer.appendChild(btnReset);

                row.appendChild(picker);
                row.appendChild(label);
                row.appendChild(btnContainer);
                dom.tagColorList.appendChild(row);
            }
        }
        dom.tagColorEditor.classList.remove("hidden");
    });
    dom.tagColorClose.addEventListener("click", () => {
        dom.tagColorEditor.classList.add("hidden");
    });

    // Reset All Tag Colors
    const resetAllBtn = document.getElementById("tag-color-reset-all");
    if (resetAllBtn) {
        resetAllBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to reset all tag colors to the default?")) {
                state.tagColors = {};
                saveTagColors();
                renderArticles();
                dom.editTagColorsBtn.click(); // re-render the list
                showToast("All custom tag colors have been reset.");
            }
        });
    }

    // Backups
    let backupTimer = null;
    let nextBackupTime = Date.now() + 600000;

    function scheduleBackup() {
        clearInterval(backupTimer);
        nextBackupTime = Date.now() + 600000;
        backupTimer = setInterval(async () => {
            try {
                await invoke("create_backup");
                nextBackupTime = Date.now() + 600000;
                console.log("Automatic backup created.");
                if (dom.backupModal && !dom.backupModal.classList.contains("hidden")) {
                    loadBackupOptions(); // refresh modal if open
                }
            } catch (err) {
                console.error("Backup failed:", err);
            }
        }, 600000); // 10 minutes
    }

    // Start interval
    scheduleBackup();

    dom.restoreBackupBtn.addEventListener("click", () => {
        setFilesMenuOpen(false);
        loadBackupOptions();
        dom.backupModal.classList.remove("hidden");
    });

    dom.backupClose.addEventListener("click", () => {
        dom.backupModal.classList.add("hidden");
        dom.backupStatus.style.display = "none";
    });

    async function loadBackupOptions() {
        clearNode(dom.backupOptions);
        try {
            const res = await invoke("get_backups");
            const backups = res.backups || [];
            if (backups.length === 0 || backups.every(b => !b.timestamp)) {
                dom.backupOptions.innerHTML = `<p class="meta">No backups available yet.</p>`;
                return;
            }

            for (const b of backups) {
                if (!b.timestamp) continue;
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "ghost";
                btn.style.textAlign = "left";
                btn.style.justifyContent = "space-between";
                btn.style.display = "flex";

                const timeStr = prettyDate(b.timestamp);
                btn.innerHTML = `<span>Restore <strong>${b.name}</strong></span> <span class="meta">${timeStr}</span>`;

                btn.addEventListener("click", async () => {
                    if (!window.confirm(`Are you sure you want to restore the backup from ${timeStr}? This will overwrite your current library.`)) {
                        return;
                    }
                    dom.backupStatus.style.display = "block";
                    dom.backupStatus.textContent = `Restoring ${b.name}...`;
                    try {
                        await invoke("restore_backup", { backupName: b.name });
                        dom.backupStatus.textContent = `Successfully restored. Reloading library...`;
                        setTimeout(async () => {
                            await loadTags();
                            await loadArticles();
                            dom.backupModal.classList.add("hidden");
                            dom.backupStatus.style.display = "none";
                            showToast("Library restored from backup.");
                        }, 1000);
                    } catch (err) {
                        dom.backupStatus.style.color = "var(--danger)";
                        dom.backupStatus.textContent = `Failed to restore: ${err}`;
                    }
                });
                dom.backupOptions.appendChild(btn);
            }

            // Also show time until next scheduled backup
            const minutesLeft = Math.max(0, Math.ceil((nextBackupTime - Date.now()) / 60000));
            const nextInfo = document.createElement("p");
            nextInfo.className = "meta";
            nextInfo.style.marginTop = "10px";
            nextInfo.textContent = `Next automatic backup in ~${minutesLeft} minute(s).`;
            dom.backupOptions.appendChild(nextInfo);

        } catch (err) {
            dom.backupOptions.innerHTML = `<p class="meta" style="color:var(--danger)">Failed to fetch backups.</p>`;
        }
    }

    // Hotkeys modal
    dom.hotkeysBtn.addEventListener("click", () => {
        dom.hotkeysModal.classList.remove("hidden");
        dom.hotkeysModal.querySelector(".modal-card").classList.add("starry-bg");
        buildHotkeyTable();
        nextWellnessTip();
    });
    const closeHotkeys = () => {
        dom.hotkeysModal.classList.add("hidden");
        dom.hotkeysModal.querySelector(".modal-card").classList.remove("starry-bg");
    };
    dom.hotkeysClose.addEventListener("click", closeHotkeys);
    if (dom.hotkeyTipNext) {
        dom.hotkeyTipNext.addEventListener("click", () => {
            nextWellnessTip();
        });
    }
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
    dom.displayMenuToggle.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        setDisplayMenuOpen(!state.displayMenuOpen);
    });
    dom.filesMenuToggle.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        setFilesMenuOpen(!state.filesMenuOpen);
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

    dom.cardWidthSlider.addEventListener("input", () => {
        applyCardWidth(dom.cardWidthSlider.value);
        window.localStorage.setItem("article-card-width", String(state.cardWidth));
    });
    dom.cardFontSlider.addEventListener("input", () => {
        applyCardFont(dom.cardFontSlider.value);
        window.localStorage.setItem("article-card-font", String(state.cardFont));
    });
    if (dom.modalBackdropSlider) {
        dom.modalBackdropSlider.addEventListener("input", () => {
            applyModalBackdropDarkness(dom.modalBackdropSlider.value);
            window.localStorage.setItem("article-modal-backdrop-darkness", String(state.modalBackdropDarkness));
        });
    }
    if (dom.surfaceOpacitySlider) {
        dom.surfaceOpacitySlider.addEventListener("input", () => {
            applySurfaceOpacity(dom.surfaceOpacitySlider.value);
            window.localStorage.setItem("article-surface-opacity", String(state.surfaceOpacity));
        });
    }
    if (dom.nightFilterMode) {
        dom.nightFilterMode.value = state.nightFilterMode;
        dom.nightFilterMode.addEventListener("change", () => {
            applyNightFilter(dom.nightFilterMode.value, state.nightFilterStrength);
            window.localStorage.setItem("article-night-filter-mode", state.nightFilterMode);
        });
    }
    if (dom.nightFilterStrengthSlider) {
        const commitNightStrength = () => {
            applyNightFilter(state.nightFilterMode, dom.nightFilterStrengthSlider.value);
            window.localStorage.setItem("article-night-filter-strength", String(state.nightFilterStrength));
        };
        dom.nightFilterStrengthSlider.addEventListener("input", commitNightStrength);
        dom.nightFilterStrengthSlider.addEventListener("change", commitNightStrength);
        dom.nightFilterStrengthSlider.addEventListener("blur", commitNightStrength);
    }
    // Tag Filter Custom Dropdown
    dom.tagFilterBtn.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        dom.tagFilterMenu.classList.toggle("hidden");
    });

    dom.tagFilterAll.addEventListener("click", () => {
        const cbs = dom.tagFilterList.querySelectorAll("input[type='checkbox']");
        state.tags = [];
        cbs.forEach(cb => {
            cb.checked = true;
            state.tags.push(cb.value);
        });
        updateTagFilterUI();
        loadArticles();
    });

    dom.tagFilterNone.addEventListener("click", () => {
        const cbs = dom.tagFilterList.querySelectorAll("input[type='checkbox']");
        cbs.forEach(cb => cb.checked = false);
        state.tags = [];
        updateTagFilterUI();
        loadArticles();
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (evt) => {
        if (!dom.tagFilterContainer.contains(evt.target)) {
            dom.tagFilterMenu.classList.add("hidden");
        }
    });

    // Prevent clicks inside the menu from bubbling up to document
    dom.tagFilterMenu.addEventListener("click", (evt) => {
        evt.stopPropagation();
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
    if (dom.abstractTitle) {
        dom.abstractTitle.addEventListener("click", () => {
            if (state.abstractPreviewArticle) {
                openPdf(state.abstractPreviewArticle);
            }
        });
    }
    dom.form.addEventListener("submit", saveMetadata);
    dom.metaRemove.addEventListener("click", async () => {
        if (!state.current) return;
        const md = state.current.metadata || {};
        const title = md.title || state.current.pdf_filename;
        if (!confirm(`Are you sure you want to permanently remove "${title}"? This will delete the PDF file and cannot be undone.`)) {
            return;
        }
        setStatus("Removing article...");
        try {
            await invoke("remove_article", { articleId: state.current.id });
            closeEditor();
            const thumbPath = articleThumbPath(state.current);
            if (thumbPath) thumbCache.delete(thumbPath);
            await Promise.all([loadTags(), loadArticles()]);
            setStatus("Article removed.");
        } catch (err) {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Failed to remove article: ${message}`, true);
        }
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
    if (dom.thumbReset) {
        dom.thumbReset.addEventListener("click", resetAutoThumbnail);
    }

    if (dom.editorOpenBtn) {
        dom.editorOpenBtn.addEventListener("click", () => {
            if (state.current) openPdf(state.current);
        });
    }
    if (dom.editorLocateBtn) {
        dom.editorLocateBtn.addEventListener("click", () => {
            if (state.current) openFileLocation(state.current);
        });
    }

    // DOI Fetch button in modal
    dom.doiFetchBtn.addEventListener("click", async () => {
        let doiStr = dom.doi.value.trim();
        const originalText = dom.doiFetchBtn.textContent;
        dom.doiFetchBtn.textContent = "Fetching...";
        dom.doiFetchBtn.disabled = true;

        if (!doiStr) {
            try {
                const text = await invoke("get_article_text_front", { articleId: state.current.id });
                const match = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
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
                alert(`Failed to extract text from PDF: ${err}`);
                dom.doiFetchBtn.textContent = originalText;
                dom.doiFetchBtn.disabled = false;
                return;
            }
        }

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
            if (meta.doi) dom.doi.value = meta.doi;
            // Store ref DOIs on the current article's metadata in memory
            if (state.current) {
                const fetchedRefDois = getReferenceDois(meta);
                state.current.metadata.ref_dois = fetchedRefDois;
                await persistReferenceDois(state.current.id, fetchedRefDois);
            }

            debugLog(`Crossref metadata fetched for DOI ${doiStr}.`);
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
            const file = await readClipboardImageAsFile();
            if (!file) {
                setStatus("No image found in clipboard.", true);
                return;
            }
            previewSelectedThumb(file);
            await uploadManualThumbnail(file);
        } catch (err) {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Clipboard paste failed: ${message}`, true);
        }
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
            let lastImportedArticle = null;
            for (const pdf of pdfs) {
                const base64Data = await fileToBase64(pdf);
                const res = await invoke("import_pdf", {
                    filename: pdf.name,
                    data: base64Data,
                });
                if (res && res.article) {
                    lastImportedArticle = res.article;
                }
            }
            dom.emptyFileInput.value = "";
            await loadTags();
            await loadArticles();
            setStatus(`Imported ${pdfs.length} PDF(s).`);
            if (pdfs.length === 1 && lastImportedArticle) {
                const newArticle = state.articles.find(a => a.id === lastImportedArticle.id);
                if (newArticle) openEditor(newArticle);
            }
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
                const importedList = await invoke("import_pdfs_from_paths", { paths: pdfPaths });
                await loadTags();
                await loadArticles();
                setStatus(`Imported ${pdfPaths.length} PDF(s).`);
                if (importedList && importedList.length === 1 && importedList[0].article) {
                    const newArticleId = importedList[0].article.id;
                    const newArticle = state.articles.find(a => a.id === newArticleId);
                    if (newArticle) {
                        openEditor(newArticle);
                    }
                }
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
        let lastImportedArticle = null;

        // Since we are uploading data blobs instead of paths, we iterate sequentially here on the frontend.
        for (let i = 0; i < pdfs.length; i++) {
            const pdf = pdfs[i];
            try {
                setStatus(`Importing (${i + 1}/${pdfs.length}) ${pdf.name}...`);
                const base64Data = await fileToBase64(pdf);
                const res = await invoke("import_pdf", {
                    filename: pdf.name,
                    data: base64Data,
                });
                if (res && res.article) {
                    lastImportedArticle = res.article;
                }
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
            if (pdfs.length === 1 && lastImportedArticle) {
                const newArticle = state.articles.find(a => a.id === lastImportedArticle.id);
                if (newArticle) openEditor(newArticle);
            }
        }
    });

    document.addEventListener("click", (evt) => {
        if (state.displayMenuOpen && !dom.settingsWrapDisplay.contains(evt.target)) {
            setDisplayMenuOpen(false);
        }
        if (state.filesMenuOpen && !dom.settingsWrapFiles.contains(evt.target)) {
            setFilesMenuOpen(false);
        }
    });

    if (dom.duplicateClose) {
        dom.duplicateClose.addEventListener("click", () => dom.duplicateModal.classList.add("hidden"));
    }

    // Mousedown on modal backdrops to close
    [dom.modal, dom.abstractModal, dom.tagColorEditor, dom.hotkeysModal, dom.duplicateModal].forEach((modalEl) => {
        if (!modalEl) return;
        modalEl.addEventListener("mousedown", (evt) => {
            if (evt.target === modalEl) {
                modalEl.classList.add("hidden");
            }
        });
    });

    function handleModalKeyboardNavigation(evt) {
        const metadataOpen = !dom.modal.classList.contains("hidden");
        const abstractOpen = !dom.abstractModal.classList.contains("hidden");
        if (!metadataOpen && !abstractOpen) return false;

        // Preserve normal caret/navigation behavior while actively editing metadata fields.
        if (metadataOpen && isMetadataEditableField(evt.target)) return false;

        const activeArticle = metadataOpen ? state.current : state.abstractPreviewArticle;
        if (!activeArticle?.id) return false;

        const isToggleShortcut = matchesKeyboardShortcut(evt, "arrowToggle");
        const isPrevShortcut = matchesKeyboardShortcut(evt, "prevArticle");
        const isNextShortcut = matchesKeyboardShortcut(evt, "nextArticle");
        if (!isToggleShortcut && !isPrevShortcut && !isNextShortcut) return false;

        const direction = isPrevShortcut ? -1 : 1;
        const targetArticle = isToggleShortcut ? activeArticle : getNeighborArticleById(activeArticle.id, direction);
        if (!targetArticle?.id) return false;

        evt.preventDefault();
        evt.stopPropagation();
        if (state.modalArrowBusy) return true;
        state.modalArrowBusy = true;

        (async () => {
            if (metadataOpen) {
                await saveMetadata({ type: isToggleShortcut ? "arrow-modal-toggle" : "arrow-article-nav" });
            }

            const resolved = resolveArticleById(targetArticle.id) || targetArticle;

            if (isToggleShortcut) {
                if (abstractOpen) {
                    closeAbstract();
                    openEditor(resolved);
                } else {
                    closeEditor();
                    openAbstract(resolved);
                }
                return;
            }

            if (abstractOpen) {
                closeAbstract();
                openAbstract(resolved);
            } else {
                closeEditor();
                openEditor(resolved);
            }
        })()
            .catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Arrow navigation failed: ${message}`, true);
            })
            .finally(() => {
                state.modalArrowBusy = false;
            });
        return true;
    }

    // Keydown for Modal Escape / Search Focus
    document.addEventListener("keydown", (evt) => {
        if (handleModalKeyboardNavigation(evt)) return;

        if (evt.key === "Escape") {
            // Priority: autocomplete -> color editor -> abstract -> duplicate/edit modal -> hotkeys -> backup modal
            if (!dom.tagAutocomplete.classList.contains("hidden")) {
                dom.tagAutocomplete.classList.add("hidden");
                return;
            }
            if (!dom.tagColorEditor.classList.contains("hidden")) {
                dom.tagColorEditor.classList.add("hidden");
                return;
            }
            if (!dom.abstractModal.classList.contains("hidden")) {
                closeAbstract();
                return;
            }
            if (!dom.duplicateModal.classList.contains("hidden")) {
                dom.duplicateModal.classList.add("hidden");
                return;
            }
            if (!dom.modal.classList.contains("hidden")) {
                state.isEscaping = true;
                closeEditor();
                // Reset flag shortly after
                setTimeout(() => { state.isEscaping = false; }, 100);
                return;
            }
            if (!dom.hotkeysModal.classList.contains("hidden")) {
                closeHotkeys();
                return;
            }
            if (!dom.backupModal.classList.contains("hidden")) {
                dom.backupModal.classList.add("hidden");
                return;
            }
            if (state.displayMenuOpen) setDisplayMenuOpen(false);
            if (state.filesMenuOpen) setFilesMenuOpen(false);
        }

        // Ctrl+Tab to toggle hamburger menu or Tab to focus search (if not auto-completing tags)
        if (evt.key === "Tab") {
            if (!dom.modal.classList.contains("hidden")) return;
            if (evt.ctrlKey) {
                evt.preventDefault();
                setDisplayMenuOpen(!state.displayMenuOpen);
            } else if (!dom.tagAutocomplete || dom.tagAutocomplete.classList.contains("hidden")) {
                evt.preventDefault();
                dom.searchInput.focus();
                // if topbar was hidden from auto-hide, trigger its reappearance
                if (dom.topbar && dom.topbar.style.top !== "0px") {
                    document.dispatchEvent(new MouseEvent("mousemove"));
                }
            }
        }

        // Global search shortcut
        if ((evt.ctrlKey || evt.metaKey) && evt.key === "f") {
            evt.preventDefault();
            dom.searchInput.focus();
        }

        if (matchesKeyboardShortcut(evt, "enter") && !dom.modal.classList.contains("hidden")) {
            evt.preventDefault();
            saveMetadata(evt).then(() => closeEditor());
        }
        // "p" to paste thumbnail from clipboard:
        // - in metadata modal: applies to current article
        // - outside modal: applies to hovered card/row article
        if (matchesKeyboardShortcut(evt, "pasteThumb") && !evt.repeat) {
            if (evt.target.tagName !== "INPUT" && evt.target.tagName !== "TEXTAREA" && evt.target.tagName !== "SELECT") {
                if (!dom.modal.classList.contains("hidden")) {
                    evt.preventDefault();
                    dom.thumbPaste.click();
                } else if (state.hoveredArticleId) {
                    const hoveredArticle = state.articles.find((a) => a.id === state.hoveredArticleId) || null;
                    if (hoveredArticle) {
                        evt.preventDefault();
                        pasteClipboardThumbnailToArticle(hoveredArticle);
                    }
                }
            }
        }
    });

    // Auto-save metadata whenever leaving an editable field in the metadata form.
    if (dom.form) {
        dom.form.addEventListener("focusout", (evt) => {
            if (state.isEscaping) return;
            if (!state.current || dom.modal.classList.contains("hidden")) return;
            if (!isMetadataEditableField(evt.target)) return;

            const nextFocused = evt.relatedTarget;
            if (nextFocused instanceof HTMLElement &&
                ((nextFocused.getAttribute("type") || "").toLowerCase() === "submit" ||
                    nextFocused.dataset.skipAutosave === "true")) {
                return;
            }
            saveMetadata(evt);
        });
    }

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
    if (dom.errorLogCopy) {
        dom.errorLogCopy.addEventListener("click", async () => {
            if (!dom.errorLogList) return;
            const lines = Array.from(dom.errorLogList.querySelectorAll("li"))
                .map((li) => li.textContent || "")
                .filter((line) => line.trim().length > 0);
            if (lines.length === 0) {
                showToast("Error log is empty.");
                return;
            }
            const ok = await copyRawToClipboard(lines.join("\n"));
            showToast(ok ? "Error log copied to clipboard" : "Failed to copy error log");
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
        await setDemoModeEnabled(state.demoMode, { startup: true });
        await Promise.all([loadTags(), loadArticles()]);
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to load: ${message}`, true);
    }
}

init();
