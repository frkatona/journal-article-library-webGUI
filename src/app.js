// Tauri IPC bridge
const { invoke } = window.__TAURI__.core;

// Thumbnail cache: relPath -> dataUrl
const thumbCache = new Map();
let metadataSavedBlinkTimeout = null;

const DEFAULT_HOTKEYS = {
    openPdfExternal: { ctrl: false, alt: false, shift: false },  // plain click
    openPdfInternal: { ctrl: false, alt: true, shift: true },  // Alt+Shift+click
    editMetadata: { ctrl: true, alt: false, shift: false },  // Ctrl+click
    openAbstract: { ctrl: false, alt: true, shift: false },  // Alt+click
    copyBibtex: { ctrl: false, alt: false, shift: true },  // Shift+click
    openLocation: { ctrl: true, alt: false, shift: true },  // Ctrl+Shift+click
};
const KEYBOARD_SHORTCUTS_STORAGE_KEY = "article-keyboard-shortcuts";
const DEMO_MODE_KEY = "article-demo-mode";
const DEMO_MODE_PREF_SNAPSHOT_KEY = "article-demo-pref-snapshot-v1";
const THEME_PRESET_STORAGE_KEY = "article-theme-presets";
const DEFAULT_KEYBOARD_SHORTCUTS = {
    pasteThumb: ["P"],
    pdfCopyTool: ["C"],
    pdfThumbnailTool: ["T"],
    enter: ["Ctrl+Enter"],
    prevModal: ["ArrowUp"],
    nextModal: ["ArrowDown"],
    prevArticle: ["ArrowLeft"],
    nextArticle: ["ArrowRight"],
};

const ENABLE_NICHE_KEY = "article-enable-niche";
const SHOW_NICHE_KEY = "article-show-niche";
const SHOW_REF_DOIS_KEY = "article-show-ref-dois";
const SHOW_REF_DOIS_PREF_TOUCHED_KEY = "article-show-ref-dois-pref-touched";
const ABSTRACT_PREVIEW_NOTES_ENABLED_KEY = "article-abstract-preview-notes-enabled";
const NIGHT_FILTER_ENABLED_KEY = "article-night-filter-enabled";
const PDF_COPY_TOOL_ENABLED_KEY = "article-pdf-copy-tool-enabled";
const PDF_TEXT_SELECT_TOOL_ENABLED_KEY = "article-pdf-text-select-tool-enabled";
const PDF_COPY_PREVIEW_ENABLED_KEY = "article-pdf-copy-preview-enabled";
const PDF_COPY_PREVIEW_DURATION_KEY = "article-pdf-copy-preview-duration";
const PDF_CAPTURE_DOWNSCALE_ENABLED_KEY = "article-pdf-capture-downscale-enabled";
const PDF_STARRY_BACKGROUND_ENABLED_KEY = "article-pdf-starry-background-enabled";
const PDF_STARRY_BRIGHTNESS_KEY = "article-pdf-starry-brightness";
const PDF_STARRY_SPEED_KEY = "article-pdf-starry-speed";
const PDF_STARRY_DENSITY_KEY = "article-pdf-starry-density";
const PDF_STARRY_STRAIGHTNESS_KEY = "article-pdf-starry-straightness";
const PDF_VIEWER_WIDTH_UNLOCKED_KEY = "article-pdf-viewer-width-unlocked";
const DEBUG_LOG_RETENTION_KEY = "article-debug-log-retention";
const DEFAULT_PDF_ZOOM_KEY = "article-default-pdf-zoom";
const PDF_VIEWER_STATE_KEY = "article-pdf-viewer-state-v1";
const PDF_TEXT_SELECT_TOOL_MODE = "text-select";
const CROSSREF_ESTIMATED_POLITE_LIMIT_PER_SECOND = 10;
const DOI_RATE_MONITOR_WINDOW_MS = 60_000;
const DOI_RATE_WARNING_THRESHOLD_RATIO = 0.8;
const DOI_RATE_WARNING_MIN_SAMPLE_SIZE = 6;
const DOI_RATE_WARNING_MIN_OBSERVATION_MS = 10_000;
const DOI_RATE_WARNING_COOLDOWN_MS = 20_000;
const PDF_CAPTURE_PRESET_KEYS = new Set(["thumbnail", "square", "tall", "free"]);
const INFINITE_SLIDER_VALUE = 10;
const DEFAULT_PDF_COPY_PREVIEW_DURATION_SETTING = 3;
const DEFAULT_DEBUG_LOG_RETENTION_SETTING = 9;
const AUDIO_ENABLED_KEY = "article-audio-enabled";
const AUDIO_VOLUME_KEY = "article-audio-volume";
const DEFAULT_AUDIO_VOLUME = 35;
const AUDIO_FADE_IN_MS = 1000;
const AUDIO_CROSSFADE_MS = 10000;
const PDF_CAPTURE_THUMBNAIL_W = 420;
const PDF_CAPTURE_THUMBNAIL_H = 260;
const PDF_CAPTURE_MAX_DIMENSION = 2400;
const PDF_CAPTURE_MAX_PIXELS = 6_000_000;
const DEFAULT_PDF_STARRY_BRIGHTNESS = 100;
const DEFAULT_PDF_STARRY_SPEED = 100;
const DEFAULT_PDF_STARRY_DENSITY = 100;
const DEFAULT_PDF_STARRY_STRAIGHTNESS = 100;
const THEME_KEYS = ["ocean", "midnight", "nord", "monokai", "solarized", "light"];
const TAG_SUGGESTION_BATCH_SIZE = 500;
const TAG_SUGGESTION_MAX_ARTICLES = 5000;
const TAG_SUGGESTION_LIMIT = 6;
const TAG_SUGGESTION_STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "between", "by", "for", "from", "in", "into", "is",
    "it", "its", "of", "on", "or", "that", "the", "their", "these", "this", "to", "via", "was", "were",
    "with", "within", "using", "use", "used",
]);
const tagSuggestionVectorCache = new Map();
let tagSuggestionCorpusPromise = null;
const DEFAULT_THEME_PRESETS = {
    ocean: {
        name: "Ocean Dark",
        bg: "#0d1a26",
        bgSoft: "#162839",
        panel: "#1a3145",
        text: "#e6eef7",
        muted: "#a7bfd5",
        accent: "#52d0a3",
        accent2: "#f5b34d",
        danger: "#e05d5d",
        line: "#28445e",
        bodyGradA: "#1a3b56",
        bodyGradB: "#28445e",
        bodyGradBg: "#0d1a26",
        bodyGradEnd: "#0b1620",
        topbarColor: "#081420",
        topbarAlphaBase: 0.6,
        menuColor: "#0d1b28",
        menuAlphaBase: 0.97,
    },
    midnight: {
        name: "Midnight",
        bg: "#0a0a14",
        bgSoft: "#12121f",
        panel: "#1a1a2e",
        text: "#e8e8ff",
        muted: "#9090c0",
        accent: "#7c6af7",
        accent2: "#f5a36a",
        danger: "#e05d7a",
        line: "#2a2a4a",
        bodyGradA: "#1a1a3a",
        bodyGradB: "#2a2a4a",
        bodyGradBg: "#0a0a14",
        bodyGradEnd: "#060610",
        topbarColor: "#081420",
        topbarAlphaBase: 0.6,
        menuColor: "#0d1b28",
        menuAlphaBase: 0.97,
    },
    nord: {
        name: "Nord",
        bg: "#2e3440",
        bgSoft: "#3b4252",
        panel: "#434c5e",
        text: "#eceff4",
        muted: "#88c0d0",
        accent: "#88c0d0",
        accent2: "#ebcb8b",
        danger: "#bf616a",
        line: "#4c566a",
        bodyGradA: "#3b4252",
        bodyGradB: "#434c5e",
        bodyGradBg: "#2e3440",
        bodyGradEnd: "#242933",
        topbarColor: "#081420",
        topbarAlphaBase: 0.6,
        menuColor: "#0d1b28",
        menuAlphaBase: 0.97,
    },
    monokai: {
        name: "Monokai",
        bg: "#272822",
        bgSoft: "#2f3028",
        panel: "#3e3d32",
        text: "#f8f8f2",
        muted: "#a6a08a",
        accent: "#a6e22e",
        accent2: "#e6db74",
        danger: "#f92672",
        line: "#49483e",
        bodyGradA: "#363630",
        bodyGradB: "#44443c",
        bodyGradBg: "#272822",
        bodyGradEnd: "#1e1e1a",
        topbarColor: "#081420",
        topbarAlphaBase: 0.6,
        menuColor: "#0d1b28",
        menuAlphaBase: 0.97,
    },
    solarized: {
        name: "Solarized Dark",
        bg: "#002b36",
        bgSoft: "#073642",
        panel: "#0d4050",
        text: "#eee8d5",
        muted: "#93a1a1",
        accent: "#2aa198",
        accent2: "#cb4b16",
        danger: "#dc322f",
        line: "#094454",
        bodyGradA: "#073642",
        bodyGradB: "#0d4050",
        bodyGradBg: "#002b36",
        bodyGradEnd: "#001b24",
        topbarColor: "#081420",
        topbarAlphaBase: 0.6,
        menuColor: "#0d1b28",
        menuAlphaBase: 0.97,
    },
    light: {
        name: "High Contrast Light",
        bg: "#edf2f7",
        bgSoft: "#ffffff",
        panel: "#ffffff",
        text: "#102235",
        muted: "#2f4b66",
        accent: "#0063a3",
        accent2: "#9a5f05",
        danger: "#b4232e",
        line: "#9cb2c8",
        bodyGradA: "#dfeaf6",
        bodyGradB: "#cfdff0",
        bodyGradBg: "#edf2f7",
        bodyGradEnd: "#dfeaf4",
        topbarColor: "#f6faff",
        topbarAlphaBase: 0.94,
        menuColor: "#122130",
        menuAlphaBase: 0.97,
    },
};
const THEME_COLOR_FIELDS = [
    { key: "bg", label: "Background" },
    { key: "bgSoft", label: "Soft background" },
    { key: "panel", label: "Panels" },
    { key: "text", label: "Primary text" },
    { key: "muted", label: "Muted text" },
    { key: "accent", label: "Accent" },
    { key: "accent2", label: "Accent secondary" },
    { key: "danger", label: "Danger" },
    { key: "line", label: "Borders" },
    { key: "bodyGradA", label: "Gradient start" },
    { key: "bodyGradB", label: "Gradient middle" },
    { key: "bodyGradBg", label: "Gradient base" },
    { key: "bodyGradEnd", label: "Gradient end" },
    { key: "topbarColor", label: "Top bar" },
    { key: "menuColor", label: "Dropdown panels" },
];

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

function initNightFilterEnabledPreference() {
    const raw = window.localStorage.getItem(NIGHT_FILTER_ENABLED_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;

    const strength = Number.parseInt(window.localStorage.getItem("article-night-filter-strength") || "0", 10);
    return Number.isFinite(strength) && strength > 0;
}

function cloneThemePreset(preset) {
    return { ...preset };
}

function normalizeThemeHex(value, fallback = "") {
    const raw = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
        const [, r, g, b] = raw;
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return fallback;
}

function normalizeThemeAlpha(value, fallback) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(1, Math.max(0, numeric));
}

function normalizeThemePreset(themeKey, rawPreset) {
    const defaults = DEFAULT_THEME_PRESETS[themeKey];
    const preset = rawPreset && typeof rawPreset === "object" ? rawPreset : {};
    const normalized = {
        name: normalizeWhitespace(preset.name).slice(0, 40) || defaults.name,
        topbarAlphaBase: normalizeThemeAlpha(preset.topbarAlphaBase, defaults.topbarAlphaBase),
        menuAlphaBase: normalizeThemeAlpha(preset.menuAlphaBase, defaults.menuAlphaBase),
    };

    for (const field of THEME_COLOR_FIELDS) {
        normalized[field.key] = normalizeThemeHex(preset[field.key], defaults[field.key]);
    }

    return normalized;
}

function loadThemePresets() {
    let raw = null;
    try {
        raw = JSON.parse(window.localStorage.getItem(THEME_PRESET_STORAGE_KEY) || "null");
    } catch {
        raw = null;
    }

    const presets = {};
    for (const themeKey of THEME_KEYS) {
        presets[themeKey] = normalizeThemePreset(themeKey, raw?.[themeKey]);
    }
    return presets;
}

function saveThemePresets() {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, JSON.stringify(state.themePresets));
}

function cloneDefaultKeyboardShortcuts() {
    return Object.fromEntries(
        Object.entries(DEFAULT_KEYBOARD_SHORTCUTS).map(([key, bindings]) => [key, [...bindings]]),
    );
}

function listStoredArticlePreferenceKeys() {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith("article-")) continue;
        if (key === DEMO_MODE_KEY || key === DEMO_MODE_PREF_SNAPSHOT_KEY) continue;
        keys.push(key);
    }
    return keys;
}

function readDemoModePreferenceSnapshot() {
    try {
        const raw = window.localStorage.getItem(DEMO_MODE_PREF_SNAPSHOT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function storeDemoModePreferenceSnapshot() {
    const snapshot = {};
    listStoredArticlePreferenceKeys().forEach((key) => {
        snapshot[key] = window.localStorage.getItem(key);
    });
    window.localStorage.setItem(DEMO_MODE_PREF_SNAPSHOT_KEY, JSON.stringify(snapshot));
    return snapshot;
}

function clearStoredArticlePreferences() {
    listStoredArticlePreferenceKeys().forEach((key) => {
        window.localStorage.removeItem(key);
    });
}

function restoreStoredArticlePreferences(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    clearStoredArticlePreferences();
    Object.entries(snapshot).forEach(([key, value]) => {
        if (!key || key === DEMO_MODE_KEY || key === DEMO_MODE_PREF_SNAPSHOT_KEY) return;
        if (typeof value === "string") {
            window.localStorage.setItem(key, value);
        }
    });
    return true;
}

function resetStoredArticlePreferencesToDefaults() {
    clearStoredArticlePreferences();
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

        const rawHasPrevModal = Object.prototype.hasOwnProperty.call(raw, "prevModal");
        const rawHasNextModal = Object.prototype.hasOwnProperty.call(raw, "nextModal");
        const legacyToggleList = typeof raw.arrowToggle === "string"
            ? [raw.arrowToggle]
            : (Array.isArray(raw.arrowToggle) ? raw.arrowToggle : []);
        const normalizedLegacyToggleBindings = legacyToggleList.map(normalizeShortcutBinding).filter(Boolean);

        for (const key of Object.keys(defaults)) {
            const value = raw[key];
            const asList = typeof value === "string" ? [value] : (Array.isArray(value) ? value : []);
            const normalized = asList.map(normalizeShortcutBinding).filter(Boolean);
            if (normalized.length > 0) defaults[key] = normalized;
        }

        if (!rawHasPrevModal) {
            const legacyPrevBindings = normalizedLegacyToggleBindings.filter((binding) => binding === "ArrowUp");
            if (legacyPrevBindings.length > 0) defaults.prevModal = legacyPrevBindings;
        }
        if (!rawHasNextModal) {
            const legacyNextBindings = normalizedLegacyToggleBindings.filter((binding) => binding === "ArrowDown");
            if (legacyNextBindings.length > 0) defaults.nextModal = legacyNextBindings;
        }
    } catch {
        return defaults;
    }
    return defaults;
}

function normalizeMouseHotkeyBinding(binding) {
    if (!binding || typeof binding !== "object") return null;
    return {
        ctrl: Boolean(binding.ctrl),
        alt: Boolean(binding.alt),
        shift: Boolean(binding.shift),
    };
}

function cloneDefaultHotkeys() {
    return Object.fromEntries(
        Object.entries(DEFAULT_HOTKEYS).map(([key, binding]) => [key, { ...binding }]),
    );
}

function loadHotkeys() {
    const defaults = cloneDefaultHotkeys();
    try {
        const raw = JSON.parse(window.localStorage.getItem("article-hotkeys") || "null");
        if (!raw || typeof raw !== "object") return defaults;

        const legacyOpenPdf = normalizeMouseHotkeyBinding(raw.openPdf);
        for (const key of Object.keys(defaults)) {
            const normalized = normalizeMouseHotkeyBinding(raw[key]);
            if (normalized) defaults[key] = normalized;
        }
        if (legacyOpenPdf && !normalizeMouseHotkeyBinding(raw.openPdfExternal)) {
            defaults.openPdfExternal = legacyOpenPdf;
        }
        return defaults;
    } catch {
        return defaults;
    }
}

function saveKeyboardShortcuts() {
    window.localStorage.setItem(KEYBOARD_SHORTCUTS_STORAGE_KEY, JSON.stringify(state.keyboardShortcuts));
}

function getKeyboardShortcutBindings(shortcutKey) {
    return state.keyboardShortcuts?.[shortcutKey] || DEFAULT_KEYBOARD_SHORTCUTS[shortcutKey] || [];
}

function usesKeyboardShortcutBinding(shortcutKey, binding) {
    const normalizedBinding = normalizeShortcutBinding(binding);
    if (!normalizedBinding) return false;
    return getKeyboardShortcutBindings(shortcutKey).includes(normalizedBinding);
}

function getKeyboardShortcutDisplay(shortcutKey) {
    const bindings = getKeyboardShortcutBindings(shortcutKey);
    return bindings.map(formatShortcutBinding).join(" / ");
}

function setButtonMnemonicLabel(button, parts, shouldUnderline) {
    if (!button) return;
    clearNode(button);

    const prefix = String(parts?.prefix || "");
    const key = String(parts?.key || "");
    const suffix = String(parts?.suffix || "");

    if (prefix) button.appendChild(document.createTextNode(prefix));

    if (key) {
        if (shouldUnderline) {
            const letter = document.createElement("span");
            letter.className = "shortcut-mnemonic-letter";
            letter.textContent = key;
            button.appendChild(letter);
        } else {
            button.appendChild(document.createTextNode(key));
        }
    }

    if (suffix) button.appendChild(document.createTextNode(suffix));
}

function setShortcutTooltip(button, shortcutKey) {
    if (!button) return;
    const display = getKeyboardShortcutDisplay(shortcutKey);
    button.title = display ? `Hotkey: ${display}` : "";
}

function syncKeyboardShortcutButtonHints() {
    setButtonMnemonicLabel(dom.pdfCopyRegionToggle, {
        key: "C",
        suffix: "opy Region",
    }, usesKeyboardShortcutBinding("pdfCopyTool", "C"));
    setShortcutTooltip(dom.pdfCopyRegionToggle, "pdfCopyTool");

    setButtonMnemonicLabel(dom.pdfCaptureThumbnailToggle, {
        prefix: "Capture ",
        key: "T",
        suffix: "humbnail",
    }, usesKeyboardShortcutBinding("pdfThumbnailTool", "T"));
    setShortcutTooltip(dom.pdfCaptureThumbnailToggle, "pdfThumbnailTool");

    setButtonMnemonicLabel(dom.thumbPaste, {
        key: "P",
        suffix: "aste from Clipboard",
    }, usesKeyboardShortcutBinding("pasteThumb", "P"));
    setShortcutTooltip(dom.thumbPaste, "pasteThumb");
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
    recentArticleId: null,
    hoveredArticleId: null,
    viewMode: window.localStorage.getItem("article-view-mode") || "preview",
    cardHeight: Number.parseInt(window.localStorage.getItem("article-card-height") || "138", 10),
    autoFitHeight: window.localStorage.getItem("article-autofit-height") === "true",
    cardWidth: Number.parseInt(window.localStorage.getItem("article-card-width") || "200", 10),
    cardFont: Number.parseInt(window.localStorage.getItem("article-card-font") || "14", 10),
    fontFamily: window.localStorage.getItem("article-font-family") || "segoe",
    theme: window.localStorage.getItem("article-theme") || "ocean",
    themePresets: loadThemePresets(),
    themeEditorTheme: null,
    allKnownTags: [],
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
    tagGradientReach: Number.parseInt(window.localStorage.getItem("article-tag-gradient-reach") || "26", 10),
    modalBackdropDarkness: Number.parseInt(window.localStorage.getItem("article-modal-backdrop-darkness") || "58", 10),
    surfaceOpacity: Number.parseInt(window.localStorage.getItem("article-surface-opacity") || "100", 10),
    defaultPdfZoom: Number.parseInt(window.localStorage.getItem(DEFAULT_PDF_ZOOM_KEY) || "100", 10),
    nightFilterEnabled: initNightFilterEnabledPreference(),
    nightFilterMode: window.localStorage.getItem("article-night-filter-mode") || "warm",
    nightFilterStrength: Number.parseInt(window.localStorage.getItem("article-night-filter-strength") || "0", 10),
    enablePdfCopyTool: window.localStorage.getItem(PDF_COPY_TOOL_ENABLED_KEY) === "true",
    enablePdfTextSelectTool: window.localStorage.getItem(PDF_TEXT_SELECT_TOOL_ENABLED_KEY) === "true",
    previewCopiedText: window.localStorage.getItem(PDF_COPY_PREVIEW_ENABLED_KEY) !== "false",
    pdfCopyPreviewDurationSetting: clampInfiniteSliderSetting(
        window.localStorage.getItem(PDF_COPY_PREVIEW_DURATION_KEY),
        DEFAULT_PDF_COPY_PREVIEW_DURATION_SETTING,
    ),
    enablePdfThumbnailCapture: true,
    downscalePdfCaptureImages: window.localStorage.getItem(PDF_CAPTURE_DOWNSCALE_ENABLED_KEY) !== "false",
    enablePdfStarryBackground: window.localStorage.getItem(PDF_STARRY_BACKGROUND_ENABLED_KEY) === "true",
    audioEnabled: window.localStorage.getItem(AUDIO_ENABLED_KEY) === "true",
    audioVolume: clampAmbientAudioVolume(window.localStorage.getItem(AUDIO_VOLUME_KEY) || String(DEFAULT_AUDIO_VOLUME)),
    pdfStarryBrightness: clampPdfStarryBrightness(window.localStorage.getItem(PDF_STARRY_BRIGHTNESS_KEY)),
    pdfStarrySpeed: clampPdfStarrySpeed(window.localStorage.getItem(PDF_STARRY_SPEED_KEY)),
    pdfStarryDensity: clampPdfStarryDensity(window.localStorage.getItem(PDF_STARRY_DENSITY_KEY)),
    pdfStarryStraightness: clampPdfStarryStraightness(window.localStorage.getItem(PDF_STARRY_STRAIGHTNESS_KEY)),
    unlockPdfViewerWidth: window.localStorage.getItem(PDF_VIEWER_WIDTH_UNLOCKED_KEY) === "true",
    showAbstractPreviewNotes: window.localStorage.getItem(ABSTRACT_PREVIEW_NOTES_ENABLED_KEY) === "true",
    tagColors: JSON.parse(window.localStorage.getItem("article-tag-colors") || "{}"),
    hotkeys: loadHotkeys(),
    keyboardShortcuts: loadKeyboardShortcuts(),
    nicheTags: JSON.parse(window.localStorage.getItem("article-niche-tags") || "[]"),
    enableNiche: initEnableNichePreference(),
    showNiche: initShowNichePreference(),
    showRefDois: initShowRefDoisPreference(),
    acIndex: -1,
    nicheAcIndex: -1,
    isEscaping: false,
    abstractPreviewArticle: null,
    wellnessTipIndex: Number.parseInt(window.localStorage.getItem("article-wellness-tip-index") || "0", 10),
    showErrorsGlobally: window.localStorage.getItem("article-show-errors") !== "false",
    abstractSectionCount: Number.parseInt(window.localStorage.getItem("article-abstract-sections") || "4", 10),
    debugMode: window.localStorage.getItem("article-debug-mode") === "true",
    debugLogRetentionSetting: clampInfiniteSliderSetting(
        window.localStorage.getItem(DEBUG_LOG_RETENTION_KEY),
        DEFAULT_DEBUG_LOG_RETENTION_SETTING,
    ),
    demoMode: window.localStorage.getItem(DEMO_MODE_KEY) === "true",
    tagSuggestionArticles: [],
    tagSuggestionCorpusMode: null,
    tagSuggestionCorpusLoaded: false,
    modalArrowBusy: false,
    thumbnailUndo: null,
    metadataDirty: false,
    metadataSaving: false,
    metadataSavedSinceOpen: false,
    metadataIndicatorMode: "",
    metadataBaselineKey: "",
    doiFetchRecentTimestamps: [],
    lastDoiRateWarningAt: 0,
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
    defaultPdfZoomSlider: document.getElementById("default-pdf-zoom-slider"),
    defaultPdfZoomValue: document.getElementById("default-pdf-zoom-value"),
    nightFilterEnabled: document.getElementById("night-filter-enabled"),
    nightFilterControls: document.getElementById("night-filter-controls"),
    nightFilterMode: document.getElementById("night-filter-mode"),
    nightFilterStrengthSlider: document.getElementById("night-filter-strength-slider"),
    nightFilterStrengthValue: document.getElementById("night-filter-strength-value"),
    pdfNightFilterEnabled: document.getElementById("pdf-night-filter-enabled"),
    pdfNightFilterControls: document.getElementById("pdf-night-filter-controls"),
    pdfNightFilterMode: document.getElementById("pdf-night-filter-mode"),
    pdfNightFilterStrengthSlider: document.getElementById("pdf-night-filter-strength-slider"),
    pdfNightFilterStrengthValue: document.getElementById("pdf-night-filter-strength-value"),
    pdfCopyRegionToggle: document.getElementById("pdf-copy-region-toggle"),
    pdfTextSelectToggle: document.getElementById("pdf-text-select-toggle"),
    pdfCaptureThumbnailToggle: document.getElementById("pdf-capture-thumbnail-toggle"),
    pdfToolPanel: document.getElementById("pdf-tool-panel"),
    pdfCopyRegionHint: document.getElementById("pdf-copy-region-hint"),
    pdfTextSelectHint: document.getElementById("pdf-text-select-hint"),
    pdfCapturePanel: document.getElementById("pdf-capture-panel"),
    pdfCapturePreset: document.getElementById("pdf-capture-preset"),
    pdfCapturePreview: document.getElementById("pdf-capture-preview"),
    pdfCaptureSave: document.getElementById("pdf-capture-save"),
    pdfCaptureCancel: document.getElementById("pdf-capture-cancel"),
    nightFilterPreMatrix: document.getElementById("night-filter-pre-matrix"),
    nightFilterPostMatrix: document.getElementById("night-filter-post-matrix"),
    nightFilterFuncR: document.getElementById("night-filter-func-r"),
    nightFilterFuncG: document.getElementById("night-filter-func-g"),
    nightFilterFuncB: document.getElementById("night-filter-func-b"),
    colorIntensitySlider: document.getElementById("color-intensity-slider"),
    colorIntensityValue: document.getElementById("color-intensity-value"),
    tagGradientReachSlider: document.getElementById("tag-gradient-reach-slider"),
    tagGradientReachValue: document.getElementById("tag-gradient-reach-value"),
    tagTintControls: document.getElementById("tag-tint-controls"),
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
    longParseWrap: document.getElementById("long-parse-wrap"),
    reindexBtn: document.getElementById("reindex-btn"),
    openArticlesBtn: document.getElementById("open-articles-btn"),
    renameTagBtn: document.getElementById("rename-tag-btn"),
    removeTagBtn: document.getElementById("remove-tag-btn"),
    statusLine: document.getElementById("status-line"),
    grid: document.getElementById("grid"),
    modal: document.getElementById("edit-modal"),
    modalClose: document.getElementById("modal-close"),
    metadataDirtyIndicator: document.getElementById("metadata-dirty-indicator"),
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
    tagSuggestions: document.getElementById("tag-suggestions"),
    tagSuggestionsList: document.getElementById("tag-suggestions-list"),
    notes: document.getElementById("f-notes"),
    autoHideTopbar: document.getElementById("auto-hide-topbar"),
    abstractModal: document.getElementById("abstract-modal"),
    abstractTitle: document.getElementById("abstract-title"),
    pdfViewerModal: document.getElementById("pdf-viewer-modal"),
    pdfViewerTitle: document.getElementById("pdf-viewer-title"),
    pdfViewerMeta: document.getElementById("pdf-viewer-meta"),
    pdfViewerSubmeta: document.getElementById("pdf-viewer-submeta"),
    pdfViewerClose: document.getElementById("pdf-viewer-close"),
    pdfToggleHeaderFold: document.getElementById("pdf-toggle-header-fold"),
    pdfOpenMetadata: document.getElementById("pdf-open-metadata"),
    pdfOpenAbstract: document.getElementById("pdf-open-abstract"),
    pdfOpenExternal: document.getElementById("pdf-open-external"),
    pdfCopyBibtex: document.getElementById("pdf-copy-bibtex"),
    pdfPrevPage: document.getElementById("pdf-prev-page"),
    pdfPageNumber: document.getElementById("pdf-page-number"),
    pdfPageCount: document.getElementById("pdf-page-count"),
    pdfNextPage: document.getElementById("pdf-next-page"),
    pdfZoomOut: document.getElementById("pdf-zoom-out"),
    pdfZoomValue: document.getElementById("pdf-zoom-value"),
    pdfZoomIn: document.getElementById("pdf-zoom-in"),
    pdfFitWidth: document.getElementById("pdf-fit-width"),
    pdfFitPage: document.getElementById("pdf-fit-page"),
    pdfSearchInput: document.getElementById("pdf-search-input"),
    pdfSearchPrev: document.getElementById("pdf-search-prev"),
    pdfSearchNext: document.getElementById("pdf-search-next"),
    pdfSearchStatus: document.getElementById("pdf-search-status"),
    pdfPageList: document.getElementById("pdf-page-list"),
    pdfViewerStatus: document.getElementById("pdf-viewer-status"),
    pdfStage: document.getElementById("pdf-stage"),
    pdfCanvasWrap: document.getElementById("pdf-canvas-wrap"),
    pdfCanvas: document.getElementById("pdf-canvas"),
    duplicateModal: document.getElementById("duplicate-modal"),
    duplicateClose: document.getElementById("duplicate-close"),
    duplicateList: document.getElementById("duplicate-list"),
    abstractMeta: document.getElementById("abstract-meta"),
    abstractMetaDivider: document.getElementById("abstract-meta-divider"),
    abstractText: document.getElementById("abstract-text"),
    abstractNotesSection: document.getElementById("abstract-notes-section"),
    abstractNotesText: document.getElementById("abstract-notes-text"),
    abstractReferencesSection: document.getElementById("abstract-references-section"),
    abstractReferencesList: document.getElementById("abstract-references-list"),
    metaRemove: document.getElementById("meta-remove"),
    dropOverlay: document.getElementById("drop-overlay"),
    tintByTag: document.getElementById("tint-by-tag"),
    editTagColorsBtn: document.getElementById("edit-tag-colors-btn"),
    tagColorEditor: document.getElementById("tag-color-editor"),
    tagColorList: document.getElementById("tag-color-list"),
    tagColorClose: document.getElementById("tag-color-close"),
    themeSelectContainer: document.getElementById("theme-select-container"),
    themeSelectBtn: document.getElementById("theme-select-btn"),
    themeSelectValue: document.getElementById("theme-select-value"),
    themeSelectMenu: document.getElementById("theme-select-menu"),
    themeEditor: document.getElementById("theme-editor"),
    themeEditorTitle: document.getElementById("theme-editor-title"),
    themeEditorName: document.getElementById("theme-editor-name"),
    themeEditorList: document.getElementById("theme-editor-list"),
    themeEditorClose: document.getElementById("theme-editor-close"),
    themeEditorReset: document.getElementById("theme-editor-reset"),
    toast: document.getElementById("toast"),
    pdfCopyPreview: document.getElementById("pdf-copy-preview"),
    pdfCopyPreviewText: document.getElementById("pdf-copy-preview-text"),
    pdfCopyPreviewClose: document.getElementById("pdf-copy-preview-close"),
    pdfCopyPreviewProgress: document.getElementById("pdf-copy-preview-progress"),
    thumbnailUndo: document.getElementById("thumbnail-undo"),
    thumbnailUndoMessage: document.getElementById("thumbnail-undo-message"),
    thumbnailUndoBtn: document.getElementById("thumbnail-undo-btn"),
    thumbnailUndoProgress: document.getElementById("thumbnail-undo-progress"),
    hotkeysBtn: document.getElementById("hotkeys-btn"),
    hotkeysModal: document.getElementById("hotkeys-modal"),
    hotkeysClose: document.getElementById("hotkeys-close"),
    errorBanner: document.getElementById("error-banner"),
    errorBannerText: document.getElementById("error-banner-text"),
    errorBannerProgress: document.getElementById("error-banner-progress"),
    errorBannerClose: document.getElementById("error-banner-close"),
    showErrorsCheckbox: document.getElementById("show-errors-checkbox"),
    autoRefCompile: document.getElementById("auto-ref-compile"),
    showDupeWarnings: document.getElementById("show-dupe-warnings"),
    enablePdfCopyToolCheckbox: document.getElementById("enable-pdf-copy-tool"),
    enablePdfTextSelectCheckbox: document.getElementById("enable-pdf-text-select"),
    pdfCopyPreviewToggleWrap: document.getElementById("pdf-copy-preview-toggle-wrap"),
    previewCopiedTextCheckbox: document.getElementById("preview-copied-text"),
    pdfCopyPreviewDurationField: document.getElementById("pdf-copy-preview-duration-field"),
    pdfCopyPreviewDurationValue: document.getElementById("pdf-copy-preview-duration-value"),
    pdfCopyPreviewDurationSlider: document.getElementById("pdf-copy-preview-duration-slider"),
    downscalePdfCaptureImagesCheckbox: document.getElementById("downscale-pdf-capture-images"),
    enablePdfStarryBackgroundCheckbox: document.getElementById("enable-pdf-starry-background"),
    enableAudioCheckbox: document.getElementById("enable-audio"),
    audioVolumeField: document.getElementById("audio-volume-field"),
    audioVolumeSlider: document.getElementById("audio-volume-slider"),
    audioVolumeValue: document.getElementById("audio-volume-value"),
    pdfStarryBrightnessField: document.getElementById("pdf-starry-brightness-field"),
    pdfStarryBrightnessSlider: document.getElementById("pdf-starry-brightness-slider"),
    pdfStarryBrightnessValue: document.getElementById("pdf-starry-brightness-value"),
    pdfStarrySpeedField: document.getElementById("pdf-starry-speed-field"),
    pdfStarrySpeedSlider: document.getElementById("pdf-starry-speed-slider"),
    pdfStarrySpeedValue: document.getElementById("pdf-starry-speed-value"),
    pdfStarryDensityField: document.getElementById("pdf-starry-density-field"),
    pdfStarryDensitySlider: document.getElementById("pdf-starry-density-slider"),
    pdfStarryDensityValue: document.getElementById("pdf-starry-density-value"),
    pdfStarryStraightnessField: document.getElementById("pdf-starry-straightness-field"),
    pdfStarryStraightnessSlider: document.getElementById("pdf-starry-straightness-slider"),
    pdfStarryStraightnessValue: document.getElementById("pdf-starry-straightness-value"),
    unlockPdfViewerWidthCheckbox: document.getElementById("unlock-pdf-viewer-width"),
    showAbstractPreviewNotesCheckbox: document.getElementById("show-abstract-notes-preview"),
    enableNicheCheckbox: document.getElementById("enable-niche"),
    experimentalSection: document.getElementById("experimental-section"),
    experimentalArrow: document.getElementById("experimental-arrow"),
    debugModeCheckbox: document.getElementById("debug-mode"),
    debugModeOptions: document.getElementById("debug-mode-options"),
    debugLogRetentionValue: document.getElementById("debug-log-retention-value"),
    debugLogRetentionSlider: document.getElementById("debug-log-retention-slider"),
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
    nicheTagAutocomplete: document.getElementById("niche-tag-autocomplete"),
    showRefDoisCheckbox: document.getElementById("show-ref-dois"),
    abstractSectionCountValue: document.getElementById("abstract-section-count-value"),
    abstractSectionCountInput: document.getElementById("abstract-section-count"),
};

const pdfViewer = {
    article: null,
    doc: null,
    page: 1,
    pageCount: 0,
    defaultBaseViewport: null,
    zoomMode: "custom",
    zoomScale: 1,
    renderTask: null,
    loadingTask: null,
    loadRequestId: 0,
    renderRequestId: 0,
    renderGeneration: 0,
    searchRequestId: 0,
    searchQuery: "",
    searchDisplayQuery: "",
    searchMatches: [],
    searchMatchIndex: -1,
    pageShells: new Map(),
    pageCanvases: new Map(),
    pageTextLayers: new Map(),
    pageOverlayLayers: new Map(),
    pageBaseSizes: new Map(),
    pageRenderTasks: new Map(),
    pageTextLayerTasks: new Map(),
    pageTextCache: new Map(),
    pageTextPromises: new Map(),
    pageTextGeometryCache: new Map(),
    pageTextGeometryPromises: new Map(),
    toolMode: "none",
    toolSession: null,
    copyRegionPageNumber: 0,
    copyRegionRect: null,
    copyRegionDebugMatches: [],
    copyRegionDebugPageNumber: 0,
    copyRegionDebugReady: false,
    copyRegionDebugRequestId: 0,
    capturePreset: "thumbnail",
    capturePageNumber: 0,
    captureRect: null,
    previewFramePending: false,
    headerFolded: false,
};

let pdfJsLibPromise = null;
const ambientAudio = {
    context: null,
    masterGain: null,
    buffer: null,
    bufferPromise: null,
    sessionId: 0,
    nextScheduleTimer: null,
    layers: new Set(),
    currentLayer: null,
};

function isPdfTextSelectToolActive() {
    return pdfViewer.toolMode === PDF_TEXT_SELECT_TOOL_MODE;
}

function clearPdfTextSelection() {
    const selection = window.getSelection ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0 || !dom.pdfViewerModal) return;
    for (let i = 0; i < selection.rangeCount; i += 1) {
        const range = selection.getRangeAt(i);
        if (dom.pdfViewerModal.contains(range.commonAncestorContainer)) {
            selection.removeAllRanges();
            return;
        }
    }
}

function clampAmbientAudioVolume(value) {
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed)) return DEFAULT_AUDIO_VOLUME;
    return Math.max(0, Math.min(100, parsed));
}

function getAmbientAudioTargetVolume() {
    return clampAmbientAudioVolume(state.audioVolume) / 100;
}

function evaluateSplineFade(progress) {
    const t = Math.max(0, Math.min(1, progress));
    return t * t * (3 - (2 * t));
}

function buildSplineGainCurve(fromValue, toValue, steps = 128) {
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i += 1) {
        const progress = steps === 1 ? 1 : (i / (steps - 1));
        const eased = evaluateSplineFade(progress);
        curve[i] = fromValue + ((toValue - fromValue) * eased);
    }
    return curve;
}

function clearAmbientAudioScheduleTimer() {
    if (ambientAudio.nextScheduleTimer) {
        window.clearTimeout(ambientAudio.nextScheduleTimer);
        ambientAudio.nextScheduleTimer = null;
    }
}

function ensureAmbientAudioContext() {
    if (ambientAudio.context && ambientAudio.masterGain) {
        return ambientAudio.context;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
        throw new Error("Web Audio API is not available in this environment.");
    }
    const context = new AudioContextCtor();
    const masterGain = context.createGain();
    masterGain.gain.value = getAmbientAudioTargetVolume();
    masterGain.connect(context.destination);
    ambientAudio.context = context;
    ambientAudio.masterGain = masterGain;
    return context;
}

async function ensureAmbientAudioReady() {
    const context = ensureAmbientAudioContext();
    if (!ambientAudio.bufferPromise) {
        const sourceUrl = new URL("./assets/audio/greensleep-short.mp3", window.location.href).href;
        ambientAudio.bufferPromise = fetch(sourceUrl)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Audio fetch failed with status ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then((bufferData) => context.decodeAudioData(bufferData.slice(0)))
            .then((decodedBuffer) => {
                ambientAudio.buffer = decodedBuffer;
                return decodedBuffer;
            })
            .catch((err) => {
                ambientAudio.bufferPromise = null;
                throw err;
            });
    }
    const buffer = ambientAudio.buffer || await ambientAudio.bufferPromise;
    if (context.state === "suspended") {
        await context.resume();
    }
    return { context, buffer };
}

function getAmbientLayerGainAtTime(layer, time) {
    if (!layer) return 0;
    if (time <= layer.startTime) return 0;
    if (layer.fadeInDuration > 0 && time < (layer.startTime + layer.fadeInDuration)) {
        const progress = (time - layer.startTime) / layer.fadeInDuration;
        return evaluateSplineFade(progress);
    }
    return 1;
}

function getAmbientAudioOverlapSeconds(buffer) {
    const duration = buffer?.duration || 0;
    if (!(duration > 0)) return 0;
    return Math.min(AUDIO_CROSSFADE_MS / 1000, Math.max(0.25, duration - 0.1));
}

function stopAmbientAudioLayer(layer) {
    if (!layer) return;
    try {
        layer.source.stop();
    } catch { }
    try {
        layer.source.disconnect();
    } catch { }
    try {
        layer.gain.disconnect();
    } catch { }
    ambientAudio.layers.delete(layer);
    if (ambientAudio.currentLayer === layer) {
        ambientAudio.currentLayer = null;
    }
}

function scheduleAmbientLayer(sessionId, startTime, fadeInDuration, previousLayer = null) {
    const context = ambientAudio.context;
    const buffer = ambientAudio.buffer;
    const masterGain = ambientAudio.masterGain;
    if (!context || !buffer || !masterGain) return null;
    if (sessionId !== ambientAudio.sessionId || !state.audioEnabled) return null;

    const actualStartTime = Math.max(startTime, context.currentTime + 0.02);
    const source = context.createBufferSource();
    source.buffer = buffer;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, actualStartTime);

    source.connect(gain);
    gain.connect(masterGain);

    const layer = {
        source,
        gain,
        startTime: actualStartTime,
        fadeInDuration,
    };
    ambientAudio.layers.add(layer);
    ambientAudio.currentLayer = layer;

    if (fadeInDuration > 0) {
        gain.gain.setValueCurveAtTime(buildSplineGainCurve(0, 1), actualStartTime, fadeInDuration);
        gain.gain.setValueAtTime(1, actualStartTime + fadeInDuration);
    } else {
        gain.gain.setValueAtTime(1, actualStartTime);
    }

    if (previousLayer) {
        const overlapDuration = Math.max(0.05, fadeInDuration);
        const previousGainAtStart = getAmbientLayerGainAtTime(previousLayer, actualStartTime);
        previousLayer.gain.gain.cancelScheduledValues(actualStartTime);
        previousLayer.gain.gain.setValueAtTime(previousGainAtStart, actualStartTime);
        previousLayer.gain.gain.setValueCurveAtTime(
            buildSplineGainCurve(previousGainAtStart, 0),
            actualStartTime,
            overlapDuration,
        );
        previousLayer.gain.gain.setValueAtTime(0, actualStartTime + overlapDuration);
        try {
            previousLayer.source.stop(actualStartTime + overlapDuration + 0.05);
        } catch { }
    }

    source.onended = () => {
        stopAmbientAudioLayer(layer);
    };
    source.start(actualStartTime);

    const overlapSeconds = getAmbientAudioOverlapSeconds(buffer);
    const nextStartTime = actualStartTime + Math.max(0.1, buffer.duration - overlapSeconds);
    const lookAheadSeconds = 0.35;
    const scheduleDelayMs = Math.max(0, ((nextStartTime - context.currentTime) - lookAheadSeconds) * 1000);
    clearAmbientAudioScheduleTimer();
    ambientAudio.nextScheduleTimer = window.setTimeout(() => {
        ambientAudio.nextScheduleTimer = null;
        if (sessionId !== ambientAudio.sessionId || !state.audioEnabled) return;
        scheduleAmbientLayer(sessionId, nextStartTime, overlapSeconds, layer);
    }, scheduleDelayMs);

    return layer;
}

async function startAmbientAudioLoop() {
    ambientAudio.sessionId += 1;
    const sessionId = ambientAudio.sessionId;
    stopAmbientAudioLoop();
    const { context, buffer } = await ensureAmbientAudioReady();
    if (sessionId !== ambientAudio.sessionId || !state.audioEnabled) return;
    const initialStartTime = context.currentTime + 0.05;
    scheduleAmbientLayer(sessionId, initialStartTime, AUDIO_FADE_IN_MS / 1000, null);
}

function stopAmbientAudioLoop() {
    clearAmbientAudioScheduleTimer();
    ambientAudio.currentLayer = null;
    Array.from(ambientAudio.layers).forEach((layer) => {
        stopAmbientAudioLayer(layer);
    });
}

function applyAmbientAudioVolume() {
    if (!ambientAudio.context || !ambientAudio.masterGain) return;
    const now = ambientAudio.context.currentTime;
    const targetVolume = getAmbientAudioTargetVolume();
    ambientAudio.masterGain.gain.cancelScheduledValues(now);
    ambientAudio.masterGain.gain.setTargetAtTime(targetVolume, now, 0.08);
}

async function setAmbientAudioEnabled(enabled, { showError = true } = {}) {
    state.audioEnabled = Boolean(enabled);
    window.localStorage.setItem(AUDIO_ENABLED_KEY, state.audioEnabled ? "true" : "false");
    syncExperimentalNestedOptions();
    if (!state.audioEnabled) {
        stopAmbientAudioLoop();
        return true;
    }
    try {
        await startAmbientAudioLoop();
        return true;
    } catch (err) {
        stopAmbientAudioLoop();
        state.audioEnabled = false;
        window.localStorage.setItem(AUDIO_ENABLED_KEY, "false");
        syncExperimentalNestedOptions();
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        if (showError) {
            setStatus(`Failed to start audio: ${message}`, true);
        }
        return false;
    }
}

const SORT_KEYS = new Set([
    "year_desc",
    "year_asc",
    "page_count_desc",
    "page_count_asc",
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
    montserrat: '"Montserrat", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    roboto_slab: '"Roboto Slab", Georgia, "Times New Roman", Times, serif',
    merriweather: '"Merriweather", Georgia, "Times New Roman", Times, serif',
    cormorant_garamond: '"Cormorant Garamond", Georgia, "Times New Roman", Times, serif',
    roboto_mono: '"Roboto Mono", "Courier New", Courier, monospace',
    fira_code: '"Fira Code", "Cascadia Code", "Roboto Mono", "Courier New", Courier, monospace',
    cascadia_code: '"Cascadia Code", "Cascadia Mono", "Roboto Mono", "Fira Code", "Courier New", Courier, monospace',
};

function normalizeSortKey(value, fallback) {
    const v = String(value || "").trim();
    return SORT_KEYS.has(v) ? v : fallback;
}

function normalizeFontKey(value, fallback) {
    const key = String(value || "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(FONT_FAMILIES, key) ? key : fallback;
}

function clampInfiniteSliderSetting(value, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(1, Math.min(INFINITE_SLIDER_VALUE, parsed));
}

function formatInfiniteDurationLabel(value) {
    return value >= INFINITE_SLIDER_VALUE ? "Infinity" : `${value}s`;
}

function formatDebugLogRetentionLabel(value) {
    return value >= INFINITE_SLIDER_VALUE ? "Infinity" : `${value * 10} entries`;
}

function getPdfCopyPreviewDurationMs() {
    return state.pdfCopyPreviewDurationSetting >= INFINITE_SLIDER_VALUE
        ? Number.POSITIVE_INFINITY
        : Math.max(1, state.pdfCopyPreviewDurationSetting) * 1000;
}

function getDebugLogEntryLimit() {
    return state.debugLogRetentionSetting >= INFINITE_SLIDER_VALUE
        ? Number.POSITIVE_INFINITY
        : Math.max(1, state.debugLogRetentionSetting) * 10;
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

const SURFACE_OPACITY_ACTUAL_MIN = 30;
const SURFACE_OPACITY_ACTUAL_MAX = 100;
const SURFACE_OPACITY_DISPLAY_MIN = 30;
const SURFACE_OPACITY_DISPLAY_MAX = 95;

function clampSurfaceOpacity(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return SURFACE_OPACITY_ACTUAL_MAX;
    return Math.max(SURFACE_OPACITY_ACTUAL_MIN, Math.min(SURFACE_OPACITY_ACTUAL_MAX, n));
}

function clampSurfaceOpacityDisplay(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return SURFACE_OPACITY_DISPLAY_MAX;
    return Math.max(SURFACE_OPACITY_DISPLAY_MIN, Math.min(SURFACE_OPACITY_DISPLAY_MAX, n));
}

function surfaceOpacityActualToDisplay(value) {
    const actual = clampSurfaceOpacity(value);
    const actualSpan = SURFACE_OPACITY_ACTUAL_MAX - SURFACE_OPACITY_ACTUAL_MIN;
    const displaySpan = SURFACE_OPACITY_DISPLAY_MAX - SURFACE_OPACITY_DISPLAY_MIN;
    if (actualSpan <= 0 || displaySpan <= 0) return SURFACE_OPACITY_DISPLAY_MAX;
    const ratio = (actual - SURFACE_OPACITY_ACTUAL_MIN) / actualSpan;
    return clampSurfaceOpacityDisplay(
        Math.round(SURFACE_OPACITY_DISPLAY_MIN + (ratio * displaySpan)),
    );
}

function surfaceOpacityDisplayToActual(value) {
    const display = clampSurfaceOpacityDisplay(value);
    const displaySpan = SURFACE_OPACITY_DISPLAY_MAX - SURFACE_OPACITY_DISPLAY_MIN;
    const actualSpan = SURFACE_OPACITY_ACTUAL_MAX - SURFACE_OPACITY_ACTUAL_MIN;
    if (displaySpan <= 0 || actualSpan <= 0) return SURFACE_OPACITY_ACTUAL_MAX;
    const ratio = (display - SURFACE_OPACITY_DISPLAY_MIN) / displaySpan;
    return clampSurfaceOpacity(
        Math.round(SURFACE_OPACITY_ACTUAL_MIN + (ratio * actualSpan)),
    );
}

function applySurfaceOpacity(value, options = {}) {
    const opacityPercent = options.displayScale
        ? surfaceOpacityDisplayToActual(value)
        : clampSurfaceOpacity(value);
    const displayPercent = surfaceOpacityActualToDisplay(opacityPercent);
    state.surfaceOpacity = opacityPercent;
    document.documentElement.style.setProperty("--surface-opacity-factor", (opacityPercent / 100).toFixed(2));
    if (dom.surfaceOpacitySlider) dom.surfaceOpacitySlider.value = String(displayPercent);
    if (dom.surfaceOpacityValue) dom.surfaceOpacityValue.textContent = String(displayPercent);
}

function clampDefaultPdfZoom(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return 100;
    return Math.max(50, Math.min(150, n));
}

function applyDefaultPdfZoom(value) {
    const zoomPercent = clampDefaultPdfZoom(value);
    state.defaultPdfZoom = zoomPercent;
    if (dom.defaultPdfZoomSlider) dom.defaultPdfZoomSlider.value = String(zoomPercent);
    if (dom.defaultPdfZoomValue) dom.defaultPdfZoomValue.textContent = String(zoomPercent);
}

function clampTagGradientReach(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return 26;
    return Math.max(6, Math.min(80, n));
}

function applyTagGradientReach(value) {
    const reach = clampTagGradientReach(value);
    state.tagGradientReach = reach;
    if (dom.tagGradientReachSlider) dom.tagGradientReachSlider.value = String(reach);
    if (dom.tagGradientReachValue) dom.tagGradientReachValue.textContent = String(reach);
}

function clampPdfStarryBrightness(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return DEFAULT_PDF_STARRY_BRIGHTNESS;
    return Math.max(20, Math.min(180, n));
}

function clampPdfStarrySpeed(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return DEFAULT_PDF_STARRY_SPEED;
    return Math.max(30, Math.min(220, n));
}

function clampPdfStarryDensity(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return DEFAULT_PDF_STARRY_DENSITY;
    return Math.max(50, Math.min(160, n));
}

function clampPdfStarryStraightness(value) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return DEFAULT_PDF_STARRY_STRAIGHTNESS;
    return Math.max(0, Math.min(100, n));
}

function applyPdfStarryBackgroundSettings() {
    const stage = dom.pdfStage;
    if (!stage) return;

    const brightness = clampPdfStarryBrightness(state.pdfStarryBrightness);
    const speed = clampPdfStarrySpeed(state.pdfStarrySpeed);
    const density = clampPdfStarryDensity(state.pdfStarryDensity);
    const straightness = clampPdfStarryStraightness(state.pdfStarryStraightness);
    state.pdfStarryBrightness = brightness;
    state.pdfStarrySpeed = speed;
    state.pdfStarryDensity = density;
    state.pdfStarryStraightness = straightness;

    const brightnessScale = brightness / 100;
    const speedScale = speed / 100;
    const densityScale = 100 / density;
    const curveScale = 1 - (straightness / 100);
    const majorDriftX = -960 * densityScale;
    const majorDriftY = 640 * densityScale;
    const minorDriftX = -1280 * densityScale;
    const minorDriftY = -960 * densityScale;
    const buildCurvedMidpoint = (driftX, driftY, curveFactor) => {
        const length = Math.hypot(driftX, driftY) || 1;
        const perpendicularX = -driftY / length;
        const perpendicularY = driftX / length;
        const curveAmount = length * curveFactor * curveScale;
        return {
            x: (driftX * 0.5) + (perpendicularX * curveAmount),
            y: (driftY * 0.5) + (perpendicularY * curveAmount),
        };
    };
    const majorMidpoint = buildCurvedMidpoint(majorDriftX, majorDriftY, 0.22);
    const minorMidpoint = buildCurvedMidpoint(minorDriftX, minorDriftY, -0.18);

    stage.style.setProperty("--pdf-starfield-brightness", brightnessScale.toFixed(3));
    stage.style.setProperty("--pdf-starfield-speed-major", `${(82 / speedScale).toFixed(2)}s`);
    stage.style.setProperty("--pdf-starfield-speed-minor", `${(118 / speedScale).toFixed(2)}s`);
    stage.style.setProperty("--pdf-starfield-major-size-x", `${(960 * densityScale).toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-major-size-y", `${(640 * densityScale).toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-minor-size-x", `${(1280 * densityScale).toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-minor-size-y", `${(960 * densityScale).toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-major-drift-x", `${majorDriftX.toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-major-drift-y", `${majorDriftY.toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-major-mid-x", `${majorMidpoint.x.toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-major-mid-y", `${majorMidpoint.y.toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-minor-drift-x", `${minorDriftX.toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-minor-drift-y", `${minorDriftY.toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-minor-mid-x", `${minorMidpoint.x.toFixed(1)}px`);
    stage.style.setProperty("--pdf-starfield-minor-mid-y", `${minorMidpoint.y.toFixed(1)}px`);

    if (dom.pdfStarryBrightnessSlider) dom.pdfStarryBrightnessSlider.value = String(brightness);
    if (dom.pdfStarryBrightnessValue) dom.pdfStarryBrightnessValue.textContent = String(brightness);
    if (dom.pdfStarrySpeedSlider) dom.pdfStarrySpeedSlider.value = String(speed);
    if (dom.pdfStarrySpeedValue) dom.pdfStarrySpeedValue.textContent = String(speed);
    if (dom.pdfStarryDensitySlider) dom.pdfStarryDensitySlider.value = String(density);
    if (dom.pdfStarryDensityValue) dom.pdfStarryDensityValue.textContent = String(density);
    if (dom.pdfStarryStraightnessSlider) dom.pdfStarryStraightnessSlider.value = String(straightness);
    if (dom.pdfStarryStraightnessValue) dom.pdfStarryStraightnessValue.textContent = String(straightness);
}

const NIGHT_FILTER_MODES = new Set([
    "warm",
    "scalar_dimming",
    "soft_knee",
]);

const IDENTITY_COLOR_MATRIX = "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0";
const NIGHT_FILTER_TARGET_SELECTOR = [
    "#topbar",
    "main",
    "#drop-overlay",
    ".toast",
    ".thumbnail-undo",
    "#error-banner",
    "#edit-modal .modal-card",
    "#abstract-modal .modal-card",
    "#pdf-viewer-modal .modal-card",
    "#tag-color-editor .modal-card",
    "#theme-editor .modal-card",
    "#duplicate-modal .modal-card",
    "#hotkeys-modal .modal-card",
    "#backup-modal .modal-content",
].join(", ");

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

function setNightFilterTargetFilter(filterValue) {
    document.body.style.filter = "";
    document.querySelectorAll(NIGHT_FILTER_TARGET_SELECTOR).forEach((el) => {
        el.style.filter = filterValue;
    });
}

function forEachNightFilterControlSet(callback) {
    [
        {
            enabled: dom.nightFilterEnabled,
            controls: dom.nightFilterControls,
            mode: dom.nightFilterMode,
            strengthSlider: dom.nightFilterStrengthSlider,
            strengthValue: dom.nightFilterStrengthValue,
        },
        {
            enabled: dom.pdfNightFilterEnabled,
            controls: dom.pdfNightFilterControls,
            mode: dom.pdfNightFilterMode,
            strengthSlider: dom.pdfNightFilterStrengthSlider,
            strengthValue: dom.pdfNightFilterStrengthValue,
        },
    ].forEach((controlSet) => {
        if (!controlSet.enabled && !controlSet.controls && !controlSet.mode && !controlSet.strengthSlider && !controlSet.strengthValue) {
            return;
        }
        callback(controlSet);
    });
}

function applyNightFilter(modeValue, strengthValue) {
    const mode = normalizeNightFilterMode(modeValue);
    const strength = clampNightFilterStrength(strengthValue);
    const s = strength / 100;

    state.nightFilterMode = mode;
    state.nightFilterStrength = strength;

    forEachNightFilterControlSet((controlSet) => {
        if (controlSet.enabled) controlSet.enabled.checked = state.nightFilterEnabled;
        if (controlSet.mode) controlSet.mode.value = mode;
        if (controlSet.strengthSlider) controlSet.strengthSlider.value = String(strength);
        if (controlSet.strengthValue) controlSet.strengthValue.textContent = String(strength);
    });

    if (!state.nightFilterEnabled || strength <= 0) {
        setNightFilterTargetFilter("");
        setFilterMatrix(dom.nightFilterPreMatrix, IDENTITY_COLOR_MATRIX);
        setFilterMatrix(dom.nightFilterPostMatrix, IDENTITY_COLOR_MATRIX);
        if (dom.nightFilterFuncR) dom.nightFilterFuncR.setAttribute("tableValues", "0 1");
        if (dom.nightFilterFuncG) dom.nightFilterFuncG.setAttribute("tableValues", "0 1");
        if (dom.nightFilterFuncB) dom.nightFilterFuncB.setAttribute("tableValues", "0 1");
        return;
    }

    setNightFilterTargetFilter("url(#night-display-filter)");

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

function updateTagTintControlVisibility() {
    if (!dom.tagTintControls) return;
    const show = Boolean(state.tintByTag);
    dom.tagTintControls.classList.toggle("hidden", !show);
    dom.tagTintControls.querySelectorAll("input, button, select, textarea").forEach((el) => {
        el.disabled = !show;
    });
}

function updateNightFilterControlVisibility() {
    const show = Boolean(state.nightFilterEnabled);
    forEachNightFilterControlSet((controlSet) => {
        if (controlSet.enabled) controlSet.enabled.checked = state.nightFilterEnabled;
        if (!controlSet.controls) return;
        controlSet.controls.classList.toggle("hidden", !show);
        controlSet.controls.querySelectorAll("input, button, select, textarea").forEach((el) => {
            el.disabled = !show;
        });
    });
}

function bindNightFilterControlSet(controlSet) {
    if (controlSet.enabled) {
        controlSet.enabled.checked = state.nightFilterEnabled;
        controlSet.enabled.addEventListener("change", () => {
            state.nightFilterEnabled = controlSet.enabled.checked;
            window.localStorage.setItem(NIGHT_FILTER_ENABLED_KEY, state.nightFilterEnabled ? "true" : "false");
            updateNightFilterControlVisibility();
            applyNightFilter(state.nightFilterMode, state.nightFilterStrength);
        });
    }
    if (controlSet.mode) {
        controlSet.mode.value = state.nightFilterMode;
        controlSet.mode.addEventListener("change", () => {
            applyNightFilter(controlSet.mode.value, state.nightFilterStrength);
            window.localStorage.setItem("article-night-filter-mode", state.nightFilterMode);
        });
    }
    if (controlSet.strengthSlider) {
        const commitNightStrength = () => {
            applyNightFilter(state.nightFilterMode, controlSet.strengthSlider.value);
            window.localStorage.setItem("article-night-filter-strength", String(state.nightFilterStrength));
        };
        controlSet.strengthSlider.addEventListener("input", commitNightStrength);
        controlSet.strengthSlider.addEventListener("change", commitNightStrength);
        controlSet.strengthSlider.addEventListener("blur", commitNightStrength);
    }
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
    if (!state.displayMenuOpen) setThemeSelectMenuOpen(false);
    if (isOpen && state.filesMenuOpen) setFilesMenuOpen(false);
}

function updateFilesMenuViewportBounds() {
    if (!dom.filesMenu || dom.filesMenu.classList.contains("hidden")) return;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const boundaryGap = 18;
    const menuRect = dom.filesMenu.getBoundingClientRect();
    const availableHeight = Math.max(220, Math.floor(viewportHeight - menuRect.top - boundaryGap));
    dom.filesMenu.style.maxHeight = `${availableHeight}px`;
}

function setFilesMenuOpen(isOpen) {
    state.filesMenuOpen = Boolean(isOpen);
    dom.filesMenu.classList.toggle("hidden", !state.filesMenuOpen);
    dom.filesMenuToggle.setAttribute("aria-expanded", state.filesMenuOpen ? "true" : "false");
    if (isOpen && state.displayMenuOpen) setDisplayMenuOpen(false);
    if (state.filesMenuOpen) {
        updateFilesMenuViewportBounds();
    } else {
        dom.filesMenu.style.removeProperty("max-height");
    }
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

function wireRangeDoubleClickResets(container = document) {
    if (!container) return;
    const rangeInputs = Array.from(container.querySelectorAll('input[type="range"]'));
    rangeInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement) || input.dataset.dblclickResetBound === "true") return;
        input.dataset.dblclickResetBound = "true";
        input.addEventListener("dblclick", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();

            const fallbackValue = input.getAttribute("value") || input.defaultValue || input.min || "0";
            if (!fallbackValue) return;
            input.value = fallbackValue;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
    });
}

function trimErrorLogListToLimit() {
    if (!dom.errorLogList) return;
    const limit = getDebugLogEntryLimit();
    if (!Number.isFinite(limit)) return;
    while (dom.errorLogList.children.length > limit) {
        dom.errorLogList.removeChild(dom.errorLogList.lastChild);
    }
}

function syncExperimentalNestedOptions() {
    if (dom.longParseWrap) {
        dom.longParseWrap.classList.toggle("hidden", !dom.parsePdfs?.checked);
    }
    if (dom.enableAudioCheckbox) {
        dom.enableAudioCheckbox.checked = state.audioEnabled;
    }
    if (dom.audioVolumeField) {
        dom.audioVolumeField.classList.toggle("hidden", !state.audioEnabled);
    }
    if (dom.audioVolumeSlider) {
        dom.audioVolumeSlider.value = String(state.audioVolume);
    }
    if (dom.audioVolumeValue) {
        dom.audioVolumeValue.textContent = String(state.audioVolume);
    }
    if (dom.enablePdfTextSelectCheckbox) {
        dom.enablePdfTextSelectCheckbox.checked = state.enablePdfTextSelectTool;
    }
    if (dom.pdfCopyPreviewToggleWrap) {
        dom.pdfCopyPreviewToggleWrap.classList.toggle("hidden", !state.enablePdfCopyTool);
    }
    if (dom.previewCopiedTextCheckbox) {
        dom.previewCopiedTextCheckbox.checked = state.previewCopiedText;
    }
    if (dom.pdfCopyPreviewDurationField) {
        dom.pdfCopyPreviewDurationField.classList.toggle("hidden", !state.enablePdfCopyTool || !state.previewCopiedText);
    }
    if (dom.pdfCopyPreviewDurationSlider) {
        dom.pdfCopyPreviewDurationSlider.value = String(state.pdfCopyPreviewDurationSetting);
    }
    if (dom.pdfCopyPreviewDurationValue) {
        dom.pdfCopyPreviewDurationValue.textContent = formatInfiniteDurationLabel(state.pdfCopyPreviewDurationSetting);
    }
    if (dom.pdfStarryBrightnessField) {
        dom.pdfStarryBrightnessField.classList.toggle("hidden", !state.enablePdfStarryBackground);
    }
    if (dom.pdfStarrySpeedField) {
        dom.pdfStarrySpeedField.classList.toggle("hidden", !state.enablePdfStarryBackground);
    }
    if (dom.pdfStarryDensityField) {
        dom.pdfStarryDensityField.classList.toggle("hidden", !state.enablePdfStarryBackground);
    }
    if (dom.pdfStarryStraightnessField) {
        dom.pdfStarryStraightnessField.classList.toggle("hidden", !state.enablePdfStarryBackground);
    }
    applyPdfStarryBackgroundSettings();
    if (dom.debugModeOptions) {
        dom.debugModeOptions.classList.toggle("hidden", !state.debugMode);
    }
    if (dom.debugLogRetentionSlider) {
        dom.debugLogRetentionSlider.value = String(state.debugLogRetentionSetting);
    }
    if (dom.debugLogRetentionValue) {
        dom.debugLogRetentionValue.textContent = formatDebugLogRetentionLabel(state.debugLogRetentionSetting);
    }
    trimErrorLogListToLimit();
}

function setStatus(text, isWarning = false) {
    dom.statusLine.textContent = text;
    dom.statusLine.classList.toggle("warning", isWarning);
    if (isWarning) {
        logGlobalError(text, "", "");
    }
}

function pruneDoiFetchRateHistory(now = Date.now()) {
    state.doiFetchRecentTimestamps = state.doiFetchRecentTimestamps
        .filter((timestamp) => Number.isFinite(timestamp) && (now - timestamp) <= DOI_RATE_MONITOR_WINDOW_MS);
    return state.doiFetchRecentTimestamps;
}

function getDoiFetchWindowStats(now = Date.now()) {
    const timestamps = pruneDoiFetchRateHistory(now);
    const windowSeconds = Math.max(1, Math.round(DOI_RATE_MONITOR_WINDOW_MS / 1000));
    const estimatedLimitPerWindow = Math.max(1, Math.round(CROSSREF_ESTIMATED_POLITE_LIMIT_PER_SECOND * windowSeconds));
    return {
        timestamps,
        windowSeconds,
        estimatedLimitPerWindow,
        requestsMade: timestamps.length,
        remainingRequests: Math.max(0, estimatedLimitPerWindow - timestamps.length),
    };
}

function maybeWarnAboutDoiRateLimit(now = Date.now()) {
    const { timestamps } = getDoiFetchWindowStats(now);
    if (timestamps.length < DOI_RATE_WARNING_MIN_SAMPLE_SIZE) return;
    if ((now - state.lastDoiRateWarningAt) < DOI_RATE_WARNING_COOLDOWN_MS) return;

    const observedWindowMs = Math.max(DOI_RATE_WARNING_MIN_OBSERVATION_MS, now - timestamps[0]);
    const estimatedPerMinute = (timestamps.length / observedWindowMs) * 60_000;
    const estimatedLimitPerMinute = CROSSREF_ESTIMATED_POLITE_LIMIT_PER_SECOND * 60;
    const warningThresholdPerMinute = estimatedLimitPerMinute * DOI_RATE_WARNING_THRESHOLD_RATIO;
    if (estimatedPerMinute < warningThresholdPerMinute) return;

    state.lastDoiRateWarningAt = now;
    const recentSeconds = Math.max(10, Math.round(Math.min(observedWindowMs, DOI_RATE_MONITOR_WINDOW_MS) / 1000));
    const roundedEstimatedPerMinute = Math.max(10, Math.round(estimatedPerMinute / 10) * 10);
    const message = `DOI lookup pace may hit Crossref's estimated polite-pool limit soon (~${CROSSREF_ESTIMATED_POLITE_LIMIT_PER_SECOND} req/s, ~${estimatedLimitPerMinute}/min). Recent pace: ~${roundedEstimatedPerMinute}/min over the last ${recentSeconds}s.`;
    if (state.showErrorsGlobally) {
        showGlobalErrorBanner(message);
    }
}

function recordDoiFetchAttempt(now = Date.now()) {
    pruneDoiFetchRateHistory(now);
    state.doiFetchRecentTimestamps.push(now);
    const stats = getDoiFetchWindowStats(now);
    debugLog(
        `Crossref DOI rolling window (${stats.windowSeconds}s): ${stats.requestsMade}/${stats.estimatedLimitPerWindow} requests used, ${stats.remainingRequests} remaining.`,
    );
    maybeWarnAboutDoiRateLimit(now);
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
        trimErrorLogListToLimit();
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

function dedupeTagsCaseInsensitive(tags) {
    const seen = new Set();
    const result = [];
    for (const tag of tags || []) {
        const clean = normalizeWhitespace(tag);
        if (!clean) continue;
        const key = normalizeTagKey(clean);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(clean);
    }
    return result;
}

function buildArticleMetadataSnapshot(article) {
    const md = article?.metadata || {};
    return {
        title: normalizeWhitespace(md.title),
        authors: normalizeWhitespace(md.authors),
        year: normalizeWhitespace(md.year),
        journal: normalizeWhitespace(md.journal),
        volume: normalizeWhitespace(md.volume),
        number: normalizeWhitespace(md.number),
        pages: normalizeWhitespace(md.pages),
        doi: normalizeWhitespace(md.doi),
        abstract: typeof md.abstract === "string"
            ? md.abstract.replace(/\r\n/g, "\n")
            : normalizeWhitespace(md.abstract_text).replace(/\r\n/g, "\n"),
        tags: dedupeTagsCaseInsensitive(md.tags || []),
        notes: typeof md.notes === "string" ? md.notes.replace(/\r\n/g, "\n") : "",
        ref_dois: getReferenceDois(md),
    };
}

function buildEditorMetadataSnapshot() {
    return {
        title: dom.title.value.trim(),
        authors: dom.authors.value.trim(),
        year: dom.year.value.trim(),
        journal: dom.journal.value.trim(),
        volume: dom.volume.value.trim(),
        number: dom.issue.value.trim(),
        pages: dom.pages.value.trim(),
        doi: dom.doi.value.trim(),
        abstract: dom.abstract.value.replace(/\r\n/g, "\n"),
        tags: dedupeTagsCaseInsensitive(getTagChips()),
        notes: dom.notes.value.replace(/\r\n/g, "\n"),
        ref_dois: getReferenceDois(state.current?.metadata),
    };
}

function buildMetadataSnapshotKey(snapshot) {
    return JSON.stringify({
        title: snapshot.title || "",
        authors: snapshot.authors || "",
        year: snapshot.year || "",
        journal: snapshot.journal || "",
        volume: snapshot.volume || "",
        number: snapshot.number || "",
        pages: snapshot.pages || "",
        doi: snapshot.doi || "",
        abstract: snapshot.abstract || "",
        tags: dedupeTagsCaseInsensitive(snapshot.tags || []),
        notes: snapshot.notes || "",
    });
}

function updateMetadataDirtyIndicator() {
    if (!dom.metadataDirtyIndicator) return;
    const previousMode = state.metadataIndicatorMode;
    dom.metadataDirtyIndicator.classList.remove("is-idle", "is-dirty", "is-saving", "is-saved", "is-newly-saved");

    if (state.metadataSaving) {
        state.metadataIndicatorMode = "saving";
        dom.metadataDirtyIndicator.textContent = "Saving...";
        dom.metadataDirtyIndicator.classList.add("is-saving");
        return;
    }

    if (state.metadataDirty) {
        state.metadataIndicatorMode = "dirty";
        dom.metadataDirtyIndicator.textContent = "Unsaved changes";
        dom.metadataDirtyIndicator.classList.add("is-dirty");
        return;
    }

    if (!state.metadataSavedSinceOpen) {
        state.metadataIndicatorMode = "idle";
        dom.metadataDirtyIndicator.textContent = "";
        dom.metadataDirtyIndicator.classList.add("is-idle");
        return;
    }

    state.metadataIndicatorMode = "saved";
    dom.metadataDirtyIndicator.textContent = "Saved";
    dom.metadataDirtyIndicator.classList.add("is-saved");

    if (previousMode && previousMode !== "saved") {
        if (metadataSavedBlinkTimeout) {
            window.clearTimeout(metadataSavedBlinkTimeout);
            metadataSavedBlinkTimeout = null;
        }
        void dom.metadataDirtyIndicator.offsetWidth;
        dom.metadataDirtyIndicator.classList.add("is-newly-saved");
        metadataSavedBlinkTimeout = window.setTimeout(() => {
            dom.metadataDirtyIndicator?.classList.remove("is-newly-saved");
            metadataSavedBlinkTimeout = null;
        }, 1400);
    }
}

function clearMetadataChangeTracking() {
    state.metadataDirty = false;
    state.metadataSaving = false;
    state.metadataSavedSinceOpen = false;
    state.metadataBaselineKey = "";
    updateMetadataDirtyIndicator();
}

function setMetadataBaselineFromArticle(article, { markSaved = false } = {}) {
    state.metadataBaselineKey = buildMetadataSnapshotKey(buildArticleMetadataSnapshot(article));
    state.metadataDirty = false;
    state.metadataSaving = false;
    if (markSaved) {
        state.metadataSavedSinceOpen = true;
    }
    updateMetadataDirtyIndicator();
}

function refreshMetadataDirtyState() {
    if (!state.current || dom.modal.classList.contains("hidden")) {
        state.metadataDirty = false;
        updateMetadataDirtyIndicator();
        return;
    }
    state.metadataDirty = buildMetadataSnapshotKey(buildEditorMetadataSnapshot()) !== state.metadataBaselineKey;
    updateMetadataDirtyIndicator();
}

function setMetadataSavingState(isSaving) {
    state.metadataSaving = Boolean(isSaving);
    updateMetadataDirtyIndicator();
}

function syncRecentArticleHighlight() {
    document.querySelectorAll("[data-article-id]").forEach((node) => {
        node.classList.toggle("recently-selected", node.dataset.articleId === state.recentArticleId);
    });
}

function markArticleSelected(articleOrId) {
    const articleId = typeof articleOrId === "string" ? articleOrId : articleOrId?.id;
    if (!articleId) return;
    state.recentArticleId = articleId;
    syncRecentArticleHighlight();
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

function normalizePdfTextArtifacts(raw, options = {}) {
    const preserveParagraphBreaks = Boolean(options.preserveParagraphBreaks);
    let s = String(raw || "");
    if (!s) return "";

    if (typeof s.normalize === "function") {
        s = s.normalize("NFKC");
    }

    s = s.replace(/\r\n?/g, "\n");
    const paragraphSentinel = preserveParagraphBreaks ? "\uE001" : "";
    if (paragraphSentinel) {
        s = s.replace(/\n{2,}/g, paragraphSentinel);
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

    if (paragraphSentinel) {
        s = s.replace(/[ \t]*\n[ \t]*/g, " ");
        s = s.replace(/\s+/g, " ").trim();
        s = s.split(paragraphSentinel).map((part) => part.trim()).filter(Boolean).join("\n\n");
    } else {
        // Flatten remaining line breaks and normalize spacing.
        s = s.replace(/\n+/g, " ");
        s = s.replace(/\s+/g, " ").trim();
    }
    return s;
}

function normalizePdfAbstractText(raw) {
    return normalizePdfTextArtifacts(raw);
}

function cleanCopiedPdfRegionText(raw) {
    return normalizePdfTextArtifacts(raw, { preserveParagraphBreaks: true });
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
    for (const knownTag of (state.allKnownTags || [])) {
        const t = normalizeWhitespace(knownTag);
        if (t) set.add(t);
    }
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

function normalizeTagKey(tag) {
    return normalizeWhitespace(tag).toLowerCase();
}

function resolveKnownTagName(rawTag) {
    const key = normalizeTagKey(rawTag);
    if (!key) return "";
    return getAllKnownTags().find((tag) => normalizeTagKey(tag) === key) || "";
}

function pruneSelectedTagsToKnown() {
    const known = getAllKnownTags();
    const nextTags = [];
    let changed = false;

    for (const tag of state.tags) {
        const resolved = resolveKnownTagName(tag);
        if (!resolved) {
            changed = true;
            continue;
        }
        if (nextTags.some((existing) => normalizeTagKey(existing) === normalizeTagKey(resolved))) {
            changed = true;
            continue;
        }
        if (resolved !== tag) changed = true;
        nextTags.push(resolved);
    }

    if (changed) state.tags = nextTags;
    return changed;
}

function reconcileSelectedTagsAfterMetadataChange(previousTags, nextTags) {
    const before = dedupeTagsCaseInsensitive(previousTags || []);
    const after = dedupeTagsCaseInsensitive(nextTags || []);
    const removed = before.filter((tag) => !after.some((candidate) => normalizeTagKey(candidate) === normalizeTagKey(tag)));
    const added = after.filter((tag) => !before.some((candidate) => normalizeTagKey(candidate) === normalizeTagKey(tag)));

    if (removed.length === 1 && added.length === 1) {
        const removedKey = normalizeTagKey(removed[0]);
        const selectedIndex = state.tags.findIndex((tag) => normalizeTagKey(tag) === removedKey);
        if (selectedIndex >= 0) {
            const targetTag = added[0];
            if (state.tags.some((tag, index) => index !== selectedIndex && normalizeTagKey(tag) === normalizeTagKey(targetTag))) {
                state.tags = state.tags.filter((_, index) => index !== selectedIndex);
            } else {
                state.tags[selectedIndex] = targetTag;
            }
        }
    }

    return pruneSelectedTagsToKnown();
}

function tokenizeTagSuggestionText(text) {
    const tokens = String(text || "")
        .normalize("NFKC")
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) || [];

    return tokens.filter((token) => {
        if (!token) return false;
        if (TAG_SUGGESTION_STOPWORDS.has(token)) return false;
        return token.length >= 2 || /\d/.test(token);
    });
}

function addWeightedTagSuggestionTokens(vector, text, weight = 1) {
    if (!text || weight <= 0) return;
    for (const token of tokenizeTagSuggestionText(text)) {
        vector.set(token, (vector.get(token) || 0) + weight);
    }
}

function computeTagSuggestionNorm(vector) {
    let sum = 0;
    for (const value of vector.values()) {
        sum += value * value;
    }
    return Math.sqrt(sum);
}

function buildDraftTagSuggestionData() {
    const vector = new Map();
    const selectedTags = getTagChips();
    const parts = [
        dom.title.value,
        dom.authors.value,
        dom.journal.value,
        dom.doi.value,
        dom.abstract.value,
        dom.notes.value,
        selectedTags.join(" "),
    ];

    addWeightedTagSuggestionTokens(vector, dom.title.value, 5);
    addWeightedTagSuggestionTokens(vector, dom.authors.value, 2);
    addWeightedTagSuggestionTokens(vector, dom.journal.value, 2.5);
    addWeightedTagSuggestionTokens(vector, dom.doi.value, 1.5);
    addWeightedTagSuggestionTokens(vector, dom.abstract.value, 3);
    addWeightedTagSuggestionTokens(vector, dom.notes.value, 1.5);
    addWeightedTagSuggestionTokens(vector, selectedTags.join(" "), 5);

    return {
        vector,
        norm: computeTagSuggestionNorm(vector),
        tokenSet: new Set(vector.keys()),
        normalizedText: normalizeWhitespace(parts.join(" ").toLowerCase()),
        currentTagKeys: new Set(selectedTags.map(normalizeTagKey)),
    };
}

function buildArticleTagSuggestionSourceText(article) {
    if (article?.search_text) return article.search_text;
    const md = article?.metadata || {};
    return [
        article?.pdf_filename,
        article?.pdf_relpath,
        md.title,
        md.authors,
        md.year,
        md.journal,
        md.doi,
        md.abstract,
        md.abstract_text,
        Array.isArray(md.keywords) ? md.keywords.join(" ") : "",
        Array.isArray(md.tags) ? md.tags.join(" ") : "",
        md.notes,
    ].filter(Boolean).join(" ");
}

function getArticleTagSuggestionData(article) {
    const articleId = article?.id || article?.pdf_relpath || article?.pdf_filename || "";
    const sourceText = buildArticleTagSuggestionSourceText(article);
    const tags = Array.from(new Set((article?.metadata?.tags || []).map((tag) => normalizeWhitespace(tag)).filter(Boolean)));
    const signature = `${sourceText}\u001f${tags.join("\u001f")}`;
    const cached = tagSuggestionVectorCache.get(articleId);
    if (cached && cached.signature === signature) return cached;

    const vector = new Map();
    addWeightedTagSuggestionTokens(vector, sourceText, 1);

    const data = {
        signature,
        tags,
        tagKeys: new Set(tags.map(normalizeTagKey)),
        vector,
        norm: computeTagSuggestionNorm(vector),
    };
    tagSuggestionVectorCache.set(articleId, data);
    return data;
}

function computeTagSuggestionSimilarity(leftVector, leftNorm, rightVector, rightNorm) {
    if (!leftNorm || !rightNorm) return 0;
    const [smaller, larger] = leftVector.size <= rightVector.size
        ? [leftVector, rightVector]
        : [rightVector, leftVector];
    let dot = 0;
    for (const [token, value] of smaller.entries()) {
        const otherValue = larger.get(token);
        if (otherValue) dot += value * otherValue;
    }
    return dot / (leftNorm * rightNorm);
}

function computeTagLexicalBoost(tag, draftData) {
    const tokens = tokenizeTagSuggestionText(tag);
    if (tokens.length === 0) return 0;

    let overlap = 0;
    for (const token of tokens) {
        if (draftData.tokenSet.has(token)) overlap += 1;
    }

    let score = 0;
    if (overlap === tokens.length) {
        score += 0.95 + (Math.min(tokens.length, 4) * 0.08);
    } else if (overlap > 0) {
        score += 0.22 * (overlap / tokens.length);
    }

    const normalizedTag = normalizeWhitespace(tag).toLowerCase();
    if (normalizedTag.length >= 4 && draftData.normalizedText.includes(normalizedTag)) {
        score += 0.45;
    }
    return score;
}

function getTagSuggestionCorpus() {
    if (state.tagSuggestionCorpusMode === (state.demoMode ? "demo" : "primary")) {
        return state.tagSuggestionArticles;
    }
    return state.articles;
}

function computeTagSuggestions() {
    if (!state.current) return [];
    const draftData = buildDraftTagSuggestionData();
    if (draftData.norm === 0 && draftData.currentTagKeys.size === 0) return [];

    const scores = new Map();
    const corpus = getTagSuggestionCorpus() || [];
    const rankedArticles = [];

    for (const article of corpus) {
        if (!article || article.id === state.current.id) continue;
        const articleData = getArticleTagSuggestionData(article);
        if (articleData.tags.length === 0 || articleData.norm === 0) continue;

        let similarity = computeTagSuggestionSimilarity(
            draftData.vector,
            draftData.norm,
            articleData.vector,
            articleData.norm,
        );

        if (draftData.currentTagKeys.size > 0) {
            let overlap = 0;
            for (const tagKey of articleData.tagKeys) {
                if (draftData.currentTagKeys.has(tagKey)) overlap += 1;
            }
            if (overlap > 0) similarity += 0.28 * overlap;
        }

        if (similarity <= 0.05) continue;
        rankedArticles.push({ similarity, articleData });
    }

    rankedArticles.sort((a, b) => b.similarity - a.similarity);
    for (const { similarity, articleData } of rankedArticles.slice(0, 40)) {
        const perTagScore = similarity / Math.max(articleData.tags.length, 1);
        for (const tag of articleData.tags) {
            const tagKey = normalizeTagKey(tag);
            if (draftData.currentTagKeys.has(tagKey)) continue;
            scores.set(tag, (scores.get(tag) || 0) + perTagScore);
        }
    }

    for (const tag of getAllKnownTags()) {
        const tagKey = normalizeTagKey(tag);
        if (draftData.currentTagKeys.has(tagKey)) continue;
        const lexicalBoost = computeTagLexicalBoost(tag, draftData);
        if (lexicalBoost > 0) {
            scores.set(tag, (scores.get(tag) || 0) + lexicalBoost);
        }
    }

    return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TAG_SUGGESTION_LIMIT)
        .map(([tag]) => tag);
}

function hideTagSuggestions() {
    if (!dom.tagSuggestions || !dom.tagSuggestionsList) return;
    clearNode(dom.tagSuggestionsList);
    dom.tagSuggestions.classList.add("hidden");
}

function renderTagSuggestions(tags, { loading = false } = {}) {
    if (!dom.tagSuggestions || !dom.tagSuggestionsList) return;
    clearNode(dom.tagSuggestionsList);

    if (loading) {
        const placeholder = document.createElement("span");
        placeholder.className = "tag-suggestion-chip loading";
        placeholder.textContent = "Analyzing library...";
        dom.tagSuggestionsList.appendChild(placeholder);
        dom.tagSuggestions.classList.remove("hidden");
        return;
    }

    if (!tags || tags.length === 0) {
        dom.tagSuggestions.classList.add("hidden");
        return;
    }

    for (const tag of tags) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "tag-suggestion-chip";
        chip.dataset.skipAutosave = "true";
        chip.textContent = tag;
        chip.addEventListener("mousedown", (evt) => {
            evt.preventDefault();
            addTagChip(tag);
            dom.tagInput.focus();
        });
        dom.tagSuggestionsList.appendChild(chip);
    }
    dom.tagSuggestions.classList.remove("hidden");
}

function invalidateTagSuggestionCorpus() {
    state.tagSuggestionArticles = [];
    state.tagSuggestionCorpusMode = null;
    state.tagSuggestionCorpusLoaded = false;
    tagSuggestionCorpusPromise = null;
    tagSuggestionVectorCache.clear();
}

async function ensureTagSuggestionCorpus() {
    const modeKey = state.demoMode ? "demo" : "primary";
    if (state.tagSuggestionCorpusMode === modeKey && state.tagSuggestionCorpusLoaded) {
        return state.tagSuggestionArticles;
    }
    if (tagSuggestionCorpusPromise) return tagSuggestionCorpusPromise;

    tagSuggestionCorpusPromise = (async () => {
        const collected = [];
        let offset = 0;
        let total = Infinity;

        while (offset < total && collected.length < TAG_SUGGESTION_MAX_ARTICLES) {
            const response = await invoke("get_articles", {
                query: null,
                tags: null,
                matchMode: "all",
                filterIncomplete: false,
                limit: Math.min(TAG_SUGGESTION_BATCH_SIZE, TAG_SUGGESTION_MAX_ARTICLES - collected.length),
                offset,
            });
            const batch = response?.articles || [];
            total = Number(response?.total) || batch.length;
            if (batch.length === 0) break;
            collected.push(...batch);
            offset += batch.length;
            if (batch.length < TAG_SUGGESTION_BATCH_SIZE) break;
        }

        state.tagSuggestionArticles = collected;
        state.tagSuggestionCorpusMode = modeKey;
        state.tagSuggestionCorpusLoaded = true;
        return collected;
    })();

    try {
        return await tagSuggestionCorpusPromise;
    } finally {
        tagSuggestionCorpusPromise = null;
    }
}

function upsertTagSuggestionCorpusArticle(article) {
    if (!article?.id) return;
    tagSuggestionVectorCache.delete(article.id);
    const corpusMode = state.demoMode ? "demo" : "primary";
    if (state.tagSuggestionCorpusMode !== corpusMode) return;
    const existingIndex = state.tagSuggestionArticles.findIndex((entry) => entry.id === article.id);
    if (existingIndex >= 0) {
        state.tagSuggestionArticles[existingIndex] = article;
    } else if (state.tagSuggestionArticles.length > 0) {
        state.tagSuggestionArticles.push(article);
    }
}

function removeTagSuggestionCorpusArticle(articleId) {
    if (!articleId) return;
    tagSuggestionVectorCache.delete(articleId);
    if (state.tagSuggestionArticles.length === 0) return;
    state.tagSuggestionArticles = state.tagSuggestionArticles.filter((article) => article.id !== articleId);
}

function refreshTagSuggestions({ allowCorpusLoad = true } = {}) {
    if (!state.current || dom.modal.classList.contains("hidden")) {
        hideTagSuggestions();
        return;
    }

    const suggestions = computeTagSuggestions();
    renderTagSuggestions(suggestions);

    const modeKey = state.demoMode ? "demo" : "primary";
    if (allowCorpusLoad && state.tagSuggestionCorpusMode !== modeKey) {
        renderTagSuggestions(suggestions, { loading: suggestions.length === 0 });
        ensureTagSuggestionCorpus()
            .then(() => {
                if (state.current && !dom.modal.classList.contains("hidden")) {
                    refreshTagSuggestions({ allowCorpusLoad: false });
                }
            })
            .catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                debugLog(`Tag suggestion corpus load failed: ${message}`);
                if (state.current && !dom.modal.classList.contains("hidden")) {
                    refreshTagSuggestions({ allowCorpusLoad: false });
                }
            });
    }
}

const debouncedTagSuggestionRefresh = debounce(() => {
    refreshTagSuggestions();
}, 180);

function addTagChip(tag, { silent = false } = {}) {
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
    x.addEventListener("click", () => {
        chip.remove();
        debouncedTagSuggestionRefresh();
        refreshMetadataDirtyState();
    });
    chip.appendChild(x);
    // Insert before the input
    dom.tagChipContainer.insertBefore(chip, dom.tagInput);
    debouncedTagSuggestionRefresh();
    if (!silent) refreshMetadataDirtyState();
}

function setTagChips(tags, { silent = false } = {}) {
    // Remove existing chips
    dom.tagChipContainer.querySelectorAll(".tag-chip").forEach((c) => c.remove());
    for (const tag of tags) addTagChip(tag, { silent: true });
    refreshTagSuggestions({ allowCorpusLoad: false });
    if (!silent) refreshMetadataDirtyState();
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
    const normalizedQuery = normalizeWhitespace(query);
    if (!normalizedQuery) {
        dom.tagAutocomplete.classList.add("hidden");
        state.acIndex = -1;
        return;
    }
    const currentTags = new Set(getTagChips().map(normalizeTagKey));
    const allTags = getAllKnownTags().filter((t) => !currentTags.has(normalizeTagKey(t)));
    const matches = allTags
        .map((t) => fuzzyMatch(t, normalizedQuery))
        .filter((m) => m.match)
        .sort((a, b) => b.score - a.score);
    const queryKey = normalizeTagKey(normalizedQuery);
    const exactKnownMatch = allTags.some((tag) => normalizeTagKey(tag) === queryKey);
    const canCreateNew = !currentTags.has(queryKey) && !exactKnownMatch;
    if (matches.length === 0 && !canCreateNew) {
        dom.tagAutocomplete.classList.add("hidden");
        state.acIndex = -1;
        return;
    }
    state.acIndex = 0;
    const q = normalizedQuery.toLowerCase();

    if (canCreateNew) {
        const item = document.createElement("div");
        item.className = "ac-item new-tag active";
        item.dataset.tag = normalizedQuery;
        const label = document.createElement("span");
        label.className = "ac-label";
        label.textContent = normalizedQuery;
        const badge = document.createElement("span");
        badge.className = "ac-kind";
        badge.textContent = "new";
        item.appendChild(label);
        item.appendChild(badge);
        item.addEventListener("mousedown", (evt) => {
            evt.preventDefault(); // keep focus on input
            addTagChip(normalizedQuery);
            dom.tagInput.value = "";
            dom.tagAutocomplete.classList.add("hidden");
        });
        dom.tagAutocomplete.appendChild(item);
    }

    const maxExistingItems = canCreateNew ? 7 : 8;
    for (let i = 0; i < matches.length && i < maxExistingItems; i++) {
        const item = document.createElement("div");
        item.className = `ac-item existing-tag${!canCreateNew && i === 0 ? " active" : ""}`;
        // Highlight matching portion
        const tag = matches[i].tag;
        const idx = tag.toLowerCase().indexOf(q);
        const label = document.createElement("span");
        label.className = "ac-label";
        if (idx >= 0) {
            label.innerHTML =
                escapeHtml(tag.slice(0, idx)) +
                `<span class="ac-match">${escapeHtml(tag.slice(idx, idx + q.length))}</span>` +
                escapeHtml(tag.slice(idx + q.length));
        } else {
            label.textContent = tag;
        }
        const badge = document.createElement("span");
        badge.className = "ac-kind";
        badge.textContent = "known";
        item.appendChild(label);
        item.appendChild(badge);
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

function updateNicheTagAutocomplete(query) {
    if (!dom.nicheTagAutocomplete) return;
    clearNode(dom.nicheTagAutocomplete);
    const normalizedQuery = normalizeWhitespace(query);
    if (!normalizedQuery || !state.enableNiche || !state.showNiche) {
        dom.nicheTagAutocomplete.classList.add("hidden");
        state.nicheAcIndex = -1;
        return;
    }
    const currentTags = new Set(getNicheTagChips().map(normalizeTagKey));
    const allTags = getAllKnownTags().filter((t) => !currentTags.has(normalizeTagKey(t)));
    const matches = allTags
        .map((t) => fuzzyMatch(t, normalizedQuery))
        .filter((m) => m.match)
        .sort((a, b) => b.score - a.score);
    const queryKey = normalizeTagKey(normalizedQuery);
    const exactKnownMatch = allTags.some((tag) => normalizeTagKey(tag) === queryKey);
    const canCreateNew = !currentTags.has(queryKey) && !exactKnownMatch;
    if (matches.length === 0 && !canCreateNew) {
        dom.nicheTagAutocomplete.classList.add("hidden");
        state.nicheAcIndex = -1;
        return;
    }

    state.nicheAcIndex = 0;
    const q = normalizedQuery.toLowerCase();

    if (canCreateNew) {
        const item = document.createElement("div");
        item.className = "ac-item new-tag active";
        item.dataset.tag = normalizedQuery;
        const label = document.createElement("span");
        label.className = "ac-label";
        label.textContent = normalizedQuery;
        const badge = document.createElement("span");
        badge.className = "ac-kind";
        badge.textContent = "new";
        item.appendChild(label);
        item.appendChild(badge);
        item.addEventListener("mousedown", (evt) => {
            evt.preventDefault();
            addNicheTagChip(normalizedQuery);
            dom.nicheTagsInput.value = "";
            dom.nicheTagAutocomplete.classList.add("hidden");
        });
        dom.nicheTagAutocomplete.appendChild(item);
    }

    const maxExistingItems = canCreateNew ? 7 : 8;
    for (let i = 0; i < matches.length && i < maxExistingItems; i += 1) {
        const item = document.createElement("div");
        item.className = `ac-item existing-tag${!canCreateNew && i === 0 ? " active" : ""}`;
        const tag = matches[i].tag;
        const idx = tag.toLowerCase().indexOf(q);
        const label = document.createElement("span");
        label.className = "ac-label";
        if (idx >= 0) {
            label.innerHTML =
                escapeHtml(tag.slice(0, idx)) +
                `<span class="ac-match">${escapeHtml(tag.slice(idx, idx + q.length))}</span>` +
                escapeHtml(tag.slice(idx + q.length));
        } else {
            label.textContent = tag;
        }
        const badge = document.createElement("span");
        badge.className = "ac-kind";
        badge.textContent = "known";
        item.appendChild(label);
        item.appendChild(badge);
        item.dataset.tag = tag;
        item.addEventListener("mousedown", (evt) => {
            evt.preventDefault();
            addNicheTagChip(tag);
            dom.nicheTagsInput.value = "";
            dom.nicheTagAutocomplete.classList.add("hidden");
        });
        dom.nicheTagAutocomplete.appendChild(item);
    }

    dom.nicheTagAutocomplete.classList.remove("hidden");
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeMarkdownHref(rawHref) {
    const trimmed = String(rawHref || "").trim();
    if (!trimmed) return "";
    const normalized = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
    try {
        const parsed = new URL(normalized, window.location.href);
        if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
            return parsed.href;
        }
    } catch {
        return "";
    }
    return "";
}

function renderMarkdownInline(text) {
    const source = String(text || "");
    const tokenPattern = /(`([^`\n]+)`)|(\[([^\]\n]+)\]\(([^)\n]+)\))|(\*\*([^\n]+?)\*\*|__([^\n]+?)__)|(\*([^*\n]+)\*|_([^_\n]+)_)|(~~([^~\n]+)~~)|((?:https?:\/\/|www\.)[^\s<]+)/g;
    let html = "";
    let lastIndex = 0;

    for (const match of source.matchAll(tokenPattern)) {
        const index = Number.isInteger(match.index) ? match.index : 0;
        html += escapeHtml(source.slice(lastIndex, index));

        if (match[2] !== undefined) {
            html += `<code>${escapeHtml(match[2])}</code>`;
        } else if (match[4] !== undefined && match[5] !== undefined) {
            const safeHref = sanitizeMarkdownHref(match[5]);
            const labelHtml = renderMarkdownInline(match[4]);
            html += safeHref
                ? `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`
                : labelHtml;
        } else if (match[7] !== undefined || match[8] !== undefined) {
            const content = match[7] !== undefined ? match[7] : match[8];
            html += `<strong>${renderMarkdownInline(content)}</strong>`;
        } else if (match[10] !== undefined || match[11] !== undefined) {
            const content = match[10] !== undefined ? match[10] : match[11];
            html += `<em>${renderMarkdownInline(content)}</em>`;
        } else if (match[13] !== undefined) {
            html += `<del>${renderMarkdownInline(match[13])}</del>`;
        } else if (match[14] !== undefined) {
            const safeHref = sanitizeMarkdownHref(match[14]);
            html += safeHref
                ? `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[14])}</a>`
                : escapeHtml(match[14]);
        } else {
            html += escapeHtml(match[0]);
        }

        lastIndex = index + match[0].length;
    }

    html += escapeHtml(source.slice(lastIndex));
    return html;
}

function renderMarkdownParagraph(text) {
    return text
        .split("\n")
        .map((line) => renderMarkdownInline(line))
        .join("<br>");
}

function consumeMarkdownList(lines, startIndex, ordered) {
    const matcher = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[*+-]\s+(.*)$/;
    const tagName = ordered ? "ol" : "ul";
    const items = [];
    let index = startIndex;

    while (index < lines.length) {
        const line = lines[index];
        const match = line.match(matcher);
        if (!match) break;

        const itemLines = [match[1]];
        index += 1;

        while (index < lines.length) {
            const nextLine = lines[index];
            if (!nextLine.trim()) break;
            if (matcher.test(nextLine)) break;
            if (!/^\s+/.test(nextLine) && isMarkdownBlockBoundary(nextLine)) break;
            itemLines.push(nextLine.replace(/^\s+/, ""));
            index += 1;
        }

        items.push(`<li>${renderMarkdownParagraph(itemLines.join("\n"))}</li>`);

        while (index < lines.length && !lines[index].trim()) {
            if (index + 1 < lines.length && lines[index + 1].match(matcher)) {
                index += 1;
                break;
            }
            index += 1;
        }
    }

    return {
        html: `<${tagName}>${items.join("")}</${tagName}>`,
        nextIndex: index,
    };
}

function isMarkdownBlockBoundary(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return true;
    return /^#{1,6}\s+/.test(trimmed) ||
        /^```/.test(trimmed) ||
        /^>\s?/.test(trimmed) ||
        /^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed) ||
        /^\s*[*+-]\s+/.test(line) ||
        /^\s*\d+\.\s+/.test(line);
}

function renderMarkdownToHtml(markdown) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            index += 1;
            continue;
        }

        if (/^```/.test(trimmed)) {
            const codeLines = [];
            index += 1;
            while (index < lines.length && !/^```/.test(lines[index].trim())) {
                codeLines.push(lines[index]);
                index += 1;
            }
            if (index < lines.length && /^```/.test(lines[index].trim())) index += 1;
            blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            blocks.push(`<h${level}>${renderMarkdownInline(headingMatch[2])}</h${level}>`);
            index += 1;
            continue;
        }

        if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
            blocks.push("<hr>");
            index += 1;
            continue;
        }

        if (/^>\s?/.test(trimmed)) {
            const quoteLines = [];
            while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
                quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
                index += 1;
            }
            blocks.push(`<blockquote>${renderMarkdownToHtml(quoteLines.join("\n"))}</blockquote>`);
            continue;
        }

        if (/^\s*[*+-]\s+/.test(line)) {
            const list = consumeMarkdownList(lines, index, false);
            blocks.push(list.html);
            index = list.nextIndex;
            continue;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
            const list = consumeMarkdownList(lines, index, true);
            blocks.push(list.html);
            index = list.nextIndex;
            continue;
        }

        const paragraphLines = [line];
        index += 1;
        while (index < lines.length && lines[index].trim() && !isMarkdownBlockBoundary(lines[index])) {
            paragraphLines.push(lines[index]);
            index += 1;
        }
        blocks.push(`<p>${renderMarkdownParagraph(paragraphLines.join("\n"))}</p>`);
    }

    return blocks.join("");
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

function pageCountValue(article) {
    const count = Number(article?.page_count);
    return Number.isFinite(count) ? count : 0;
}

function compareSortKey(a, b, key) {
    const aMd = a.metadata || {};
    const bMd = b.metadata || {};
    switch (key) {
        case "year_desc":
            return yearValue(b) - yearValue(a);
        case "year_asc":
            return yearValue(a) - yearValue(b);
        case "page_count_desc":
            return pageCountValue(b) - pageCountValue(a);
        case "page_count_asc":
            return pageCountValue(a) - pageCountValue(b);
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
    if (!enabled && dom.nicheTagAutocomplete) {
        dom.nicheTagAutocomplete.classList.add("hidden");
        state.nicheAcIndex = -1;
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

function splitPdfViewerAuthorDisplayParts(authorsRaw) {
    const normalized = normalizeWhitespace(authorsRaw);
    if (!normalized) return [];
    if (normalized.includes(";")) {
        return normalized
            .split(/\s*;\s*/)
            .map((part) => normalizeWhitespace(part))
            .filter(Boolean);
    }
    const parts = splitAuthors(normalized);
    return parts.length > 0 ? parts : [normalized];
}

function normalizePdfZoomMode(mode) {
    if (mode === "fit-page" || mode === "custom") return mode;
    return "fit-width";
}

function clampPdfZoomScale(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.max(0.35, Math.min(4, numeric));
}

function normalizePdfCapturePreset(value) {
    const preset = normalizeWhitespace(value).toLowerCase().replace(/\s+/g, "_");
    return PDF_CAPTURE_PRESET_KEYS.has(preset) ? preset : "thumbnail";
}

function getPdfCapturePresetRatio(preset) {
    switch (normalizePdfCapturePreset(preset)) {
        case "square":
            return 1;
        case "tall":
            return 4 / 5;
        case "free":
            return null;
        case "thumbnail":
        default:
            return PDF_CAPTURE_THUMBNAIL_W / PDF_CAPTURE_THUMBNAIL_H;
    }
}

function getPdfCapturePresetLabel(preset) {
    switch (normalizePdfCapturePreset(preset)) {
        case "square":
            return "Square";
        case "tall":
            return "Tall detail";
        case "free":
            return "Free crop";
        case "thumbnail":
        default:
            return "Thumbnail";
    }
}

function clampPdfPage(pageNumber) {
    const numeric = Number.parseInt(String(pageNumber), 10);
    if (!Number.isFinite(numeric)) return 1;
    const maxPage = Math.max(1, pdfViewer.pageCount || 1);
    return Math.max(1, Math.min(maxPage, numeric));
}

function isPdfViewerOpen() {
    return Boolean(dom.pdfViewerModal && !dom.pdfViewerModal.classList.contains("hidden"));
}

function readPdfViewerStateMap() {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(PDF_VIEWER_STATE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function readSavedPdfViewerState(articleId) {
    if (!articleId) return null;
    const store = readPdfViewerStateMap();
    const raw = store[articleId];
    if (!raw || typeof raw !== "object") return null;
    return {
        page: Number.parseInt(raw.page, 10) || 1,
        zoomMode: normalizePdfZoomMode(raw.zoomMode),
        zoomScale: clampPdfZoomScale(raw.zoomScale),
    };
}

function persistPdfViewerState() {
    const articleId = pdfViewer.article?.id;
    if (!articleId) return;
    const store = readPdfViewerStateMap();
    store[articleId] = {
        page: clampPdfPage(pdfViewer.page),
        zoomMode: normalizePdfZoomMode(pdfViewer.zoomMode),
        zoomScale: clampPdfZoomScale(pdfViewer.zoomScale),
        updated_at: new Date().toISOString(),
    };
    window.localStorage.setItem(PDF_VIEWER_STATE_KEY, JSON.stringify(store));
}

function buildPdfViewerMeta(article) {
    const md = article?.metadata || {};
    const yearText = normalizeWhitespace(md.year);
    const authorsText = normalizeWhitespace(md.authors);
    const journalText = normalizeWhitespace(md.journal);
    const authorParts = splitPdfViewerAuthorDisplayParts(authorsText);
    const primaryBits = [];
    const secondaryBits = [];
    if (yearText) primaryBits.push(yearText);
    if (journalText) secondaryBits.push(journalText);
    if (pdfViewer.pageCount > 0) {
        secondaryBits.push(`${pdfViewer.pageCount} page${pdfViewer.pageCount === 1 ? "" : "s"}`);
    }
    return {
        yearText: primaryBits.join(" | "),
        authorsText,
        authorParts,
        secondary: secondaryBits.join(" | "),
    };
}

function renderPdfViewerPrimaryMeta(meta) {
    if (!dom.pdfViewerMeta) return;
    clearNode(dom.pdfViewerMeta);
    if (!meta) return;

    if (meta.yearText) {
        dom.pdfViewerMeta.append(document.createTextNode(meta.yearText));
    }

    const displayAuthors = meta.authorParts?.length ? meta.authorParts : (meta.authorsText ? [meta.authorsText] : []);
    if (displayAuthors.length === 0) return;

    if (meta.yearText) {
        dom.pdfViewerMeta.append(document.createTextNode(" | "));
    }

    const firstAuthor = document.createElement("strong");
    firstAuthor.textContent = displayAuthors[0];
    dom.pdfViewerMeta.append(firstAuthor);

    if (displayAuthors.length > 1) {
        dom.pdfViewerMeta.append(document.createTextNode(`, ${displayAuthors.slice(1).join(", ")}`));
    }
}

function updatePdfViewerHeader() {
    if (dom.pdfViewerTitle) {
        dom.pdfViewerTitle.textContent = pdfViewer.article
            ? (normalizeWhitespace(pdfViewer.article.metadata?.title) || pdfViewer.article.pdf_filename || "Reader")
            : "Reader";
    }
    const meta = pdfViewer.article ? buildPdfViewerMeta(pdfViewer.article) : null;
    renderPdfViewerPrimaryMeta(meta);
    if (dom.pdfViewerSubmeta) {
        dom.pdfViewerSubmeta.textContent = meta?.secondary || "";
        dom.pdfViewerSubmeta.classList.toggle("hidden", !meta?.secondary);
    }
}

function setPdfViewerStatus(text = "", isWarning = false) {
    if (!dom.pdfViewerStatus) return;
    dom.pdfViewerStatus.textContent = text;
    dom.pdfViewerStatus.classList.toggle("hidden", !text);
    dom.pdfViewerStatus.classList.toggle("warning", Boolean(text) && isWarning);
}

function updatePdfSearchStatus(text = "") {
    if (!dom.pdfSearchStatus) return;
    dom.pdfSearchStatus.textContent = text || "Search all pages";
}

function getPdfViewerModalCard() {
    return dom.pdfViewerModal?.querySelector(".pdf-viewer-modal-card") || null;
}

function getPdfPageOverlayLayer(pageNumber) {
    return pdfViewer.pageOverlayLayers.get(pageNumber) || null;
}

function getPdfPageCanvas(pageNumber) {
    return pdfViewer.pageCanvases.get(pageNumber) || null;
}

function getPdfPageShell(pageNumber) {
    return pdfViewer.pageShells.get(pageNumber) || null;
}

function clampPdfToolRect(rect, bounds, minimum = 18) {
    const minWidth = Math.max(1, minimum);
    const minHeight = Math.max(1, minimum);
    const maxWidth = Math.max(minWidth, bounds.width);
    const maxHeight = Math.max(minHeight, bounds.height);
    const width = Math.min(Math.max(rect.width, minWidth), maxWidth);
    const height = Math.min(Math.max(rect.height, minHeight), maxHeight);
    const left = Math.min(Math.max(rect.left, 0), Math.max(0, bounds.width - width));
    const top = Math.min(Math.max(rect.top, 0), Math.max(0, bounds.height - height));
    return { left, top, width, height };
}

function getPdfPageBounds(pageNumber) {
    const surface = getPdfPageCanvas(pageNumber) || getPdfPageShell(pageNumber);
    if (!surface) return { width: 0, height: 0 };
    return {
        width: Math.max(1, surface.clientWidth || surface.offsetWidth || 0),
        height: Math.max(1, surface.clientHeight || surface.offsetHeight || 0),
    };
}

function createDefaultPdfCaptureRect(pageNumber, preset = pdfViewer.capturePreset, center = null) {
    const bounds = getPdfPageBounds(pageNumber);
    if (!bounds.width || !bounds.height) {
        return { left: 0, top: 0, width: 0, height: 0 };
    }

    const ratio = getPdfCapturePresetRatio(preset);
    const targetWidth = bounds.width * 0.58;
    const targetHeight = bounds.height * 0.32;
    let width = targetWidth;
    let height = targetHeight;

    if (ratio) {
        width = Math.min(bounds.width * 0.72, Math.max(140, targetWidth));
        height = width / ratio;
        if (height > bounds.height * 0.72) {
            height = bounds.height * 0.72;
            width = height * ratio;
        }
    } else {
        width = Math.min(bounds.width * 0.72, Math.max(150, targetWidth));
        height = Math.min(bounds.height * 0.42, Math.max(120, targetHeight));
    }

    const desiredLeft = center
        ? center.x - (width / 2)
        : (bounds.width - width) / 2;
    const desiredTop = center
        ? center.y - (height / 2)
        : (bounds.height - height) / 2;

    return clampPdfToolRect({
        left: desiredLeft,
        top: desiredTop,
        width,
        height,
    }, bounds, 28);
}

function clearPdfCapturePreview() {
    if (!dom.pdfCapturePreview) return;
    const ctx = dom.pdfCapturePreview.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, dom.pdfCapturePreview.width, dom.pdfCapturePreview.height);
}

function clearPdfToolSession() {
    pdfViewer.toolSession = null;
}

function getActivePdfSearchMatch() {
    const index = pdfViewer.searchMatchIndex;
    if (index < 0) return null;
    return pdfViewer.searchMatches[index] || null;
}

function getPdfSearchMatchesForPage(pageNumber) {
    if (!Array.isArray(pdfViewer.searchMatches) || pdfViewer.searchMatches.length === 0) return [];
    return pdfViewer.searchMatches.filter((match) => match.pageNumber === pageNumber);
}

function scalePdfRelativeRectToPage(pageNumber, rect) {
    const bounds = getPdfPageBounds(pageNumber);
    return {
        left: rect.leftRatio * bounds.width,
        top: rect.topRatio * bounds.height,
        width: rect.widthRatio * bounds.width,
        height: rect.heightRatio * bounds.height,
    };
}

function clearPdfCopyRegionDebugMatches() {
    pdfViewer.copyRegionDebugMatches = [];
    pdfViewer.copyRegionDebugPageNumber = 0;
    pdfViewer.copyRegionDebugReady = false;
    pdfViewer.copyRegionDebugRequestId += 1;
}

function syncPdfCopyRegionDebugMatches() {
    const requestId = pdfViewer.copyRegionDebugRequestId + 1;
    pdfViewer.copyRegionDebugRequestId = requestId;

    if (pdfViewer.toolMode !== "copy-region" || !pdfViewer.copyRegionPageNumber || !pdfViewer.copyRegionRect) {
        clearPdfCopyRegionDebugMatches();
        return;
    }

    const pageNumber = pdfViewer.copyRegionPageNumber;
    const rect = pdfViewer.copyRegionRect;
    pdfViewer.copyRegionDebugPageNumber = pageNumber;
    pdfViewer.copyRegionDebugReady = false;
    pdfViewer.copyRegionDebugMatches = [];

    const applyMatches = (items) => {
        if (pdfViewer.copyRegionDebugRequestId !== requestId) return;
        if (pdfViewer.toolMode !== "copy-region" || pdfViewer.copyRegionPageNumber !== pageNumber || pdfViewer.copyRegionRect !== rect) {
            return;
        }
        pdfViewer.copyRegionDebugPageNumber = pageNumber;
        pdfViewer.copyRegionDebugReady = true;
        pdfViewer.copyRegionDebugMatches = items.filter((item) => rectsIntersect(item, rect));
        renderPdfPageToolOverlay(pageNumber);
    };

    const scaleKey = getPdfEffectiveScale().toFixed(4);
    const cached = pdfViewer.pageTextGeometryCache.get(pageNumber);
    if (cached?.scaleKey === scaleKey) {
        applyMatches(cached.items);
        return;
    }

    ensurePdfPageTextGeometry(pageNumber)
        .then(applyMatches)
        .catch(() => {
            if (pdfViewer.copyRegionDebugRequestId !== requestId) return;
            pdfViewer.copyRegionDebugReady = true;
            pdfViewer.copyRegionDebugMatches = [];
            renderPdfPageToolOverlay(pageNumber);
        });
}

function renderPdfPageToolOverlay(pageNumber) {
    const overlay = getPdfPageOverlayLayer(pageNumber);
    if (!overlay) return;
    overlay.replaceChildren();

    const pageSearchMatches = getPdfSearchMatchesForPage(pageNumber);
    const activeSearchMatch = getActivePdfSearchMatch();
    pageSearchMatches.forEach((match) => {
        const isActive = activeSearchMatch === match;
        match.rects.forEach((rect, rectIndex) => {
            const scaledRect = scalePdfRelativeRectToPage(pageNumber, rect);
            const hitEl = document.createElement("div");
            hitEl.className = `pdf-search-hit${isActive ? " is-active" : ""}`;
            hitEl.style.left = `${scaledRect.left}px`;
            hitEl.style.top = `${scaledRect.top}px`;
            hitEl.style.width = `${scaledRect.width}px`;
            hitEl.style.height = `${scaledRect.height}px`;

            if (isActive && rectIndex === 0) {
                const badge = document.createElement("div");
                badge.className = "pdf-search-hit-badge";
                badge.textContent = `${pdfViewer.searchMatchIndex + 1}/${pdfViewer.searchMatches.length}`;
                hitEl.appendChild(badge);
            }

            overlay.appendChild(hitEl);
        });
    });

    const copyRect = pdfViewer.toolMode === "copy-region" && pdfViewer.copyRegionPageNumber === pageNumber
        ? pdfViewer.copyRegionRect
        : null;
    if (copyRect) {
        const selectionEl = document.createElement("div");
        selectionEl.className = "pdf-tool-box pdf-region-copy-box";
        selectionEl.style.left = `${copyRect.left}px`;
        selectionEl.style.top = `${copyRect.top}px`;
        selectionEl.style.width = `${copyRect.width}px`;
        selectionEl.style.height = `${copyRect.height}px`;

        const debugLabel = document.createElement("div");
        debugLabel.className = "pdf-region-copy-debug-label";
        if (pdfViewer.copyRegionDebugPageNumber === pageNumber && pdfViewer.copyRegionDebugReady) {
            const count = pdfViewer.copyRegionDebugMatches.length;
            debugLabel.textContent = `${count} detected text box${count === 1 ? "" : "es"}`;
        } else {
            debugLabel.textContent = "Scanning text boxes...";
        }
        selectionEl.appendChild(debugLabel);
        overlay.appendChild(selectionEl);

        if (pdfViewer.copyRegionDebugPageNumber === pageNumber) {
            pdfViewer.copyRegionDebugMatches.forEach((item) => {
                const hitEl = document.createElement("div");
                hitEl.className = "pdf-copy-region-detected-hit";
                hitEl.style.left = `${item.left}px`;
                hitEl.style.top = `${item.top}px`;
                hitEl.style.width = `${item.width}px`;
                hitEl.style.height = `${item.height}px`;
                overlay.appendChild(hitEl);
            });
        }
    }

    const captureRect = pdfViewer.capturePageNumber === pageNumber ? pdfViewer.captureRect : null;
    if (captureRect) {
        const captureEl = document.createElement("div");
        captureEl.className = "pdf-tool-box pdf-capture-box";
        captureEl.style.left = `${captureRect.left}px`;
        captureEl.style.top = `${captureRect.top}px`;
        captureEl.style.width = `${captureRect.width}px`;
        captureEl.style.height = `${captureRect.height}px`;

        const label = document.createElement("div");
        label.className = "pdf-capture-box-label";
        label.textContent = getPdfCapturePresetLabel(pdfViewer.capturePreset);
        captureEl.appendChild(label);

        ["top-left", "top-right", "bottom-left", "bottom-right"].forEach((corner) => {
            const handle = document.createElement("div");
            handle.className = "pdf-capture-box-handle";
            handle.dataset.corner = corner;
            captureEl.appendChild(handle);
        });

        overlay.appendChild(captureEl);
    }
}

function renderPdfToolOverlays() {
    for (let pageNumber = 1; pageNumber <= pdfViewer.pageCount; pageNumber += 1) {
        renderPdfPageToolOverlay(pageNumber);
    }
}

function requestPdfCapturePreviewRender() {
    if (pdfViewer.previewFramePending) return;
    pdfViewer.previewFramePending = true;
    requestAnimationFrame(() => {
        pdfViewer.previewFramePending = false;
        renderPdfCapturePreview();
    });
}

function syncPdfToolPanel() {
    const textSelectActive = isPdfTextSelectToolActive();
    if (dom.pdfToolPanel) {
        const showPanel = pdfViewer.toolMode === "copy-region" || pdfViewer.toolMode === "capture-thumbnail" || textSelectActive;
        dom.pdfToolPanel.classList.toggle("hidden", !showPanel);
    }
    if (dom.pdfCopyRegionHint) {
        dom.pdfCopyRegionHint.classList.toggle("hidden", pdfViewer.toolMode !== "copy-region");
    }
    if (dom.pdfTextSelectHint) {
        dom.pdfTextSelectHint.classList.toggle("hidden", !textSelectActive);
    }
    if (dom.pdfCapturePanel) {
        dom.pdfCapturePanel.classList.toggle("hidden", pdfViewer.toolMode !== "capture-thumbnail");
    }
    if (dom.pdfCopyRegionToggle) {
        dom.pdfCopyRegionToggle.classList.toggle("hidden", !state.enablePdfCopyTool || pdfViewer.toolMode === "capture-thumbnail");
        dom.pdfCopyRegionToggle.classList.toggle("is-active", pdfViewer.toolMode === "copy-region");
    }
    if (dom.pdfTextSelectToggle) {
        dom.pdfTextSelectToggle.classList.toggle("hidden", !state.enablePdfTextSelectTool || pdfViewer.toolMode === "capture-thumbnail");
        dom.pdfTextSelectToggle.classList.toggle("is-active", textSelectActive);
    }
    if (dom.pdfCaptureThumbnailToggle) {
        dom.pdfCaptureThumbnailToggle.classList.toggle("hidden", pdfViewer.toolMode === "capture-thumbnail");
        dom.pdfCaptureThumbnailToggle.classList.toggle("is-active", pdfViewer.toolMode === "capture-thumbnail");
    }
    if (dom.pdfCapturePreset) {
        dom.pdfCapturePreset.value = normalizePdfCapturePreset(pdfViewer.capturePreset);
    }
    if (dom.pdfCanvasWrap) {
        dom.pdfCanvasWrap.classList.toggle("is-tool-active", pdfViewer.toolMode === "copy-region" || pdfViewer.toolMode === "capture-thumbnail");
    }
    pdfViewer.pageShells.forEach((shell) => {
        shell.classList.toggle("is-tool-active", pdfViewer.toolMode === "copy-region" || (pdfViewer.toolMode === "capture-thumbnail" && Number.parseInt(shell.dataset.pageNumber || "", 10) === pdfViewer.capturePageNumber));
        shell.classList.toggle("is-text-select-active", textSelectActive);
    });
}

function syncPdfViewerChromeState() {
    const card = getPdfViewerModalCard();
    if (card) {
        card.classList.remove("is-zen");
        card.classList.toggle("is-header-folded", pdfViewer.headerFolded);
    }
    if (dom.pdfToggleHeaderFold) {
        const isExpanded = !pdfViewer.headerFolded;
        dom.pdfToggleHeaderFold.textContent = isExpanded ? "\u25b2" : "\u25bc";
        dom.pdfToggleHeaderFold.setAttribute("aria-pressed", pdfViewer.headerFolded ? "true" : "false");
        dom.pdfToggleHeaderFold.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        dom.pdfToggleHeaderFold.setAttribute("aria-label", isExpanded ? "Hide reader controls" : "Show reader controls");
        dom.pdfToggleHeaderFold.title = isExpanded ? "Hide reader controls" : "Show reader controls";
    }
}

function setPdfHeaderFolded(nextValue) {
    pdfViewer.headerFolded = Boolean(nextValue);
    syncPdfViewerChromeState();
}

function syncPdfExperimentalToolVisibility() {
    if (dom.enablePdfCopyToolCheckbox) {
        dom.enablePdfCopyToolCheckbox.checked = state.enablePdfCopyTool;
    }
    if (dom.enablePdfTextSelectCheckbox) {
        dom.enablePdfTextSelectCheckbox.checked = state.enablePdfTextSelectTool;
    }
    if (dom.downscalePdfCaptureImagesCheckbox) {
        dom.downscalePdfCaptureImagesCheckbox.checked = state.downscalePdfCaptureImages;
    }
    if (dom.enablePdfStarryBackgroundCheckbox) {
        dom.enablePdfStarryBackgroundCheckbox.checked = state.enablePdfStarryBackground;
    }
    if (dom.unlockPdfViewerWidthCheckbox) {
        dom.unlockPdfViewerWidthCheckbox.checked = state.unlockPdfViewerWidth;
    }
    if (dom.pdfStage) {
        dom.pdfStage.classList.toggle("pdf-stage-starry", state.enablePdfStarryBackground);
    }
    applyPdfStarryBackgroundSettings();
    const viewerCard = getPdfViewerModalCard();
    if (viewerCard) {
        viewerCard.classList.toggle("is-width-unlocked", state.unlockPdfViewerWidth);
    }
    if (dom.pdfCopyRegionToggle) {
        dom.pdfCopyRegionToggle.classList.toggle("hidden", !state.enablePdfCopyTool || pdfViewer.toolMode === "capture-thumbnail");
    }
    if (dom.pdfTextSelectToggle) {
        dom.pdfTextSelectToggle.classList.toggle("hidden", !state.enablePdfTextSelectTool || pdfViewer.toolMode === "capture-thumbnail");
    }
    if (dom.pdfCaptureThumbnailToggle) {
        dom.pdfCaptureThumbnailToggle.classList.toggle("hidden", pdfViewer.toolMode === "capture-thumbnail");
    }
    if (!state.enablePdfCopyTool && pdfViewer.toolMode === "copy-region") {
        pdfViewer.toolMode = "none";
        pdfViewer.copyRegionPageNumber = 0;
        pdfViewer.copyRegionRect = null;
        clearPdfCopyRegionDebugMatches();
        clearPdfToolSession();
        clearPdfTextSelection();
    }
    if (!state.enablePdfTextSelectTool && isPdfTextSelectToolActive()) {
        pdfViewer.toolMode = "none";
        clearPdfToolSession();
        clearPdfTextSelection();
    }
    syncExperimentalNestedOptions();
    syncPdfToolPanel();
    renderPdfToolOverlays();
}

function stopPdfCaptureTool() {
    pdfViewer.capturePageNumber = 0;
    pdfViewer.captureRect = null;
    clearPdfCapturePreview();
}

function setPdfToolMode(mode) {
    const nextMode = mode === "copy-region" || mode === "capture-thumbnail" || mode === PDF_TEXT_SELECT_TOOL_MODE ? mode : "none";
    pdfViewer.toolMode = nextMode;
    clearPdfToolSession();

    if (nextMode !== "copy-region") {
        pdfViewer.copyRegionPageNumber = 0;
        pdfViewer.copyRegionRect = null;
        clearPdfCopyRegionDebugMatches();
    }
    if (nextMode !== "capture-thumbnail") {
        stopPdfCaptureTool();
    }
    if (nextMode !== PDF_TEXT_SELECT_TOOL_MODE) {
        clearPdfTextSelection();
    }

    if (nextMode === "capture-thumbnail") {
        const pageNumber = clampPdfPage(pdfViewer.page);
        pdfViewer.capturePreset = normalizePdfCapturePreset(dom.pdfCapturePreset?.value || pdfViewer.capturePreset);
        pdfViewer.capturePageNumber = pageNumber;
        pdfViewer.captureRect = createDefaultPdfCaptureRect(pageNumber, pdfViewer.capturePreset);
        requestPdfCapturePreviewRender();
    }

    syncPdfToolPanel();
    renderPdfToolOverlays();
    syncPdfCopyRegionDebugMatches();
}

function clearPdfCanvas() {
    if (!dom.pdfCanvasWrap) return;
    clearNode(dom.pdfCanvasWrap);
    clearPdfCopyRegionDebugMatches();
    if (dom.pdfCanvas) {
        const ctx = dom.pdfCanvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, dom.pdfCanvas.width, dom.pdfCanvas.height);
        dom.pdfCanvas.width = 0;
        dom.pdfCanvas.height = 0;
        dom.pdfCanvas.style.width = "";
        dom.pdfCanvas.style.height = "";
        dom.pdfCanvas.classList.add("hidden");
        dom.pdfCanvasWrap.appendChild(dom.pdfCanvas);
    }
    pdfViewer.pageShells.clear();
    pdfViewer.pageCanvases.clear();
    pdfViewer.pageTextLayers.clear();
    pdfViewer.pageOverlayLayers.clear();
    pdfViewer.pageBaseSizes.clear();
    pdfViewer.defaultBaseViewport = null;
}

function cancelPdfRenderTask() {
    if (pdfViewer.renderTask) {
        try {
            pdfViewer.renderTask.cancel();
        } catch {
            // Best effort: render can already be completed or torn down.
        }
        pdfViewer.renderTask = null;
    }
    for (const task of pdfViewer.pageRenderTasks.values()) {
        try {
            task.cancel();
        } catch {
            // Ignore cancellations on completed page renders.
        }
    }
    pdfViewer.pageRenderTasks.clear();
    for (const task of pdfViewer.pageTextLayerTasks.values()) {
        try {
            task.cancel();
        } catch {
            // Ignore cancellations on completed text layer renders.
        }
    }
    pdfViewer.pageTextLayerTasks.clear();
}

function disposePdfDocument() {
    cancelPdfRenderTask();
    if (pdfViewer.loadingTask && typeof pdfViewer.loadingTask.destroy === "function") {
        try {
            pdfViewer.loadingTask.destroy();
        } catch {
            // Ignore cleanup failures on stale loading tasks.
        }
    }
    pdfViewer.loadingTask = null;

    const activeDoc = pdfViewer.doc;
    pdfViewer.doc = null;
    pdfViewer.pageCount = 0;
    pdfViewer.defaultBaseViewport = null;
    pdfViewer.pageTextCache.clear();
    pdfViewer.pageTextPromises.clear();
    pdfViewer.pageTextGeometryCache.clear();
    pdfViewer.pageTextGeometryPromises.clear();
    if (activeDoc && typeof activeDoc.destroy === "function") {
        Promise.resolve(activeDoc.destroy()).catch(() => { });
    }
}

function resetPdfSearchState({ clearInput = false } = {}) {
    pdfViewer.searchRequestId += 1;
    pdfViewer.searchQuery = "";
    pdfViewer.searchDisplayQuery = "";
    pdfViewer.searchMatches = [];
    pdfViewer.searchMatchIndex = -1;
    if (clearInput && dom.pdfSearchInput) {
        dom.pdfSearchInput.value = "";
    }
    updatePdfSearchStatus();
    renderPdfToolOverlays();
}

function syncPdfPageListSelection() {
    if (!dom.pdfPageList) return;
    const matchSet = new Set(pdfViewer.searchMatches.map((match) => match.pageNumber));
    const activeMatchPage = pdfViewer.searchMatchIndex >= 0
        ? pdfViewer.searchMatches[pdfViewer.searchMatchIndex]?.pageNumber
        : null;

    dom.pdfPageList.querySelectorAll("[data-page-number]").forEach((button) => {
        const pageNumber = Number.parseInt(button.dataset.pageNumber || "", 10);
        button.classList.toggle("is-active", pageNumber === pdfViewer.page);
        button.classList.toggle("has-search-match", matchSet.has(pageNumber));
        button.classList.toggle("is-search-match-active", activeMatchPage === pageNumber);
    });

    const activeButton = dom.pdfPageList.querySelector(`[data-page-number="${pdfViewer.page}"]`);
    if (activeButton) {
        activeButton.scrollIntoView({ block: "nearest" });
    }
}

function syncPdfViewerControls() {
    const hasDoc = Boolean(pdfViewer.doc);
    const totalPages = pdfViewer.pageCount || 0;
    const pageNumber = clampPdfPage(pdfViewer.page);
    const zoomPercent = Math.round(clampPdfZoomScale(pdfViewer.zoomScale) * 100);
    let zoomLabel = `${zoomPercent}%`;
    if (pdfViewer.zoomMode === "fit-width") zoomLabel = `${zoomLabel} | Fit width`;
    if (pdfViewer.zoomMode === "fit-page") zoomLabel = `${zoomLabel} | Fit page`;

    if (dom.pdfPageNumber) {
        dom.pdfPageNumber.disabled = !hasDoc;
        dom.pdfPageNumber.min = "1";
        dom.pdfPageNumber.max = String(Math.max(totalPages, 1));
        dom.pdfPageNumber.value = String(pageNumber);
    }
    if (dom.pdfPageCount) {
        dom.pdfPageCount.textContent = `/ ${totalPages}`;
    }
    if (dom.pdfPrevPage) dom.pdfPrevPage.disabled = !hasDoc || pageNumber <= 1;
    if (dom.pdfNextPage) dom.pdfNextPage.disabled = !hasDoc || pageNumber >= totalPages;
    if (dom.pdfZoomOut) dom.pdfZoomOut.disabled = !hasDoc;
    if (dom.pdfZoomIn) dom.pdfZoomIn.disabled = !hasDoc;
    if (dom.pdfFitWidth) dom.pdfFitWidth.disabled = !hasDoc;
    if (dom.pdfFitPage) dom.pdfFitPage.disabled = !hasDoc;
    if (dom.pdfZoomValue) dom.pdfZoomValue.textContent = zoomLabel;
    if (dom.pdfSearchInput) dom.pdfSearchInput.disabled = !hasDoc;
    const hasMatches = hasDoc && pdfViewer.searchMatches.length > 0 && Boolean(pdfViewer.searchQuery);
    if (dom.pdfSearchPrev) dom.pdfSearchPrev.disabled = !hasMatches;
    if (dom.pdfSearchNext) dom.pdfSearchNext.disabled = !hasMatches;
    if (dom.pdfOpenExternal) dom.pdfOpenExternal.disabled = !pdfViewer.article;
    if (dom.pdfCopyBibtex) dom.pdfCopyBibtex.disabled = !pdfViewer.article;
    if (dom.pdfToggleHeaderFold) dom.pdfToggleHeaderFold.disabled = !pdfViewer.article;
    if (dom.pdfCopyRegionToggle) dom.pdfCopyRegionToggle.disabled = !hasDoc || !state.enablePdfCopyTool;
    if (dom.pdfTextSelectToggle) dom.pdfTextSelectToggle.disabled = !hasDoc || !state.enablePdfTextSelectTool;
    if (dom.pdfCaptureThumbnailToggle) dom.pdfCaptureThumbnailToggle.disabled = !hasDoc;
    if (dom.pdfCaptureSave) dom.pdfCaptureSave.disabled = !hasDoc || !pdfViewer.captureRect || pdfViewer.toolMode !== "capture-thumbnail";
    if (dom.pdfCapturePreset) dom.pdfCapturePreset.disabled = !hasDoc || pdfViewer.toolMode !== "capture-thumbnail";

    syncPdfPageListSelection();
    syncPdfExperimentalToolVisibility();
    updatePdfViewerHeader();
}

function getPdfEffectiveScale() {
    const fallbackViewport = pdfViewer.defaultBaseViewport || { width: 816, height: 1056 };
    const scale = pdfViewer.zoomMode === "custom"
        ? clampPdfZoomScale(pdfViewer.zoomScale)
        : getPdfFitScale(fallbackViewport, pdfViewer.zoomMode);
    pdfViewer.zoomScale = scale;
    return scale;
}

function getPdfKnownBaseSize(pageNumber) {
    return pdfViewer.pageBaseSizes.get(pageNumber) || pdfViewer.defaultBaseViewport || { width: 816, height: 1056 };
}

function capturePdfViewportAnchor(sourceEvt = null) {
    const wrap = dom.pdfCanvasWrap;
    if (!pdfViewer.doc || !wrap || wrap.classList.contains("hidden")) return null;

    const rect = wrap.getBoundingClientRect();
    const viewportWidth = wrap.clientWidth || rect.width || 0;
    const viewportHeight = wrap.clientHeight || rect.height || 0;
    const clampViewportCoord = (coord, size) => {
        if (!Number.isFinite(coord)) return size / 2;
        return Math.min(Math.max(coord, 0), Math.max(0, size));
    };

    const viewportX = clampViewportCoord((sourceEvt?.clientX ?? Number.NaN) - rect.left, viewportWidth);
    const viewportY = clampViewportCoord((sourceEvt?.clientY ?? Number.NaN) - rect.top, viewportHeight);
    const contentX = wrap.scrollLeft + viewportX;
    const contentY = wrap.scrollTop + viewportY;

    let anchorPageNumber = null;
    let anchorShell = null;
    for (let pageNumber = 1; pageNumber <= pdfViewer.pageCount; pageNumber += 1) {
        const shell = pdfViewer.pageShells.get(pageNumber);
        if (!shell) continue;
        const shellTop = shell.offsetTop;
        const shellBottom = shellTop + shell.offsetHeight;
        if (contentY >= shellTop && contentY <= shellBottom) {
            anchorPageNumber = pageNumber;
            anchorShell = shell;
            break;
        }
    }

    if (!anchorShell) {
        anchorPageNumber = clampPdfPage(pdfViewer.page);
        anchorShell = pdfViewer.pageShells.get(anchorPageNumber) || null;
    }

    const scrollWidthRange = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
    const scrollHeightRange = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    const anchor = {
        viewportX,
        viewportY,
        scrollLeftRatio: scrollWidthRange > 0 ? wrap.scrollLeft / scrollWidthRange : 0,
        scrollTopRatio: scrollHeightRange > 0 ? wrap.scrollTop / scrollHeightRange : 0,
        pageNumber: anchorPageNumber,
        relativeX: 0.5,
        relativeY: 0.5,
    };

    if (!anchorShell) return anchor;

    const shellWidth = Math.max(1, anchorShell.offsetWidth || 0);
    const shellHeight = Math.max(1, anchorShell.offsetHeight || 0);
    anchor.relativeX = Math.min(Math.max((contentX - anchorShell.offsetLeft) / shellWidth, 0), 1);
    anchor.relativeY = Math.min(Math.max((contentY - anchorShell.offsetTop) / shellHeight, 0), 1);
    return anchor;
}

function restorePdfViewportAnchor(anchor) {
    const wrap = dom.pdfCanvasWrap;
    if (!anchor || !wrap) return;

    let nextScrollLeft = Number.NaN;
    let nextScrollTop = Number.NaN;
    if (anchor.pageNumber) {
        const shell = pdfViewer.pageShells.get(anchor.pageNumber);
        if (shell) {
            nextScrollLeft = shell.offsetLeft + (shell.offsetWidth * anchor.relativeX) - anchor.viewportX;
            nextScrollTop = shell.offsetTop + (shell.offsetHeight * anchor.relativeY) - anchor.viewportY;
        }
    }

    const maxScrollLeft = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
    const maxScrollTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    if (!Number.isFinite(nextScrollLeft)) nextScrollLeft = maxScrollLeft * (anchor.scrollLeftRatio || 0);
    if (!Number.isFinite(nextScrollTop)) nextScrollTop = maxScrollTop * (anchor.scrollTopRatio || 0);

    wrap.scrollLeft = Math.min(Math.max(nextScrollLeft, 0), maxScrollLeft);
    wrap.scrollTop = Math.min(Math.max(nextScrollTop, 0), maxScrollTop);
}

function ensurePdfPageSurface(pageNumber) {
    if (pdfViewer.pageShells.has(pageNumber) && pdfViewer.pageCanvases.has(pageNumber) && pdfViewer.pageOverlayLayers.has(pageNumber)) {
        const shell = pdfViewer.pageShells.get(pageNumber);
        let textLayer = pdfViewer.pageTextLayers.get(pageNumber) || null;
        if (!textLayer && isPdfTextSelectToolActive()) {
            textLayer = document.createElement("div");
            textLayer.className = "textLayer pdf-text-layer";
            textLayer.dataset.pageNumber = String(pageNumber);
            const overlay = pdfViewer.pageOverlayLayers.get(pageNumber);
            if (overlay && shell) {
                shell.insertBefore(textLayer, overlay);
            } else if (shell) {
                shell.appendChild(textLayer);
            }
            pdfViewer.pageTextLayers.set(pageNumber, textLayer);
            delete shell.dataset.renderKey;
        }
        return {
            shell,
            canvas: pdfViewer.pageCanvases.get(pageNumber),
            textLayer,
            overlay: pdfViewer.pageOverlayLayers.get(pageNumber),
        };
    }

    const shell = document.createElement("section");
    shell.className = "pdf-page-shell";
    shell.dataset.pageNumber = String(pageNumber);

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page-canvas";
    canvas.dataset.pageNumber = String(pageNumber);

    let textLayer = null;
    if (isPdfTextSelectToolActive()) {
        textLayer = document.createElement("div");
        textLayer.className = "textLayer pdf-text-layer";
        textLayer.dataset.pageNumber = String(pageNumber);
    }

    const overlay = document.createElement("div");
    overlay.className = "pdf-page-overlay-layer";
    overlay.dataset.pageNumber = String(pageNumber);

    const label = document.createElement("div");
    label.className = "pdf-page-label";
    label.textContent = `Page ${pageNumber}`;

    shell.appendChild(canvas);
    if (textLayer) {
        shell.appendChild(textLayer);
    }
    shell.appendChild(overlay);
    shell.appendChild(label);
    dom.pdfCanvasWrap.appendChild(shell);
    pdfViewer.pageShells.set(pageNumber, shell);
    pdfViewer.pageCanvases.set(pageNumber, canvas);
    if (textLayer) {
        pdfViewer.pageTextLayers.set(pageNumber, textLayer);
    }
    pdfViewer.pageOverlayLayers.set(pageNumber, overlay);
    renderPdfPageToolOverlay(pageNumber);
    return { shell, canvas, textLayer, overlay };
}

function applyPdfPageSurfaceSize(pageNumber) {
    const shell = pdfViewer.pageShells.get(pageNumber);
    const canvas = pdfViewer.pageCanvases.get(pageNumber);
    if (!shell || !canvas) return;

    const scale = getPdfEffectiveScale();
    const baseSize = getPdfKnownBaseSize(pageNumber);
    const width = Math.max(1, Math.floor(baseSize.width * scale));
    const height = Math.max(1, Math.floor(baseSize.height * scale));
    const previousWidth = shell.offsetWidth || shell.clientWidth || 0;
    const previousHeight = shell.offsetHeight || shell.clientHeight || 0;
    shell.style.width = `${width}px`;
    shell.style.minHeight = `${height}px`;
    shell.style.height = `${height}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (previousWidth > 0 && previousHeight > 0 && (previousWidth !== width || previousHeight !== height)) {
        const scaleX = width / previousWidth;
        const scaleY = height / previousHeight;
        const bounds = { width, height };
        if (pdfViewer.capturePageNumber === pageNumber && pdfViewer.captureRect) {
            pdfViewer.captureRect = clampPdfToolRect({
                left: pdfViewer.captureRect.left * scaleX,
                top: pdfViewer.captureRect.top * scaleY,
                width: pdfViewer.captureRect.width * scaleX,
                height: pdfViewer.captureRect.height * scaleY,
            }, bounds, 28);
        }
        if (pdfViewer.copyRegionPageNumber === pageNumber && pdfViewer.copyRegionRect) {
            pdfViewer.copyRegionRect = clampPdfToolRect({
                left: pdfViewer.copyRegionRect.left * scaleX,
                top: pdfViewer.copyRegionRect.top * scaleY,
                width: pdfViewer.copyRegionRect.width * scaleX,
                height: pdfViewer.copyRegionRect.height * scaleY,
            }, bounds, 8);
        }
    }
}

function buildPdfPageSurfaces() {
    if (!pdfViewer.doc || !dom.pdfCanvasWrap) return;
    clearPdfCanvas();
    for (let pageNumber = 1; pageNumber <= pdfViewer.pageCount; pageNumber += 1) {
        ensurePdfPageSurface(pageNumber);
        applyPdfPageSurfaceSize(pageNumber);
    }
    renderPdfToolOverlays();
}

function invalidatePdfPageRenders() {
    pdfViewer.renderGeneration += 1;
    cancelPdfRenderTask();
    pdfViewer.pageShells.forEach((shell) => {
        shell.classList.remove("is-rendered");
        shell.classList.remove("is-error");
        delete shell.dataset.renderKey;
    });
}

function updateAllPdfPageSurfaceSizes() {
    for (let pageNumber = 1; pageNumber <= pdfViewer.pageCount; pageNumber += 1) {
        ensurePdfPageSurface(pageNumber);
        applyPdfPageSurfaceSize(pageNumber);
    }
    renderPdfToolOverlays();
}

function syncPdfPageFromScroll() {
    if (!pdfViewer.doc || !dom.pdfCanvasWrap || pdfViewer.pageShells.size === 0) return;

    const marker = dom.pdfCanvasWrap.scrollTop + (dom.pdfCanvasWrap.clientHeight * 0.35);
    let bestPage = pdfViewer.page;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let pageNumber = 1; pageNumber <= pdfViewer.pageCount; pageNumber += 1) {
        const shell = pdfViewer.pageShells.get(pageNumber);
        if (!shell) continue;
        const center = shell.offsetTop + (shell.offsetHeight * 0.5);
        const distance = Math.abs(center - marker);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestPage = pageNumber;
        }
    }

    if (bestPage !== pdfViewer.page) {
        pdfViewer.page = bestPage;
        persistPdfViewerState();
        syncPdfViewerControls();
    }
}

function scrollPdfPageIntoView(pageNumber, behavior = "auto") {
    const shell = pdfViewer.pageShells.get(pageNumber);
    if (!shell) return;
    shell.scrollIntoView({ block: "start", behavior });
}

async function renderPdfPageSurface(pageNumber) {
    if (!pdfViewer.doc) return;

    const { shell, canvas, textLayer } = ensurePdfPageSurface(pageNumber);
    const generation = pdfViewer.renderGeneration;
    const scale = getPdfEffectiveScale();
    const renderKey = `${generation}:${scale.toFixed(4)}`;
    if (shell.dataset.renderKey === renderKey && shell.classList.contains("is-rendered")) return;
    if (pdfViewer.pageRenderTasks.has(pageNumber)) return;

    let renderTask = null;
    let textLayerTask = null;
    try {
        const pdfjsLib = isPdfTextSelectToolActive() ? await loadPdfJsLib() : null;
        const page = await pdfViewer.doc.getPage(pageNumber);
        if (generation !== pdfViewer.renderGeneration || !pdfViewer.doc) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const nextBaseSize = { width: baseViewport.width, height: baseViewport.height };
        pdfViewer.pageBaseSizes.set(pageNumber, nextBaseSize);
        if (!pdfViewer.defaultBaseViewport) {
            pdfViewer.defaultBaseViewport = nextBaseSize;
        }

        const effectiveScale = getPdfEffectiveScale();
        const viewport = page.getViewport({ scale: effectiveScale });
        const outputScale = window.devicePixelRatio || 1;
        const context = canvas.getContext("2d", { alpha: false });
        const transform = outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];

        shell.style.width = `${Math.floor(viewport.width)}px`;
        shell.style.minHeight = `${Math.floor(viewport.height)}px`;
        shell.style.height = `${Math.floor(viewport.height)}px`;
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = page.render({
            canvasContext: context,
            viewport,
            transform,
            background: "rgba(255,255,255,1)",
        });
        pdfViewer.pageRenderTasks.set(pageNumber, renderTask);
        if (isPdfTextSelectToolActive() && pdfjsLib && textLayer) {
            const textContent = await page.getTextContent();
            textLayer.replaceChildren();
            textLayer.style.width = `${Math.floor(viewport.width)}px`;
            textLayer.style.height = `${Math.floor(viewport.height)}px`;
            textLayerTask = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: textLayer,
                viewport,
            });
            pdfViewer.pageTextLayerTasks.set(pageNumber, textLayerTask);
        }

        await Promise.all([
            renderTask.promise,
            ...(textLayerTask ? [textLayerTask.render()] : []),
        ]);
        if (generation !== pdfViewer.renderGeneration) return;

        shell.dataset.renderKey = renderKey;
        shell.classList.remove("is-error");
        shell.classList.add("is-rendered");
        if (pdfViewer.capturePageNumber === pageNumber) {
            requestPdfCapturePreviewRender();
        }
    } catch (err) {
        if (err?.name === "RenderingCancelledException" || err?.name === "AbortException") return;
        shell.classList.add("is-error");
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setPdfViewerStatus(`Failed to render page ${pageNumber}: ${message}`, true);
        setStatus(`Failed to render PDF page ${pageNumber}: ${message}`, true);
    } finally {
        if (renderTask && pdfViewer.pageRenderTasks.get(pageNumber) === renderTask) {
            pdfViewer.pageRenderTasks.delete(pageNumber);
        }
        if (textLayerTask && pdfViewer.pageTextLayerTasks.get(pageNumber) === textLayerTask) {
            pdfViewer.pageTextLayerTasks.delete(pageNumber);
        }
    }
}

function renderVisiblePdfPages() {
    if (!pdfViewer.doc || !dom.pdfCanvasWrap) return;
    const viewportTop = dom.pdfCanvasWrap.scrollTop;
    const viewportBottom = viewportTop + dom.pdfCanvasWrap.clientHeight;
    const buffer = dom.pdfCanvasWrap.clientHeight * 1.5;

    for (let pageNumber = 1; pageNumber <= pdfViewer.pageCount; pageNumber += 1) {
        const shell = pdfViewer.pageShells.get(pageNumber);
        if (!shell) continue;
        const shellTop = shell.offsetTop;
        const shellBottom = shellTop + shell.offsetHeight;
        if (shellBottom < (viewportTop - buffer) || shellTop > (viewportBottom + buffer)) continue;
        renderPdfPageSurface(pageNumber).catch((err) => {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Failed to render visible PDF pages: ${message}`, true);
        });
    }
}

function renderPdfPageList() {
    if (!dom.pdfPageList) return;
    clearNode(dom.pdfPageList);
    if (!pdfViewer.pageCount) return;

    const fragment = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= pdfViewer.pageCount; pageNumber += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pdf-page-button";
        button.dataset.pageNumber = String(pageNumber);
        button.textContent = `Page ${pageNumber}`;
        button.addEventListener("click", () => {
            goToPdfPage(pageNumber).catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to change page: ${message}`, true);
            });
        });
        fragment.appendChild(button);
    }
    dom.pdfPageList.appendChild(fragment);
    syncPdfPageListSelection();
}

function getPdfPageNumberFromEventTarget(target) {
    const shell = target instanceof HTMLElement ? target.closest(".pdf-page-shell") : null;
    if (!shell) return null;
    const pageNumber = Number.parseInt(shell.dataset.pageNumber || "", 10);
    return Number.isFinite(pageNumber) ? pageNumber : null;
}

function getPdfLocalPoint(pageNumber, clientX, clientY) {
    const surface = getPdfPageCanvas(pageNumber) || getPdfPageShell(pageNumber);
    if (!surface) return null;
    const bounds = getPdfPageBounds(pageNumber);
    const rect = surface.getBoundingClientRect();
    return {
        x: Math.min(Math.max(clientX - rect.left, 0), bounds.width),
        y: Math.min(Math.max(clientY - rect.top, 0), bounds.height),
        bounds,
    };
}

function isPointInsidePdfRect(point, rect) {
    if (!point || !rect) return false;
    return point.x >= rect.left
        && point.x <= (rect.left + rect.width)
        && point.y >= rect.top
        && point.y <= (rect.top + rect.height);
}

function getPdfCaptureCornerAtPoint(point, rect, tolerance = 18) {
    if (!point || !rect) return null;
    const corners = [
        { key: "top-left", x: rect.left, y: rect.top },
        { key: "top-right", x: rect.left + rect.width, y: rect.top },
        { key: "bottom-left", x: rect.left, y: rect.top + rect.height },
        { key: "bottom-right", x: rect.left + rect.width, y: rect.top + rect.height },
    ];
    const hit = corners.find((corner) => Math.hypot(point.x - corner.x, point.y - corner.y) <= tolerance);
    return hit?.key || null;
}

function buildPdfSelectionRect(startX, startY, currentX, currentY, bounds, minimum = 8) {
    return clampPdfToolRect({
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
    }, bounds, minimum);
}

function buildPdfCaptureRectFromCorner(corner, anchorX, anchorY, point, ratio, bounds, minimum = 28) {
    if (!ratio) {
        switch (corner) {
            case "top-left":
                return clampPdfToolRect({
                    left: point.x,
                    top: point.y,
                    width: anchorX - point.x,
                    height: anchorY - point.y,
                }, bounds, minimum);
            case "top-right":
                return clampPdfToolRect({
                    left: anchorX,
                    top: point.y,
                    width: point.x - anchorX,
                    height: anchorY - point.y,
                }, bounds, minimum);
            case "bottom-left":
                return clampPdfToolRect({
                    left: point.x,
                    top: anchorY,
                    width: anchorX - point.x,
                    height: point.y - anchorY,
                }, bounds, minimum);
            case "bottom-right":
            default:
                return clampPdfToolRect({
                    left: anchorX,
                    top: anchorY,
                    width: point.x - anchorX,
                    height: point.y - anchorY,
                }, bounds, minimum);
        }
    }

    const leftSide = corner.includes("left");
    const topSide = corner.includes("top");
    const dx = leftSide ? anchorX - point.x : point.x - anchorX;
    const dy = topSide ? anchorY - point.y : point.y - anchorY;
    let width = Math.max(minimum, dx);
    let height = width / ratio;
    if (height > dy) {
        height = Math.max(minimum, dy);
        width = height * ratio;
    }

    const left = leftSide ? anchorX - width : anchorX;
    const top = topSide ? anchorY - height : anchorY;
    return clampPdfToolRect({ left, top, width, height }, bounds, minimum);
}

function movePdfCaptureRect(rect, point, bounds, offsetX, offsetY) {
    if (!rect || !point) return rect;
    return clampPdfToolRect({
        left: point.x - offsetX,
        top: point.y - offsetY,
        width: rect.width,
        height: rect.height,
    }, bounds, 28);
}

function getPdfCaptureSourceRect(pageNumber, cropRect) {
    const canvas = pdfViewer.pageCanvases.get(pageNumber);
    const shell = getPdfPageShell(pageNumber);
    if (!canvas || !shell || !cropRect) return null;
    const scaleX = canvas.width / Math.max(1, shell.clientWidth || shell.offsetWidth || 1);
    const scaleY = canvas.height / Math.max(1, shell.clientHeight || shell.offsetHeight || 1);
    return {
        x: Math.max(0, Math.floor(cropRect.left * scaleX)),
        y: Math.max(0, Math.floor(cropRect.top * scaleY)),
        width: Math.max(1, Math.floor(cropRect.width * scaleX)),
        height: Math.max(1, Math.floor(cropRect.height * scaleY)),
    };
}

function drawImageRegionFit(ctx, image, srcRect, targetWidth, targetHeight, mode = "contain") {
    const srcWidth = Math.max(1, srcRect.width);
    const srcHeight = Math.max(1, srcRect.height);
    const scale = mode === "cover"
        ? Math.max(targetWidth / srcWidth, targetHeight / srcHeight)
        : Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
    const drawWidth = srcWidth * scale;
    const drawHeight = srcHeight * scale;
    const dx = (targetWidth - drawWidth) / 2;
    const dy = (targetHeight - drawHeight) / 2;
    ctx.drawImage(
        image,
        srcRect.x,
        srcRect.y,
        srcWidth,
        srcHeight,
        dx,
        dy,
        drawWidth,
        drawHeight,
    );
}

function renderPdfCapturePreview() {
    if (!dom.pdfCapturePreview) return;
    const canvas = dom.pdfCapturePreview;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pageNumber = pdfViewer.capturePageNumber;
    const cropRect = pdfViewer.captureRect;
    const sourceCanvas = pdfViewer.pageCanvases.get(pageNumber);
    const sourceRect = getPdfCaptureSourceRect(pageNumber, cropRect);
    if (!sourceCanvas || !sourceRect) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.filter = "blur(20px) brightness(0.62)";
    drawImageRegionFit(ctx, sourceCanvas, sourceRect, canvas.width, canvas.height, "cover");
    ctx.restore();
    ctx.fillStyle = "rgba(8, 18, 28, 0.14)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawImageRegionFit(ctx, sourceCanvas, sourceRect, canvas.width, canvas.height, "contain");
}

function buildPdfCaptureSourceCanvas(pageNumber, cropRect) {
    const sourceCanvas = pdfViewer.pageCanvases.get(pageNumber);
    const sourceRect = getPdfCaptureSourceRect(pageNumber, cropRect);
    if (!sourceCanvas || !sourceRect) return null;

    const output = document.createElement("canvas");
    output.width = sourceRect.width;
    output.height = sourceRect.height;
    const ctx = output.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
        sourceCanvas,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        output.width,
        output.height,
    );

    if (!state.downscalePdfCaptureImages) return output;

    const maxDimension = Math.max(output.width, output.height);
    const totalPixels = output.width * output.height;
    if (maxDimension <= PDF_CAPTURE_MAX_DIMENSION && totalPixels <= PDF_CAPTURE_MAX_PIXELS) {
        return output;
    }

    const scale = Math.min(
        PDF_CAPTURE_MAX_DIMENSION / Math.max(1, maxDimension),
        Math.sqrt(PDF_CAPTURE_MAX_PIXELS / Math.max(1, totalPixels)),
    );
    if (!Number.isFinite(scale) || scale >= 1) return output;

    const downscaled = document.createElement("canvas");
    downscaled.width = Math.max(1, Math.floor(output.width * scale));
    downscaled.height = Math.max(1, Math.floor(output.height * scale));
    const downscaledCtx = downscaled.getContext("2d");
    if (!downscaledCtx) return output;
    downscaledCtx.imageSmoothingEnabled = true;
    downscaledCtx.imageSmoothingQuality = "high";
    downscaledCtx.drawImage(output, 0, 0, downscaled.width, downscaled.height);
    return downscaled;
}

async function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Canvas export failed."));
                return;
            }
            resolve(blob);
        }, type, quality);
    });
}

function rectsIntersect(a, b) {
    return a.left < (b.left + b.width)
        && (a.left + a.width) > b.left
        && a.top < (b.top + b.height)
        && (a.top + a.height) > b.top;
}

async function ensurePdfPageTextGeometry(pageNumber) {
    if (!pdfViewer.doc) return [];
    const scaleKey = getPdfEffectiveScale().toFixed(4);
    const cached = pdfViewer.pageTextGeometryCache.get(pageNumber);
    if (cached?.scaleKey === scaleKey) {
        return cached.items;
    }

    const promiseKey = `${pageNumber}:${scaleKey}`;
    if (pdfViewer.pageTextGeometryPromises.has(promiseKey)) {
        return pdfViewer.pageTextGeometryPromises.get(promiseKey);
    }

    const activeDoc = pdfViewer.doc;
    const loadId = pdfViewer.loadRequestId;
    const promise = (async () => {
        const [pdfjsLib, page] = await Promise.all([
            loadPdfJsLib(),
            activeDoc.getPage(pageNumber),
        ]);
        const viewport = page.getViewport({ scale: getPdfEffectiveScale() });
        const textContent = await page.getTextContent();
        const items = textContent.items
            .map((item) => {
                if (!item || typeof item.str !== "string") return null;
                const text = normalizeWhitespace(item.str);
                if (!text) return null;
                const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
                const style = textContent.styles?.[item.fontName] || null;
                const angle = Math.atan2(transform[1], transform[0]);
                const width = Math.max(1, Math.abs(Number(item.width) || 0) * viewport.scale);
                const fontHeight = Math.max(
                    1,
                    Math.hypot(transform[2], transform[3]) || Math.hypot(transform[0], transform[1]) || 1,
                );
                let ascent = fontHeight * 0.8;
                if (typeof style?.ascent === "number") {
                    ascent = style.ascent * fontHeight;
                } else if (typeof style?.descent === "number") {
                    ascent = (1 + style.descent) * fontHeight;
                }
                ascent = Math.max(1, Math.min(fontHeight, ascent));
                const height = fontHeight;
                const leftOrigin = transform[4];
                const topOrigin = transform[5] - ascent;
                const widthDx = Math.cos(angle) * width;
                const widthDy = Math.sin(angle) * width;
                const heightDx = -Math.sin(angle) * height;
                const heightDy = Math.cos(angle) * height;
                const points = [
                    { x: leftOrigin, y: topOrigin },
                    { x: leftOrigin + widthDx, y: topOrigin + widthDy },
                    { x: leftOrigin + heightDx, y: topOrigin + heightDy },
                    { x: leftOrigin + widthDx + heightDx, y: topOrigin + widthDy + heightDy },
                ];
                const xs = points.map((point) => point.x);
                const ys = points.map((point) => point.y);
                const left = Math.min(...xs);
                const right = Math.max(...xs);
                const top = Math.min(...ys);
                const bottom = Math.max(...ys);
                return {
                    text,
                    rawText: item.str,
                    searchText: normalizePdfSearchQuery(item.str),
                    left,
                    right,
                    top,
                    bottom,
                    width: Math.max(1, right - left),
                    height: Math.max(1, bottom - top),
                    centerY: (top + bottom) / 2,
                    leftRatio: left / Math.max(1, viewport.width),
                    topRatio: top / Math.max(1, viewport.height),
                    widthRatio: Math.max(1, right - left) / Math.max(1, viewport.width),
                    heightRatio: Math.max(1, bottom - top) / Math.max(1, viewport.height),
                };
            })
            .filter(Boolean);

        if (loadId === pdfViewer.loadRequestId && activeDoc === pdfViewer.doc) {
            pdfViewer.pageTextGeometryCache.set(pageNumber, { scaleKey, items });
        }
        return items;
    })().finally(() => {
        pdfViewer.pageTextGeometryPromises.delete(promiseKey);
    });

    pdfViewer.pageTextGeometryPromises.set(promiseKey, promise);
    return promise;
}

function joinPdfRegionItems(items) {
    if (items.length === 0) return "";
    const lines = [];
    let currentLine = [];
    let currentCenterY = null;
    let currentHeight = 0;

    items.forEach((item) => {
        if (currentLine.length === 0) {
            currentLine.push(item);
            currentCenterY = item.centerY;
            currentHeight = item.height;
            return;
        }

        const tolerance = Math.max(6, Math.max(currentHeight, item.height) * 0.65);
        if (Math.abs(item.centerY - currentCenterY) <= tolerance) {
            currentLine.push(item);
            currentCenterY = (currentCenterY + item.centerY) / 2;
            currentHeight = Math.max(currentHeight, item.height);
            return;
        }

        lines.push(currentLine);
        currentLine = [item];
        currentCenterY = item.centerY;
        currentHeight = item.height;
    });

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines.map((line) => {
        const sortedLine = [...line].sort((a, b) => a.left - b.left);
        let built = "";
        sortedLine.forEach((item, index) => {
            if (index === 0) {
                built = item.text;
                return;
            }
            const prev = sortedLine[index - 1];
            const gap = item.left - prev.right;
            const separator = prev.text.endsWith("-") ? "" : (gap > Math.max(4, prev.height * 0.18) ? " " : "");
            built += `${separator}${item.text}`;
        });
        return built.trim();
    }).filter(Boolean).join("\n");
}

function mergePdfSearchMatchRects(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const sorted = [...items].sort((a, b) => {
        const yDiff = a.centerY - b.centerY;
        if (Math.abs(yDiff) > Math.max(a.height, b.height) * 0.35) {
            return yDiff;
        }
        return a.left - b.left;
    });

    const rects = [];
    sorted.forEach((item) => {
        const itemRect = {
            leftRatio: item.leftRatio,
            topRatio: item.topRatio,
            widthRatio: item.widthRatio,
            heightRatio: item.heightRatio,
        };
        const previous = rects[rects.length - 1];
        if (!previous) {
            rects.push(itemRect);
            return;
        }

        const previousCenterY = previous.topRatio + (previous.heightRatio / 2);
        const itemCenterY = itemRect.topRatio + (itemRect.heightRatio / 2);
        const sameLine = Math.abs(itemCenterY - previousCenterY) <= Math.max(previous.heightRatio, itemRect.heightRatio) * 0.7;
        const previousRight = previous.leftRatio + previous.widthRatio;
        const itemRight = itemRect.leftRatio + itemRect.widthRatio;
        const gap = itemRect.leftRatio - previousRight;
        if (!sameLine || gap > Math.max(0.008, itemRect.heightRatio * 0.42)) {
            rects.push(itemRect);
            return;
        }

        const nextLeft = Math.min(previous.leftRatio, itemRect.leftRatio);
        const nextTop = Math.min(previous.topRatio, itemRect.topRatio);
        const nextRight = Math.max(previousRight, itemRight);
        const nextBottom = Math.max(previous.topRatio + previous.heightRatio, itemRect.topRatio + itemRect.heightRatio);
        previous.leftRatio = nextLeft;
        previous.topRatio = nextTop;
        previous.widthRatio = nextRight - nextLeft;
        previous.heightRatio = nextBottom - nextTop;
    });

    return rects;
}

function buildPdfPageSearchMatches(pageNumber, items, query) {
    if (!query || !Array.isArray(items) || items.length === 0) return [];

    const spans = [];
    let searchableText = "";
    items.forEach((item) => {
        const text = item.searchText || normalizePdfSearchQuery(item.rawText || item.text || "");
        if (!text) return;
        if (searchableText.length > 0) {
            searchableText += " ";
        }
        const start = searchableText.length;
        searchableText += text;
        spans.push({
            start,
            end: searchableText.length,
            item,
        });
    });

    if (!searchableText) return [];

    const matches = [];
    let fromIndex = 0;
    while (fromIndex <= searchableText.length - query.length) {
        const matchIndex = searchableText.indexOf(query, fromIndex);
        if (matchIndex < 0) break;
        const matchEnd = matchIndex + query.length;
        const matchedItems = spans
            .filter((span) => span.end > matchIndex && span.start < matchEnd)
            .map((span) => span.item);
        const rects = mergePdfSearchMatchRects(matchedItems);
        if (rects.length > 0) {
            const bounds = rects.reduce((acc, rect) => {
                const right = rect.leftRatio + rect.widthRatio;
                const bottom = rect.topRatio + rect.heightRatio;
                if (!acc) {
                    return {
                        leftRatio: rect.leftRatio,
                        topRatio: rect.topRatio,
                        widthRatio: rect.widthRatio,
                        heightRatio: rect.heightRatio,
                    };
                }
                const nextLeft = Math.min(acc.leftRatio, rect.leftRatio);
                const nextTop = Math.min(acc.topRatio, rect.topRatio);
                const nextRight = Math.max(acc.leftRatio + acc.widthRatio, right);
                const nextBottom = Math.max(acc.topRatio + acc.heightRatio, bottom);
                return {
                    leftRatio: nextLeft,
                    topRatio: nextTop,
                    widthRatio: nextRight - nextLeft,
                    heightRatio: nextBottom - nextTop,
                };
            }, null);
            matches.push({ pageNumber, rects, bounds });
        }
        fromIndex = matchIndex + Math.max(1, query.length);
    }

    return matches;
}

function scrollPdfSearchMatchIntoView(match, behavior = "auto") {
    if (!match || !dom.pdfCanvasWrap) return;
    const shell = getPdfPageShell(match.pageNumber);
    if (!shell) return;
    const focusRect = scalePdfRelativeRectToPage(match.pageNumber, match.bounds || match.rects?.[0] || {
        leftRatio: 0,
        topRatio: 0,
        widthRatio: 0,
        heightRatio: 0,
    });
    const wrap = dom.pdfCanvasWrap;
    const topPadding = Math.max(20, wrap.clientHeight * 0.16);
    const targetTop = shell.offsetTop + focusRect.top - topPadding;
    const maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    wrap.scrollTo({
        top: Math.min(Math.max(targetTop, 0), maxTop),
        behavior,
    });
}

async function copyPdfRegionSelection(pageNumber, rect) {
    const items = await ensurePdfPageTextGeometry(pageNumber);
    const matches = items
        .filter((item) => rectsIntersect(item, rect))
        .sort((a, b) => {
            const yDiff = a.centerY - b.centerY;
            if (Math.abs(yDiff) > Math.max(a.height, b.height) * 0.35) {
                return yDiff;
            }
            return a.left - b.left;
        });
    const extracted = cleanCopiedPdfRegionText(joinPdfRegionItems(matches));
    if (!extracted.trim()) {
        showToast("No text found in that region.");
        return;
    }
    const ok = await copyRawToClipboard(extracted);
    if (ok) {
        if (state.previewCopiedText) {
            showPdfCopyPreview(extracted, getPdfCopyPreviewDurationMs());
        } else {
            hidePdfCopyPreview();
        }
        return;
    }
    showToast("Failed to copy PDF region text");
}

async function savePdfCaptureThumbnail() {
    const article = getResolvedPdfViewerArticle();
    if (!article?.id || !pdfViewer.captureRect || !pdfViewer.capturePageNumber) return;
    const sourceCanvas = buildPdfCaptureSourceCanvas(pdfViewer.capturePageNumber, pdfViewer.captureRect);
    if (!sourceCanvas) {
        setStatus("Capture source is not ready yet.", true);
        return;
    }

    try {
        setStatus("Saving captured thumbnail...");
        const blob = await canvasToBlob(sourceCanvas);
        const file = new File([blob], `pdf-capture-${article.id}.jpg`, { type: blob.type || "image/jpeg" });
        const updatedArticle = await uploadThumbnailForArticle(article, file);
        if (updatedArticle?.id === article.id) {
            pdfViewer.article = updatedArticle;
        }
        setPdfToolMode("none");
        syncPdfViewerControls();
        setStatus("Thumbnail captured from PDF page.");
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to capture thumbnail: ${message}`, true);
    }
}

function handlePdfCanvasPointerDown(evt) {
    if (!isPdfViewerOpen()) return;
    if (evt.button !== 0) return;
    if (pdfViewer.toolMode !== "copy-region" && pdfViewer.toolMode !== "capture-thumbnail") return;

    const pageNumber = getPdfPageNumberFromEventTarget(evt.target);
    if (!pageNumber) return;
    const point = getPdfLocalPoint(pageNumber, evt.clientX, evt.clientY);
    if (!point) return;

    evt.preventDefault();
    evt.stopPropagation();
    if (typeof evt.stopImmediatePropagation === "function") evt.stopImmediatePropagation();

    if (pdfViewer.toolMode === "copy-region") {
        pdfViewer.copyRegionPageNumber = pageNumber;
        pdfViewer.copyRegionRect = { left: point.x, top: point.y, width: 1, height: 1 };
        pdfViewer.toolSession = {
            kind: "copy-region",
            pageNumber,
            startX: point.x,
            startY: point.y,
            pointerId: evt.pointerId,
        };
        renderPdfToolOverlays();
        syncPdfCopyRegionDebugMatches();
        return;
    }

    pdfViewer.capturePreset = normalizePdfCapturePreset(dom.pdfCapturePreset?.value || pdfViewer.capturePreset);
    if (pageNumber !== pdfViewer.capturePageNumber || !pdfViewer.captureRect) {
        pdfViewer.capturePageNumber = pageNumber;
        pdfViewer.captureRect = createDefaultPdfCaptureRect(pageNumber, pdfViewer.capturePreset, point);
    }

    const ratio = getPdfCapturePresetRatio(pdfViewer.capturePreset);
    const bounds = point.bounds;
    const existingRect = pdfViewer.captureRect;
    const corner = getPdfCaptureCornerAtPoint(point, existingRect);
    if (corner) {
        const anchorX = corner.includes("left") ? (existingRect.left + existingRect.width) : existingRect.left;
        const anchorY = corner.includes("top") ? (existingRect.top + existingRect.height) : existingRect.top;
        pdfViewer.toolSession = {
            kind: "capture-thumbnail",
            action: "resize",
            pageNumber,
            pointerId: evt.pointerId,
            corner,
            anchorX,
            anchorY,
            bounds,
            ratio,
        };
    } else if (isPointInsidePdfRect(point, existingRect)) {
        pdfViewer.toolSession = {
            kind: "capture-thumbnail",
            action: "move",
            pageNumber,
            pointerId: evt.pointerId,
            bounds,
            offsetX: point.x - existingRect.left,
            offsetY: point.y - existingRect.top,
        };
    } else {
        pdfViewer.captureRect = { left: point.x, top: point.y, width: 1, height: 1 };
        pdfViewer.toolSession = {
            kind: "capture-thumbnail",
            action: "create",
            pageNumber,
            pointerId: evt.pointerId,
            bounds,
            ratio,
            anchorX: point.x,
            anchorY: point.y,
            corner: "bottom-right",
        };
    }
    renderPdfToolOverlays();
    requestPdfCapturePreviewRender();
}

function handlePdfToolPointerMove(evt) {
    if (!pdfViewer.toolSession) return;
    const session = pdfViewer.toolSession;
    if (typeof session.pointerId === "number" && typeof evt.pointerId === "number" && session.pointerId !== evt.pointerId) {
        return;
    }

    const point = getPdfLocalPoint(session.pageNumber, evt.clientX, evt.clientY);
    if (!point) return;

    evt.preventDefault();
    if (session.kind === "copy-region") {
        pdfViewer.copyRegionRect = buildPdfSelectionRect(
            session.startX,
            session.startY,
            point.x,
            point.y,
            point.bounds,
            8,
        );
        renderPdfToolOverlays();
        syncPdfCopyRegionDebugMatches();
        return;
    }

    if (session.kind !== "capture-thumbnail") return;
    if (session.action === "move") {
        pdfViewer.captureRect = movePdfCaptureRect(
            pdfViewer.captureRect,
            point,
            session.bounds,
            session.offsetX,
            session.offsetY,
        );
    } else {
        if (session.action === "create" && !session.ratio) {
            pdfViewer.captureRect = buildPdfSelectionRect(
                session.anchorX,
                session.anchorY,
                point.x,
                point.y,
                session.bounds,
                28,
            );
            renderPdfToolOverlays();
            requestPdfCapturePreviewRender();
            return;
        }
        const activeCorner = session.action === "create"
            ? `${point.y < session.anchorY ? "top" : "bottom"}-${point.x < session.anchorX ? "left" : "right"}`
            : session.corner;
        pdfViewer.captureRect = buildPdfCaptureRectFromCorner(
            activeCorner,
            session.anchorX,
            session.anchorY,
            point,
            session.ratio,
            session.bounds,
            28,
        );
    }
    renderPdfToolOverlays();
    requestPdfCapturePreviewRender();
}

function handlePdfToolPointerUp(evt) {
    if (!pdfViewer.toolSession) return;
    const session = pdfViewer.toolSession;
    if (typeof session.pointerId === "number" && typeof evt.pointerId === "number" && session.pointerId !== evt.pointerId) {
        return;
    }

    const finalRect = session.kind === "copy-region" ? pdfViewer.copyRegionRect : pdfViewer.captureRect;
    clearPdfToolSession();

    if (session.kind === "copy-region") {
        if (!finalRect || finalRect.width < 12 || finalRect.height < 12) {
            pdfViewer.copyRegionRect = null;
            pdfViewer.copyRegionPageNumber = 0;
            clearPdfCopyRegionDebugMatches();
            renderPdfToolOverlays();
            return;
        }
        copyPdfRegionSelection(session.pageNumber, finalRect).catch((err) => {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Failed to copy PDF region: ${message}`, true);
        });
        renderPdfToolOverlays();
        syncPdfCopyRegionDebugMatches();
        return;
    }

    if (!finalRect || finalRect.width < 12 || finalRect.height < 12) {
        pdfViewer.captureRect = createDefaultPdfCaptureRect(session.pageNumber, pdfViewer.capturePreset);
    }
    renderPdfToolOverlays();
    requestPdfCapturePreviewRender();
}

function handlePdfViewerDoubleClick(evt) {
    if (!isPdfViewerOpen()) return;
    if (pdfViewer.toolMode === "copy-region" || pdfViewer.toolMode === "capture-thumbnail" || isPdfTextSelectToolActive()) return;
    if (!(evt.target instanceof HTMLElement)) return;
    if (!evt.target.closest(".pdf-page-shell, .pdf-canvas-wrap")) return;
    evt.preventDefault();
    setPdfHeaderFolded(!pdfViewer.headerFolded);
}

async function loadPdfJsLib() {
    if (!pdfJsLibPromise) {
        pdfJsLibPromise = import(new URL("./vendor/pdf.min.mjs", window.location.href).href)
            .then((pdfjsLib) => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", window.location.href).href;
                return pdfjsLib;
            })
            .catch((err) => {
                pdfJsLibPromise = null;
                throw err;
            });
    }
    return pdfJsLibPromise;
}

function base64ToUint8Array(base64) {
    const binary = window.atob(base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function getPdfFitScale(baseViewport, mode) {
    const width = Math.max(220, (dom.pdfCanvasWrap?.clientWidth || 0) - 36);
    const height = Math.max(220, (dom.pdfCanvasWrap?.clientHeight || 0) - 36);
    if (!baseViewport?.width || !baseViewport?.height) return 1;
    const fitWidth = width / baseViewport.width;
    const fitPage = Math.min(fitWidth, height / baseViewport.height);
    return clampPdfZoomScale(mode === "fit-page" ? fitPage : fitWidth);
}

async function renderActivePdfPage({ scrollToTop = true, anchor = null } = {}) {
    if (!pdfViewer.doc) return;

    pdfViewer.renderRequestId += 1;
    invalidatePdfPageRenders();
    updateAllPdfPageSurfaceSizes();
    dom.pdfCanvasWrap.classList.remove("hidden");

    if (scrollToTop) {
        scrollPdfPageIntoView(clampPdfPage(pdfViewer.page), "auto");
    } else if (anchor) {
        restorePdfViewportAnchor(anchor);
    }

    renderVisiblePdfPages();
    if (pdfViewer.toolMode === "capture-thumbnail") {
        requestPdfCapturePreviewRender();
    }
    setPdfViewerStatus("");
    persistPdfViewerState();
    syncPdfViewerControls();
}

async function goToPdfPage(pageNumber, options = {}) {
    if (!pdfViewer.doc) return;
    pdfViewer.page = clampPdfPage(pageNumber);
    persistPdfViewerState();
    syncPdfViewerControls();
    dom.pdfCanvasWrap.classList.remove("hidden");
    scrollPdfPageIntoView(pdfViewer.page, options.behavior || "auto");
    renderVisiblePdfPages();
}

function setPdfZoomMode(mode, anchor = capturePdfViewportAnchor()) {
    if (!pdfViewer.doc) return;
    pdfViewer.zoomMode = normalizePdfZoomMode(mode);
    syncPdfViewerControls();
    renderActivePdfPage({ scrollToTop: false, anchor }).catch((err) => {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to adjust zoom: ${message}`, true);
    });
}

function setPdfCustomZoom(nextScale, anchor = capturePdfViewportAnchor()) {
    if (!pdfViewer.doc) return;
    pdfViewer.zoomMode = "custom";
    pdfViewer.zoomScale = clampPdfZoomScale(nextScale);
    syncPdfViewerControls();
    renderActivePdfPage({ scrollToTop: false, anchor }).catch((err) => {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to adjust zoom: ${message}`, true);
    });
}

function nudgePdfZoom(direction) {
    if (!pdfViewer.doc) return;
    const currentScale = clampPdfZoomScale(pdfViewer.zoomScale);
    const multiplier = direction > 0 ? 1.15 : (1 / 1.15);
    setPdfCustomZoom(currentScale * multiplier);
}

function normalizeWheelDeltaToPixels(delta, deltaMode, pageSize) {
    if (!Number.isFinite(delta)) return 0;
    if (deltaMode === 1) return delta * 16;
    if (deltaMode === 2) return delta * Math.max(240, pageSize || 0);
    return delta;
}

function handlePdfViewerGlobalWheel(evt) {
    if (!isPdfViewerOpen()) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (typeof evt.stopImmediatePropagation === "function") evt.stopImmediatePropagation();
    const wrap = dom.pdfCanvasWrap;
    if (!wrap || wrap.classList.contains("hidden")) return;

    if (evt.ctrlKey) {
        if (!pdfViewer.doc) return;
        const anchor = capturePdfViewportAnchor(evt);
        const currentScale = clampPdfZoomScale(pdfViewer.zoomScale);
        const multiplier = Math.exp((-evt.deltaY || 0) * 0.0015);
        setPdfCustomZoom(currentScale * multiplier, anchor);
        return;
    }

    const deltaX = normalizeWheelDeltaToPixels(evt.deltaX, evt.deltaMode, wrap.clientWidth || window.innerWidth || 0);
    const deltaY = normalizeWheelDeltaToPixels(evt.deltaY, evt.deltaMode, wrap.clientHeight || window.innerHeight || 0);
    if (!deltaX && !deltaY) return;

    wrap.scrollLeft += deltaX;
    wrap.scrollTop += deltaY;
}

function normalizePdfSearchQuery(value) {
    return normalizeWhitespace(value).toLowerCase();
}

function updatePdfSearchSummary(overrideText = "") {
    if (overrideText) {
        updatePdfSearchStatus(overrideText);
        return;
    }
    if (!pdfViewer.searchDisplayQuery) {
        updatePdfSearchStatus();
        return;
    }
    if (pdfViewer.searchMatches.length === 0) {
        updatePdfSearchStatus(`No matches for "${pdfViewer.searchDisplayQuery}"`);
        return;
    }
    const activeIndex = Math.max(0, pdfViewer.searchMatchIndex);
    const activePage = pdfViewer.searchMatches[activeIndex]?.pageNumber || pdfViewer.searchMatches[0]?.pageNumber;
    updatePdfSearchStatus(`Match ${activeIndex + 1}/${pdfViewer.searchMatches.length} on page ${activePage}`);
}

async function ensurePdfPageText(pageNumber) {
    if (!pdfViewer.doc) return "";
    if (pdfViewer.pageTextCache.has(pageNumber)) {
        return pdfViewer.pageTextCache.get(pageNumber) || "";
    }
    if (pdfViewer.pageTextPromises.has(pageNumber)) {
        return pdfViewer.pageTextPromises.get(pageNumber);
    }

    const activeDoc = pdfViewer.doc;
    const loadId = pdfViewer.loadRequestId;
    const promise = (async () => {
        const page = await activeDoc.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const text = textContent.items
            .map((item) => normalizeWhitespace(typeof item.str === "string" ? item.str : ""))
            .filter(Boolean)
            .join(" ");
        if (loadId === pdfViewer.loadRequestId && activeDoc === pdfViewer.doc) {
            pdfViewer.pageTextCache.set(pageNumber, text);
        }
        return text;
    })()
        .finally(() => {
            pdfViewer.pageTextPromises.delete(pageNumber);
        });

    pdfViewer.pageTextPromises.set(pageNumber, promise);
    return promise;
}

async function performPdfSearch(rawQuery, { autoJump = true } = {}) {
    const displayQuery = normalizeWhitespace(rawQuery);
    const query = normalizePdfSearchQuery(displayQuery);
    pdfViewer.searchRequestId += 1;
    const requestId = pdfViewer.searchRequestId;
    pdfViewer.searchDisplayQuery = displayQuery;
    pdfViewer.searchQuery = query;
    pdfViewer.searchMatches = [];
    pdfViewer.searchMatchIndex = -1;
    syncPdfViewerControls();

    if (!pdfViewer.doc || !query) {
        updatePdfSearchSummary();
        syncPdfPageListSelection();
        return;
    }

    updatePdfSearchSummary(`Searching 0/${pdfViewer.pageCount}...`);
    const matches = [];
    for (let pageNumber = 1; pageNumber <= pdfViewer.pageCount; pageNumber += 1) {
        if (requestId !== pdfViewer.searchRequestId || !pdfViewer.doc) return;
        try {
            const items = await ensurePdfPageTextGeometry(pageNumber);
            const pageMatches = buildPdfPageSearchMatches(pageNumber, items, query);
            if (pageMatches.length > 0) {
                matches.push(...pageMatches);
            }
        } catch {
            // Skip individual text extraction failures and keep scanning.
        }
        if (pageNumber === pdfViewer.pageCount || pageNumber % 6 === 0) {
            updatePdfSearchSummary(`Searching ${pageNumber}/${pdfViewer.pageCount}...`);
        }
    }

    if (requestId !== pdfViewer.searchRequestId || !pdfViewer.doc) return;

    pdfViewer.searchMatches = matches;
    if (matches.length === 0) {
        pdfViewer.searchMatchIndex = -1;
        updatePdfSearchSummary();
        syncPdfPageListSelection();
        syncPdfViewerControls();
        return;
    }

    const currentIndex = matches.findIndex((match) => match.pageNumber === pdfViewer.page);
    if (currentIndex >= 0) {
        pdfViewer.searchMatchIndex = currentIndex;
        updatePdfSearchSummary();
        syncPdfPageListSelection();
        syncPdfViewerControls();
        const activeMatch = getActivePdfSearchMatch();
        if (autoJump && activeMatch) {
            await goToPdfPage(activeMatch.pageNumber);
            scrollPdfSearchMatchIntoView(activeMatch);
        }
        return;
    }

    const nextIndex = matches.findIndex((match) => match.pageNumber >= pdfViewer.page);
    pdfViewer.searchMatchIndex = nextIndex >= 0 ? nextIndex : 0;
    updatePdfSearchSummary();
    syncPdfPageListSelection();
    syncPdfViewerControls();
    const activeMatch = getActivePdfSearchMatch();
    if (autoJump && activeMatch) {
        await goToPdfPage(activeMatch.pageNumber);
        scrollPdfSearchMatchIntoView(activeMatch);
    }
}

async function movePdfSearch(step) {
    const rawQuery = normalizeWhitespace(dom.pdfSearchInput?.value || "");
    if (!rawQuery) {
        resetPdfSearchState();
        syncPdfViewerControls();
        syncPdfPageListSelection();
        if (dom.pdfSearchInput) dom.pdfSearchInput.focus();
        return;
    }

    if (normalizePdfSearchQuery(rawQuery) !== pdfViewer.searchQuery || pdfViewer.searchMatches.length === 0) {
        await performPdfSearch(rawQuery, { autoJump: true });
        return;
    }

    pdfViewer.searchMatchIndex = (pdfViewer.searchMatchIndex + step + pdfViewer.searchMatches.length) % pdfViewer.searchMatches.length;
    updatePdfSearchSummary();
    syncPdfPageListSelection();
    syncPdfViewerControls();
    const activeMatch = getActivePdfSearchMatch();
    if (!activeMatch) return;
    await goToPdfPage(activeMatch.pageNumber);
    scrollPdfSearchMatchIntoView(activeMatch, "smooth");
}

const debouncedPdfSearch = debounce(() => {
    performPdfSearch(dom.pdfSearchInput?.value || "", { autoJump: true }).catch((err) => {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        updatePdfSearchStatus(`Search failed: ${message}`);
        setStatus(`PDF search failed: ${message}`, true);
    });
}, 180);

const debouncedPdfViewerResize = debounce(() => {
    if (!isPdfViewerOpen() || !pdfViewer.doc) return;
    if (pdfViewer.zoomMode !== "fit-width" && pdfViewer.zoomMode !== "fit-page") return;
    renderActivePdfPage({ scrollToTop: false }).catch((err) => {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to refresh PDF fit view: ${message}`, true);
    });
}, 120);

const debouncedPdfViewerScroll = debounce(() => {
    if (!isPdfViewerOpen() || !pdfViewer.doc) return;
    syncPdfPageFromScroll();
    renderVisiblePdfPages();
}, 24);

async function openPdfExternal(article) {
    markArticleSelected(article);
    try {
        await invoke("open_pdf", { relpath: article.pdf_relpath });
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to open PDF: ${message}`, true);
    }
}

function isUnmodifiedHotkey(binding) {
    return Boolean(binding) && !binding.ctrl && !binding.alt && !binding.shift;
}

function getDefaultPdfOpenMode() {
    const hotkeys = state.hotkeys || DEFAULT_HOTKEYS;
    if (isUnmodifiedHotkey(hotkeys.openPdfInternal)) return "internal";
    if (isUnmodifiedHotkey(hotkeys.openPdfExternal)) return "external";
    return "external";
}

async function openPdf(article) {
    if (getDefaultPdfOpenMode() === "internal") {
        await openPdfInternal(article);
        return;
    }
    await openPdfExternal(article);
}

function handleArticleOpenClick(evt, article) {
    if (!article) return;
    if (evt && resolveClickAction(evt, article)) {
        return;
    }
    if (evt && typeof evt.preventDefault === "function") evt.preventDefault();
    if (evt && typeof evt.stopPropagation === "function") evt.stopPropagation();
    void openPdf(article);
}

function togglePdfCopyRegionTool() {
    if (!isPdfViewerOpen() || !state.enablePdfCopyTool) return false;
    setPdfToolMode(pdfViewer.toolMode === "copy-region" ? "none" : "copy-region");
    syncPdfViewerControls();
    return true;
}

function togglePdfTextSelectTool() {
    if (!isPdfViewerOpen() || !state.enablePdfTextSelectTool) return false;
    const enableTextSelect = !isPdfTextSelectToolActive();
    setPdfToolMode(enableTextSelect ? PDF_TEXT_SELECT_TOOL_MODE : "none");
    syncPdfViewerControls();
    if (!enableTextSelect) return true;
    renderActivePdfPage({ scrollToTop: false, anchor: capturePdfViewportAnchor() }).catch((err) => {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Failed to enable PDF text selection: ${message}`, true);
    });
    return true;
}

function togglePdfThumbnailCaptureTool() {
    if (!isPdfViewerOpen()) return false;
    if (pdfViewer.toolMode === "capture-thumbnail") {
        setPdfToolMode("none");
        syncPdfViewerControls();
        return true;
    }
    renderPdfPageSurface(clampPdfPage(pdfViewer.page))
        .catch(() => { /* best effort: live preview will update once visible render completes */ })
        .finally(() => {
            setPdfToolMode("capture-thumbnail");
            syncPdfViewerControls();
        });
    return true;
}

async function openPdfInternal(article) {
    if (!article?.id) return;
    markArticleSelected(article);
    pdfViewer.loadRequestId += 1;
    pdfViewer.renderRequestId += 1;
    const requestId = pdfViewer.loadRequestId;

    disposePdfDocument();
    resetPdfSearchState({ clearInput: true });
    setPdfHeaderFolded(false);
    setPdfToolMode("none");
    clearPdfCanvas();
    clearNode(dom.pdfPageList);
    if (dom.pdfCanvasWrap) {
        dom.pdfCanvasWrap.scrollTop = 0;
        dom.pdfCanvasWrap.scrollLeft = 0;
        dom.pdfCanvasWrap.classList.add("hidden");
    }
    pdfViewer.article = article;
    const savedState = readSavedPdfViewerState(article.id);
    if (savedState) {
        pdfViewer.page = savedState.page || 1;
        pdfViewer.zoomMode = savedState.zoomMode;
        pdfViewer.zoomScale = savedState.zoomScale;
    } else {
        pdfViewer.page = 1;
        pdfViewer.zoomMode = "custom";
        pdfViewer.zoomScale = clampPdfZoomScale(state.defaultPdfZoom / 100);
    }
    updatePdfViewerHeader();
    syncPdfViewerControls();
    setPdfViewerStatus("Loading PDF...");
    dom.pdfViewerModal.classList.remove("hidden");
    syncPdfExperimentalToolVisibility();

    try {
        const [pdfjsLib, base64Data] = await Promise.all([
            loadPdfJsLib(),
            invoke("get_pdf_data", { articleId: article.id }),
        ]);
        if (requestId !== pdfViewer.loadRequestId) return;

        const loadingTask = pdfjsLib.getDocument({ data: base64ToUint8Array(base64Data) });
        pdfViewer.loadingTask = loadingTask;
        const doc = await loadingTask.promise;
        if (requestId !== pdfViewer.loadRequestId) {
            Promise.resolve(doc.destroy?.()).catch(() => { });
            return;
        }

        pdfViewer.loadingTask = null;
        pdfViewer.doc = doc;
        pdfViewer.pageCount = doc.numPages || 0;
        pdfViewer.page = clampPdfPage(pdfViewer.page);
        if (pdfViewer.pageCount > 0) {
            const firstPage = await doc.getPage(1);
            const firstViewport = firstPage.getViewport({ scale: 1 });
            pdfViewer.defaultBaseViewport = { width: firstViewport.width, height: firstViewport.height };
            pdfViewer.pageBaseSizes.set(1, pdfViewer.defaultBaseViewport);
        }
        updatePdfViewerHeader();
        buildPdfPageSurfaces();
        renderPdfPageList();
        syncPdfViewerControls();
        await renderActivePdfPage();
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setPdfViewerStatus(`Failed to open PDF: ${message}`, true);
        setStatus(`Failed to open embedded PDF viewer: ${message}`, true);
    }
}

function getResolvedPdfViewerArticle() {
    const articleId = pdfViewer.article?.id;
    if (!articleId) return null;
    return resolveArticleById(articleId) || pdfViewer.article;
}

function openPdfViewerMetadata() {
    const article = getResolvedPdfViewerArticle();
    if (!article) return;
    closePdfViewer();
    openEditor(article);
}

function openPdfViewerAbstract() {
    const article = getResolvedPdfViewerArticle();
    if (!article) return;
    closePdfViewer();
    openAbstract(article);
}

function closePdfViewer() {
    pdfViewer.loadRequestId += 1;
    pdfViewer.renderRequestId += 1;
    disposePdfDocument();
    setPdfToolMode("none");
    setPdfHeaderFolded(false);
    pdfViewer.article = null;
    pdfViewer.page = 1;
    pdfViewer.zoomMode = "custom";
    pdfViewer.zoomScale = clampPdfZoomScale(state.defaultPdfZoom / 100);
    resetPdfSearchState({ clearInput: true });
    clearNode(dom.pdfPageList);
    clearPdfCanvas();
    if (dom.pdfCanvasWrap) {
        dom.pdfCanvasWrap.scrollTop = 0;
        dom.pdfCanvasWrap.scrollLeft = 0;
        dom.pdfCanvasWrap.classList.add("hidden");
    }
    setPdfViewerStatus("");
    updatePdfViewerHeader();
    syncPdfViewerControls();
    if (dom.pdfViewerModal) {
        dom.pdfViewerModal.classList.add("hidden");
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
let pdfCopyPreviewHideTimer = null;
let errorBannerHideTimer = null;
let thumbnailUndoHideTimer = null;
const TIMED_NOTICE_DURATION_MS = 10000;
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

function resetTimedNoticeProgress(progressEl) {
    if (!progressEl) return;
    progressEl.style.transition = "none";
    progressEl.style.transform = "scaleX(0)";
}

function setPersistentNoticeProgress(progressEl) {
    if (!progressEl) return;
    progressEl.style.transition = "none";
    progressEl.style.transform = "scaleX(1)";
}

function startTimedNoticeProgress(progressEl, durationMs = TIMED_NOTICE_DURATION_MS) {
    if (!progressEl) return;
    progressEl.style.transition = "none";
    progressEl.style.transform = "scaleX(1)";
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            progressEl.style.transition = `transform ${durationMs}ms linear`;
            progressEl.style.transform = "scaleX(0)";
        });
    });
}

function hidePdfCopyPreview() {
    clearTimeout(pdfCopyPreviewHideTimer);
    pdfCopyPreviewHideTimer = null;
    if (!dom.pdfCopyPreview) return;
    dom.pdfCopyPreview.classList.remove("visible");
    setTimeout(() => {
        if (dom.pdfCopyPreview?.classList.contains("visible")) return;
        dom.pdfCopyPreview.classList.add("hidden");
    }, 220);
    resetTimedNoticeProgress(dom.pdfCopyPreviewProgress);
}

function showPdfCopyPreview(text, durationMs = getPdfCopyPreviewDurationMs()) {
    if (!dom.pdfCopyPreview || !dom.pdfCopyPreviewText) return;
    clearTimeout(pdfCopyPreviewHideTimer);
    dom.pdfCopyPreviewText.textContent = text;
    dom.pdfCopyPreview.classList.remove("hidden");
    dom.pdfCopyPreview.classList.add("visible");
    if (Number.isFinite(durationMs) && durationMs > 0) {
        startTimedNoticeProgress(dom.pdfCopyPreviewProgress, durationMs);
        pdfCopyPreviewHideTimer = setTimeout(() => {
            hidePdfCopyPreview();
        }, durationMs);
    } else {
        setPersistentNoticeProgress(dom.pdfCopyPreviewProgress);
        pdfCopyPreviewHideTimer = null;
    }
}

function hideGlobalErrorBanner() {
    clearTimeout(errorBannerHideTimer);
    errorBannerHideTimer = null;
    if (!dom.errorBanner) return;
    dom.errorBanner.classList.remove("visible");
    setTimeout(() => {
        if (dom.errorBanner?.classList.contains("visible")) return;
        dom.errorBanner.classList.add("hidden");
    }, 220);
    resetTimedNoticeProgress(dom.errorBannerProgress);
}

function showGlobalErrorBanner(message, durationMs = TIMED_NOTICE_DURATION_MS) {
    if (!dom.errorBanner || !dom.errorBannerText) return;
    clearTimeout(errorBannerHideTimer);
    dom.errorBannerText.textContent = message;
    dom.errorBanner.classList.remove("hidden");
    dom.errorBanner.classList.add("visible");
    startTimedNoticeProgress(dom.errorBannerProgress, durationMs);
    errorBannerHideTimer = setTimeout(() => {
        hideGlobalErrorBanner();
    }, durationMs);
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
    const alpha = Math.max(0, Math.min(state.colorIntensity / 100, 1));
    const reach = clampTagGradientReach(state.tagGradientReach);
    const edgeAlpha = Math.min(0.16 + (alpha * 0.6), 0.74);
    const fillAlpha = Math.max(alpha * 0.42, 0.03);
    const softAlpha = Math.max(alpha * 0.18, 0.015);
    return {
        bg: `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${fillAlpha})`,
        softBg: `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${softAlpha})`,
        edge: `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(Math.min(l + 4, 88))}%, ${edgeAlpha})`,
        border: `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(Math.min(l + 10, 90))}%, 0.75)`,
        shadow: `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(Math.min(l + 12, 92))}%, 0.16)`,
        reach,
    };
}

// ---- Theme ----
const VALID_THEMES = new Set(THEME_KEYS);

function getThemePreset(themeKey) {
    const resolvedTheme = VALID_THEMES.has(themeKey) ? themeKey : "ocean";
    return state.themePresets?.[resolvedTheme] || normalizeThemePreset(resolvedTheme, null);
}

function getThemeEditorTheme() {
    return VALID_THEMES.has(state.themeEditorTheme) ? state.themeEditorTheme : state.theme;
}

function hexToRgbChannels(hex) {
    const normalized = normalizeThemeHex(hex, "#000000");
    const clean = normalized.slice(1);
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

function applyThemeVariables(themeKey) {
    const preset = getThemePreset(themeKey);
    const style = document.documentElement.style;

    style.setProperty("--bg", preset.bg);
    style.setProperty("--bg-soft", preset.bgSoft);
    style.setProperty("--panel", preset.panel);
    style.setProperty("--text", preset.text);
    style.setProperty("--muted", preset.muted);
    style.setProperty("--accent", preset.accent);
    style.setProperty("--accent-2", preset.accent2);
    style.setProperty("--danger", preset.danger);
    style.setProperty("--line", preset.line);
    style.setProperty("--body-grad-a", preset.bodyGradA);
    style.setProperty("--body-grad-b", preset.bodyGradB);
    style.setProperty("--body-grad-bg", preset.bodyGradBg);
    style.setProperty("--body-grad-end", preset.bodyGradEnd);
    style.setProperty("--topbar-rgb", hexToRgbChannels(preset.topbarColor));
    style.setProperty("--topbar-alpha-base", String(preset.topbarAlphaBase));
    style.setProperty("--menu-rgb", hexToRgbChannels(preset.menuColor));
    style.setProperty("--menu-alpha-base", String(preset.menuAlphaBase));
}

function setThemeSelectMenuOpen(isOpen) {
    if (!dom.themeSelectMenu || !dom.themeSelectBtn) return;
    dom.themeSelectMenu.classList.toggle("hidden", !isOpen);
    dom.themeSelectBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function renderThemeSelectOptions() {
    if (!dom.themeSelectMenu || !dom.themeSelectValue) return;
    const selectedTheme = VALID_THEMES.has(state.theme) ? state.theme : "ocean";
    dom.themeSelectValue.textContent = getThemePreset(selectedTheme).name;
    dom.themeSelectMenu.innerHTML = THEME_KEYS.map((themeKey) => {
        const presetName = escapeHtml(getThemePreset(themeKey).name);
        const activeClass = themeKey === selectedTheme ? " is-active" : "";
        return `
            <div class="theme-select-option">
                <button type="button" class="theme-select-choice${activeClass}" data-theme-choice="${themeKey}">${presetName}</button>
                <button type="button" class="theme-select-edit" data-theme-edit="${themeKey}" aria-label="Edit ${presetName}" title="Edit ${presetName}">&#9998;</button>
            </div>
        `;
    }).join("");
}

function updateThemeEditorTitle() {
    if (!dom.themeEditorTitle) return;
    dom.themeEditorTitle.textContent = `Edit Theme: ${getThemePreset(getThemeEditorTheme()).name}`;
}

function renderThemeEditor() {
    if (!dom.themeEditorList || !dom.themeEditorName) return;
    const themeKey = getThemeEditorTheme();
    const preset = getThemePreset(themeKey);
    updateThemeEditorTitle();
    dom.themeEditorName.value = preset.name;
    dom.themeEditorList.innerHTML = THEME_COLOR_FIELDS.map((field) => `
        <label class="theme-editor-row">
            <span>${escapeHtml(field.label)}</span>
            <div class="theme-editor-inputs">
                <input type="color" data-theme-color-picker="${field.key}" value="${preset[field.key]}"
                    aria-label="${escapeHtml(field.label)} color" />
                <input type="text" data-theme-color-text="${field.key}" value="${preset[field.key].toUpperCase()}"
                    maxlength="7" spellcheck="false" aria-label="${escapeHtml(field.label)} hex value" />
            </div>
        </label>
    `).join("");
}

function openThemeEditor(themeKey = state.theme) {
    if (!dom.themeEditor) return;
    state.themeEditorTheme = VALID_THEMES.has(themeKey) ? themeKey : "ocean";
    setDisplayMenuOpen(false);
    setThemeSelectMenuOpen(false);
    renderThemeEditor();
    dom.themeEditor.classList.remove("hidden");
}

function closeThemeEditor() {
    if (!dom.themeEditor) return;
    dom.themeEditor.classList.add("hidden");
    state.themeEditorTheme = null;
}

function applyTheme(value) {
    const theme = VALID_THEMES.has(value) ? value : "ocean";
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    applyThemeVariables(theme);
    renderThemeSelectOptions();
}

function setThemePresetName(themeKey, rawName) {
    const preset = getThemePreset(themeKey);
    const normalized = normalizeWhitespace(rawName).slice(0, 40);
    if (!normalized || preset.name === normalized) return false;
    preset.name = normalized;
    saveThemePresets();
    renderThemeSelectOptions();
    updateThemeEditorTitle();
    return true;
}

function setThemePresetColor(themeKey, colorKey, rawValue) {
    const preset = getThemePreset(themeKey);
    const fallback = preset[colorKey] || DEFAULT_THEME_PRESETS[themeKey]?.[colorKey] || "#000000";
    const normalized = normalizeThemeHex(rawValue, fallback);
    if (!normalized || preset[colorKey] === normalized) return false;
    preset[colorKey] = normalized;
    saveThemePresets();
    if (state.theme === themeKey) applyTheme(themeKey);
    return true;
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

async function renameTagEverywhere() {
    const sourceInput = window.prompt("Rename which tag?", state.tags[0] || "");
    if (sourceInput === null) return;

    const sourceTag = resolveKnownTagName(sourceInput);
    if (!sourceTag) {
        setStatus(`Tag not found: ${normalizeWhitespace(sourceInput) || "(blank)"}`, true);
        return;
    }

    const nextInput = window.prompt(`Rename "${sourceTag}" to:`, sourceTag);
    if (nextInput === null) return;

    const targetTag = normalizeWhitespace(nextInput);
    if (!targetTag) {
        setStatus("Replacement tag cannot be blank.", true);
        return;
    }
    if (normalizeTagKey(sourceTag) === normalizeTagKey(targetTag) && sourceTag === targetTag) {
        setStatus("Tag name is unchanged.");
        return;
    }
    if (!window.confirm(`Rename "${sourceTag}" to "${targetTag}" across the library?`)) {
        return;
    }

    setStatus(`Renaming "${sourceTag}"...`);
    try {
        const result = await invoke("rename_tag_everywhere", { fromTag: sourceTag, toTag: targetTag });
        state.tags = state.tags.map((tag) => normalizeTagKey(tag) === normalizeTagKey(sourceTag) ? targetTag : tag);
        pruneSelectedTagsToKnown();
        updateTagFilterUI();
        invalidateTagSuggestionCorpus();
        await Promise.all([loadTags(), loadArticles()]);
        setFilesMenuOpen(false);
        const updatedCount = Number(result?.updated_count) || 0;
        setStatus(updatedCount > 0
            ? `Renamed "${sourceTag}" to "${targetTag}" in ${updatedCount} article(s).`
            : `No articles were using "${sourceTag}".`);
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Tag rename failed: ${message}`, true);
    }
}

async function removeTagEverywhere() {
    const sourceInput = window.prompt("Remove which tag from every article?", state.tags[0] || "");
    if (sourceInput === null) return;

    const tagName = resolveKnownTagName(sourceInput);
    if (!tagName) {
        setStatus(`Tag not found: ${normalizeWhitespace(sourceInput) || "(blank)"}`, true);
        return;
    }
    if (!window.confirm(`Remove "${tagName}" from every article that uses it?`)) {
        return;
    }

    setStatus(`Removing "${tagName}"...`);
    try {
        const result = await invoke("remove_tag_everywhere", { tagName });
        state.tags = state.tags.filter((tag) => normalizeTagKey(tag) !== normalizeTagKey(tagName));
        pruneSelectedTagsToKnown();
        updateTagFilterUI();
        invalidateTagSuggestionCorpus();
        await Promise.all([loadTags(), loadArticles()]);
        setFilesMenuOpen(false);
        const updatedCount = Number(result?.updated_count) || 0;
        setStatus(updatedCount > 0
            ? `Removed "${tagName}" from ${updatedCount} article(s).`
            : `No articles were using "${tagName}".`);
    } catch (err) {
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Tag removal failed: ${message}`, true);
    }
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
    if (modMatch(evt, hk.openPdfInternal)) { evt.preventDefault(); evt.stopPropagation(); openPdfInternal(article); return true; }
    if (modMatch(evt, hk.openPdfExternal)) { evt.preventDefault(); evt.stopPropagation(); openPdfExternal(article); return true; }
    // No binding matched — fall through (e.g., right-click menus)
    return false;
}

const CLICK_ACTIONS = [
    { key: "openPdfExternal", label: "open PDF externally" },
    { key: "openPdfInternal", label: "open PDF internally" },
    { key: "editMetadata", label: "edit metadata" },
    { key: "openAbstract", label: "preview abstract" },
    { key: "copyBibtex", label: "copy BibTeX" },
    { key: "openLocation", label: "open file location" },
];
const KEYBOARD_SHORTCUTS = [
    { label: "paste thumbnail", key: "pasteThumb" },
    { label: "PDF copy tool", key: "pdfCopyTool" },
    { label: "PDF thumbnail tool", key: "pdfThumbnailTool" },
    { label: "save & close", key: "enter" },
    { label: "prev modal", key: "prevModal" },
    { label: "next modal", key: "nextModal" },
    { label: "prev article", key: "prevArticle" },
    { label: "next article", key: "nextArticle" },
];
const WELLNESS_TIPS = [
    {
        text: "20/20/20 rule! — every 20 minutes, look 20 feet away for 20 seconds to reduce eye strain!",
        // sourceLabel: "Source: Mayo Clinic",
        // sourceUrl: "https://www.mayoclinic.org/diseases-conditions/eyestrain/diagnosis-treatment/drc-20372403",
    },
    {
        text: "blink! — screen time can lower blink rate by 80%.  Try 5 blinks after each paragraph!",
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
        text: "posture check! — are you tensing your shoulders, neck, back, wrists?  Take a minute to stretch and reset each of them!",
    },
    {   
        text: "meditate! — quickly note where you are in your work and set a timer for a few minutes.  Then close your eyes, sit back, and still your mind!"
    },
    {
        text: "clench check! — try relaxing your jaw and resting your tongue lightly on the roof of your mouth!  Pop some gum if it helps you!",
    },
    {
        text: "'name it to tame it'! — reduce distress by identifying your feelings in words!",
        // sourceLabel: "Source: DOI 10.1371/journal.pone.0279303",
        // sourceUrl: "https://doi.org/10.1371/journal.pone.0279303",
    },
    {
        text: "sleep!  water!  healthy snack!  fresh air!  send a joke to a friend!"
    },
    {
        text: "upgrade to the PDF Manager+ Subscription Plan now for full access!  Just kidding!"
    }
];

// Hotkey capture state
let _hkListening = null; // { key, cleanup }

function buildHotkeyTable() {
    syncKeyboardShortcutButtonHints();
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
    resetBtn.addEventListener("click", () => { state.hotkeys = cloneDefaultHotkeys(); saveHotkeys(); buildHotkeyTable(); });
    resetRow.appendChild(resetBtn);
    container.appendChild(resetRow);

    // ─── Separator ───
    const sep = document.createElement("hr");
    sep.style.cssText = "border:none;border-top:1px solid var(--line);margin:12px 0;";
    container.appendChild(sep);

    // ─── Keyboard-shortcut section ───
    const kbHeader = document.createElement("div");
    kbHeader.style.cssText = "font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;padding:0 0 4px;";
    kbHeader.textContent = "Hotkeys";
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
    markArticleSelected(article);
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
    const notesText = typeof md.notes === "string" ? md.notes.trim() : "";
    if (dom.abstractNotesSection && dom.abstractNotesText) {
        const shouldShowNotes = state.showAbstractPreviewNotes && Boolean(notesText);
        dom.abstractNotesSection.style.display = shouldShowNotes ? "block" : "none";
        dom.abstractNotesText.innerHTML = shouldShowNotes ? renderMarkdownToHtml(notesText) : "";
    }
    debugLog(`Opened abstract modal for article ${article.id} (sections=${state.abstractSectionCount}, notes=${state.showAbstractPreviewNotes && Boolean(notesText)}).`);

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

const MODAL_ROTATION_ORDER = ["metadata", "abstract", "pdf"];

function getCurrentModalRotationView() {
    if (!dom.modal.classList.contains("hidden")) return "metadata";
    if (!dom.abstractModal.classList.contains("hidden")) return "abstract";
    if (isPdfViewerOpen()) return "pdf";
    return "";
}

function getAdjacentModalRotationView(currentView, direction) {
    const currentIndex = MODAL_ROTATION_ORDER.indexOf(currentView);
    if (currentIndex < 0) return "";
    const span = MODAL_ROTATION_ORDER.length;
    const step = direction < 0 ? -1 : 1;
    return MODAL_ROTATION_ORDER[(currentIndex + step + span) % span];
}

function closeModalRotationView(view) {
    if (view === "metadata") {
        closeEditor();
        return;
    }
    if (view === "abstract") {
        closeAbstract();
        return;
    }
    if (view === "pdf") {
        closePdfViewer();
    }
}

async function openModalRotationView(view, article) {
    if (!article?.id) return;
    if (view === "metadata") {
        openEditor(article);
        return;
    }
    if (view === "abstract") {
        openAbstract(article);
        return;
    }
    if (view === "pdf") {
        await openPdfInternal(article);
    }
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
    if (article.id === state.recentArticleId) card.classList.add("recently-selected");
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
        card.style.background = `linear-gradient(135deg, ${tint.edge} 0%, ${tint.bg} ${tint.reach}%, ${tint.softBg} ${Math.min(tint.reach + 18, 78)}%, transparent ${Math.min(tint.reach + 34, 94)}%)`;
        card.style.boxShadow = `inset 0 0 0 1px ${tint.edge}, 0 10px 28px rgba(0, 0, 0, 0.3), 0 0 0 1px ${tint.shadow}`;
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
        if (article.id === state.recentArticleId) row.classList.add("recently-selected");
        if (state.highlightIncomplete && hasEmptyMetadata(article)) {
            row.classList.add("card-incomplete");
        }

        row.tabIndex = 0;
        const tint = getCardTint(article);
        if (tint) {
            row.style.background = `linear-gradient(90deg, ${tint.edge} 0%, ${tint.bg} ${Math.max(12, Math.round(tint.reach * 0.75))}%, transparent ${Math.min(tint.reach + 22, 92)}%)`;
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
        syncRecentArticleHighlight();
        return;
    }
    sortedArticles.forEach((article) => dom.grid.appendChild(buildCard(article)));
    syncRecentArticleHighlight();
}

async function loadTags() {
    const result = await invoke("get_tags");
    const options = result.tags || [];
    state.allKnownTags = options.map((tagRow) => tagRow.name);
    pruneSelectedTagsToKnown();

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

function syncTagMatchModeUi(mode) {
    const resolvedMode = ["all", "none"].includes(mode) ? mode : "any";
    const tagMatchRadios = document.querySelectorAll('input[name="tag-match-mode"]');
    const tmAnyLbl = document.getElementById("tm-any-lbl");
    const tmAllLbl = document.getElementById("tm-all-lbl");
    const tmNoneLbl = document.getElementById("tm-none-lbl");

    tagMatchRadios.forEach((radio) => {
        radio.checked = radio.value === resolvedMode;
    });

    if (resolvedMode === "all") {
        if (tmAllLbl) { tmAllLbl.style.background = "var(--accent)"; tmAllLbl.style.color = "white"; }
        if (tmAnyLbl) { tmAnyLbl.style.background = "var(--bg)"; tmAnyLbl.style.color = "var(--text)"; }
        if (tmNoneLbl) { tmNoneLbl.style.background = "var(--bg)"; tmNoneLbl.style.color = "var(--text)"; }
    } else if (resolvedMode === "none") {
        if (tmNoneLbl) { tmNoneLbl.style.background = "var(--accent)"; tmNoneLbl.style.color = "white"; }
        if (tmAnyLbl) { tmAnyLbl.style.background = "var(--bg)"; tmAnyLbl.style.color = "var(--text)"; }
        if (tmAllLbl) { tmAllLbl.style.background = "var(--bg)"; tmAllLbl.style.color = "var(--text)"; }
    } else {
        if (tmAnyLbl) { tmAnyLbl.style.background = "var(--accent)"; tmAnyLbl.style.color = "white"; }
        if (tmAllLbl) { tmAllLbl.style.background = "var(--bg)"; tmAllLbl.style.color = "var(--text)"; }
        if (tmNoneLbl) { tmNoneLbl.style.background = "var(--bg)"; tmNoneLbl.style.color = "var(--text)"; }
    }
}

function refreshPreferenceStateFromStorage() {
    state.viewMode = window.localStorage.getItem("article-view-mode") || "preview";
    if (state.viewMode !== "preview" && state.viewMode !== "details") {
        state.viewMode = "preview";
    }
    state.cardHeight = Number.parseInt(window.localStorage.getItem("article-card-height") || "138", 10);
    state.autoFitHeight = window.localStorage.getItem("article-autofit-height") === "true";
    state.cardWidth = Number.parseInt(window.localStorage.getItem("article-card-width") || "200", 10);
    state.cardFont = Number.parseInt(window.localStorage.getItem("article-card-font") || "14", 10);
    state.fontFamily = normalizeFontKey(window.localStorage.getItem("article-font-family") || "segoe", "segoe");
    state.themePresets = loadThemePresets();
    state.theme = VALID_THEMES.has(window.localStorage.getItem("article-theme") || "ocean")
        ? (window.localStorage.getItem("article-theme") || "ocean")
        : "ocean";
    state.primarySort = normalizeSortKey(window.localStorage.getItem("article-primary-sort") || "year_desc", "year_desc");
    state.secondarySort = normalizeSortKey(window.localStorage.getItem("article-secondary-sort") || "title_asc", "title_asc");
    state.tagFilterMode = window.localStorage.getItem("article-tag-mode") || "all";
    state.tintByTag = window.localStorage.getItem("article-tint-by-tag") === "true";
    state.filterIncomplete = window.localStorage.getItem("article-filter-incomplete") === "true";
    state.autoRefCompile = window.localStorage.getItem("article-auto-ref") === "true";
    state.showDupeWarnings = window.localStorage.getItem("article-dupe-warnings") !== "false";
    state.colorIntensity = Number.parseInt(window.localStorage.getItem("article-color-intensity") || "13", 10);
    state.tagGradientReach = Number.parseInt(window.localStorage.getItem("article-tag-gradient-reach") || "26", 10);
    state.modalBackdropDarkness = Number.parseInt(window.localStorage.getItem("article-modal-backdrop-darkness") || "58", 10);
    state.surfaceOpacity = Number.parseInt(window.localStorage.getItem("article-surface-opacity") || "100", 10);
    state.defaultPdfZoom = Number.parseInt(window.localStorage.getItem(DEFAULT_PDF_ZOOM_KEY) || "100", 10);
    state.nightFilterEnabled = initNightFilterEnabledPreference();
    state.nightFilterMode = normalizeNightFilterMode(window.localStorage.getItem("article-night-filter-mode") || "warm");
    state.nightFilterStrength = clampNightFilterStrength(window.localStorage.getItem("article-night-filter-strength") || "0");
    state.enablePdfCopyTool = window.localStorage.getItem(PDF_COPY_TOOL_ENABLED_KEY) === "true";
    state.enablePdfTextSelectTool = window.localStorage.getItem(PDF_TEXT_SELECT_TOOL_ENABLED_KEY) === "true";
    state.previewCopiedText = window.localStorage.getItem(PDF_COPY_PREVIEW_ENABLED_KEY) !== "false";
    state.pdfCopyPreviewDurationSetting = clampInfiniteSliderSetting(
        window.localStorage.getItem(PDF_COPY_PREVIEW_DURATION_KEY),
        DEFAULT_PDF_COPY_PREVIEW_DURATION_SETTING,
    );
    state.enablePdfThumbnailCapture = true;
    state.downscalePdfCaptureImages = window.localStorage.getItem(PDF_CAPTURE_DOWNSCALE_ENABLED_KEY) !== "false";
    state.enablePdfStarryBackground = window.localStorage.getItem(PDF_STARRY_BACKGROUND_ENABLED_KEY) === "true";
    state.audioEnabled = window.localStorage.getItem(AUDIO_ENABLED_KEY) === "true";
    state.audioVolume = clampAmbientAudioVolume(window.localStorage.getItem(AUDIO_VOLUME_KEY) || String(DEFAULT_AUDIO_VOLUME));
    state.pdfStarryBrightness = clampPdfStarryBrightness(window.localStorage.getItem(PDF_STARRY_BRIGHTNESS_KEY));
    state.pdfStarrySpeed = clampPdfStarrySpeed(window.localStorage.getItem(PDF_STARRY_SPEED_KEY));
    state.pdfStarryDensity = clampPdfStarryDensity(window.localStorage.getItem(PDF_STARRY_DENSITY_KEY));
    state.pdfStarryStraightness = clampPdfStarryStraightness(window.localStorage.getItem(PDF_STARRY_STRAIGHTNESS_KEY));
    state.unlockPdfViewerWidth = window.localStorage.getItem(PDF_VIEWER_WIDTH_UNLOCKED_KEY) === "true";
    state.showAbstractPreviewNotes = window.localStorage.getItem(ABSTRACT_PREVIEW_NOTES_ENABLED_KEY) === "true";
    state.tagColors = JSON.parse(window.localStorage.getItem("article-tag-colors") || "{}");
    state.hotkeys = loadHotkeys();
    state.keyboardShortcuts = loadKeyboardShortcuts();
    state.nicheTags = JSON.parse(window.localStorage.getItem("article-niche-tags") || "[]");
    state.enableNiche = initEnableNichePreference();
    state.showNiche = initShowNichePreference();
    state.showRefDois = initShowRefDoisPreference();
    state.wellnessTipIndex = normalizeTipIndex(Number.parseInt(window.localStorage.getItem("article-wellness-tip-index") || "0", 10));
    state.showErrorsGlobally = window.localStorage.getItem("article-show-errors") !== "false";
    state.abstractSectionCount = clampAbstractSectionCount(window.localStorage.getItem("article-abstract-sections") || "4");
    state.debugMode = window.localStorage.getItem("article-debug-mode") === "true";
    state.debugLogRetentionSetting = clampInfiniteSliderSetting(
        window.localStorage.getItem(DEBUG_LOG_RETENTION_KEY),
        DEFAULT_DEBUG_LOG_RETENTION_SETTING,
    );

    if (_hkListening) {
        _hkListening.cleanup();
        _hkListening = null;
    }

    if (dom.viewModeToggle) dom.viewModeToggle.checked = state.viewMode === "details";
    if (dom.primarySort) dom.primarySort.value = state.primarySort;
    if (dom.secondarySort) dom.secondarySort.value = state.secondarySort;
    if (dom.cardHeightAutofit) dom.cardHeightAutofit.checked = state.autoFitHeight;
    if (dom.autoRefCompile) dom.autoRefCompile.checked = state.autoRefCompile;
    if (dom.filterIncomplete) dom.filterIncomplete.checked = state.filterIncomplete;
    if (dom.tintByTag) dom.tintByTag.checked = state.tintByTag;
    if (dom.showDupeWarnings) dom.showDupeWarnings.checked = state.showDupeWarnings;
    if (dom.showErrorsCheckbox) dom.showErrorsCheckbox.checked = state.showErrorsGlobally;
    if (dom.showRefDoisCheckbox) dom.showRefDoisCheckbox.checked = state.showRefDois;
    if (dom.showAbstractPreviewNotesCheckbox) dom.showAbstractPreviewNotesCheckbox.checked = state.showAbstractPreviewNotes;
    if (dom.debugModeCheckbox) dom.debugModeCheckbox.checked = state.debugMode;
    if (dom.enableNicheCheckbox) dom.enableNicheCheckbox.checked = state.enableNiche;
    if (dom.showNicheCheckbox) dom.showNicheCheckbox.checked = state.enableNiche ? state.showNiche : false;
    if (dom.nicheTagsInput) dom.nicheTagsInput.value = "";
    setNicheTagChips(state.nicheTags);

    applyCardHeight(state.cardHeight);
    applyCardWidth(state.cardWidth);
    applyCardFont(state.cardFont);
    applyModalBackdropDarkness(state.modalBackdropDarkness);
    applySurfaceOpacity(state.surfaceOpacity);
    applyDefaultPdfZoom(state.defaultPdfZoom);
    applyFontFamily(state.fontFamily);
    applyTheme(state.theme);
    applyNightFilter(state.nightFilterMode, state.nightFilterStrength);
    updateNightFilterControlVisibility();
    updateTagTintControlVisibility();
    applyTagGradientReach(state.tagGradientReach);
    applyAbstractSectionCount(state.abstractSectionCount);
    updateNicheUiVisibility();
    syncTagMatchModeUi(state.tagFilterMode);
    syncExperimentalNestedOptions();
    syncPdfExperimentalToolVisibility();
    syncPdfViewerControls();
    syncPdfViewerChromeState();
    void setAmbientAudioEnabled(state.audioEnabled, { showError: false });
    if (dom.colorIntensitySlider) dom.colorIntensitySlider.value = String(state.colorIntensity);
    if (dom.colorIntensityValue) dom.colorIntensityValue.textContent = String(state.colorIntensity);
    if (!state.showErrorsGlobally) {
        hideGlobalErrorBanner();
    }
    buildHotkeyTable();
    renderThemeSelectOptions();
    renderArticles();
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
    closePdfViewer();
    stopThumbnailUndoPrompt();
    thumbCache.clear();
    invalidateTagSuggestionCorpus();
    state.current = null;
    state.recentArticleId = null;
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

    let restoredPreferenceSnapshot = true;
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
        if (nextMode) {
            storeDemoModePreferenceSnapshot();
            resetStoredArticlePreferencesToDefaults();
        } else {
            restoredPreferenceSnapshot = restoreStoredArticlePreferences(readDemoModePreferenceSnapshot());
            window.localStorage.removeItem(DEMO_MODE_PREF_SNAPSHOT_KEY);
        }

        refreshPreferenceStateFromStorage();
    }

    if (!startup) {
        try {
            await reloadLibraryForStorageSwitch();
        } catch (err) {
            const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
            setStatus(`Demo mode switched, but reload failed: ${message}`, true);
            return false;
        }
        if (!nextMode && !restoredPreferenceSnapshot) {
            setStatus("Demo data deleted, but the previous preference snapshot was unavailable.", true);
        } else {
            showToast(nextMode ? "Demo mode enabled" : "Demo data deleted");
        }
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
    if (!state.query && state.tags.length === 0 && !state.filterIncomplete && state.total <= state.articles.length) {
        state.tagSuggestionArticles = state.articles.slice();
        state.tagSuggestionCorpusMode = state.demoMode ? "demo" : "primary";
        state.tagSuggestionCorpusLoaded = true;
    }
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
    markArticleSelected(article);
    state.current = article;
    state.metadataSavedSinceOpen = false;
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
    setTagChips(md.tags || [], { silent: true });
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
    setMetadataBaselineFromArticle(article);
    refreshTagSuggestions();
}

function closeEditor() {
    state.current = null;
    dom.modal.classList.add("hidden");
    if (dom.thumbFile) dom.thumbFile.value = "";
    dom.modalThumbWrap.classList.remove("drag-active");
    hideTagSuggestions();
    clearMetadataChangeTracking();
}

async function saveMetadata(evt) {
    if (evt && typeof evt.preventDefault === "function") evt.preventDefault();
    if (!state.current) return;
    const currentId = state.current.id;
    const trigger = evt?.type || "manual";
    const markSavedWhenUnchanged = evt?.markSavedWhenUnchanged === true;
    const previousTags = dedupeTagsCaseInsensitive(state.current.metadata?.tags || []);
    const snapshot = buildEditorMetadataSnapshot();
    const snapshotKey = buildMetadataSnapshotKey(snapshot);
    if (snapshotKey === state.metadataBaselineKey) {
        state.metadataDirty = false;
        if (markSavedWhenUnchanged) {
            state.metadataSavedSinceOpen = true;
        }
        updateMetadataDirtyIndicator();
        return "unchanged";
    }

    const payload = {
        title: snapshot.title,
        authors: snapshot.authors,
        year: snapshot.year,
        journal: snapshot.journal,
        volume: snapshot.volume,
        number: snapshot.number,
        pages: snapshot.pages,
        doi: snapshot.doi,
        abstract: snapshot.abstract,
        tags: snapshot.tags,
        notes: snapshot.notes,
        ref_dois: snapshot.ref_dois,
    };

    setStatus("Saving metadata...");
    setMetadataSavingState(true);
    debugLog(`Saving metadata for article ${currentId} (trigger=${trigger}, ref_dois=${snapshot.ref_dois.length}).`);
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
        upsertTagSuggestionCorpusArticle(savedArticle);
        const filterSelectionChanged = reconcileSelectedTagsAfterMetadataChange(previousTags, savedArticle.metadata?.tags || []);
        await loadTags();
        if (state.query || state.tags.length > 0 || state.filterIncomplete || filterSelectionChanged) {
            await loadArticles();
        } else {
            renderArticles();
        }
        if (state.current?.id === currentId && !dom.modal.classList.contains("hidden")) {
            state.current = resolveArticleById(currentId) || savedArticle;
            setMetadataBaselineFromArticle(state.current, { markSaved: true });
        } else {
            setMetadataBaselineFromArticle(savedArticle, { markSaved: true });
        }
        refreshTagSuggestions({ allowCorpusLoad: false });
        setStatus("Metadata saved.");
        return "saved";
    } catch (err) {
        setMetadataSavingState(false);
        const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
        setStatus(`Save failed: ${message}`, true);
        refreshMetadataDirtyState();
        return "failed";
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

function isEditableFieldWithin(container, element) {
    if (!(element instanceof HTMLElement)) return false;
    if (!container || !container.contains(element)) return false;
    if (element.matches("textarea, select")) return true;
    if (!element.matches("input")) return element.isContentEditable;

    const inputType = (element.getAttribute("type") || "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "file", "hidden"].includes(inputType);
}

function isMetadataEditableField(element) {
    return isEditableFieldWithin(dom.form, element);
}

function isPdfViewerEditableField(element) {
    return isEditableFieldWithin(dom.pdfViewerModal, element);
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
    return replaceThumbnailImage(article, file);
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
        invalidateTagSuggestionCorpus();
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
            const addedText = prettyDate(article.date_added) || article.date_added || "Unknown";
            meta.textContent = `${article.pdf_filename} | Added: ${addedText}`;
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
                    removeTagSuggestionCorpusArticle(article.id);
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
    applyDefaultPdfZoom(state.defaultPdfZoom);
    applyFontFamily(state.fontFamily);
    applyNightFilter(state.nightFilterMode, state.nightFilterStrength);
    updateNightFilterControlVisibility();
    syncPdfExperimentalToolVisibility();
    syncPdfViewerChromeState();
    updateTagTintControlVisibility();
    if (dom.colorIntensitySlider) {
        dom.colorIntensitySlider.value = String(state.colorIntensity);
    }
    if (dom.colorIntensityValue) {
        dom.colorIntensityValue.textContent = String(state.colorIntensity);
    }
    applyTagGradientReach(state.tagGradientReach);
    applyAbstractSectionCount(state.abstractSectionCount);
    setDisplayMenuOpen(false);
    setFilesMenuOpen(false);
    wireSliderToggles(dom.displayMenu);
    wireSliderToggles(dom.filesMenu);
    wireSliderToggles(dom.pdfNightFilterControls);
    wireRangeDoubleClickResets();

    dom.searchInput.addEventListener("input", debouncedSearch);
    if (dom.form) {
        dom.form.addEventListener("input", (evt) => {
            if (evt.target === dom.tagInput || evt.target === dom.pasteCleanup) return;
            refreshMetadataDirtyState();
        });
        dom.form.addEventListener("change", (evt) => {
            if (evt.target === dom.pasteCleanup) return;
            refreshMetadataDirtyState();
        });
    }
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
    applyTheme(state.theme);

    if (dom.themeSelectBtn) {
        dom.themeSelectBtn.addEventListener("click", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            setThemeSelectMenuOpen(dom.themeSelectMenu?.classList.contains("hidden"));
        });

        dom.themeSelectBtn.addEventListener("keydown", (evt) => {
            if (evt.key !== "Enter" && evt.key !== " ") return;
            evt.preventDefault();
            setThemeSelectMenuOpen(dom.themeSelectMenu?.classList.contains("hidden"));
        });
    }

    if (dom.themeSelectMenu) {
        dom.themeSelectMenu.addEventListener("click", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const editBtn = evt.target.closest("[data-theme-edit]");
            if (editBtn) {
                openThemeEditor(editBtn.dataset.themeEdit);
                return;
            }

            const choiceBtn = evt.target.closest("[data-theme-choice]");
            if (!choiceBtn) return;
            const themeKey = choiceBtn.dataset.themeChoice;
            applyTheme(themeKey);
            setThemeSelectMenuOpen(false);
            if (dom.themeEditor && !dom.themeEditor.classList.contains("hidden") && getThemeEditorTheme() === themeKey) {
                renderThemeEditor();
            }
            window.localStorage.setItem("article-theme", state.theme);
        });
    }

    if (dom.themeEditorClose) {
        dom.themeEditorClose.addEventListener("click", () => {
            closeThemeEditor();
        });
    }

    if (dom.themeEditorName) {
        dom.themeEditorName.addEventListener("input", () => {
            const themeKey = getThemeEditorTheme();
            if (setThemePresetName(themeKey, dom.themeEditorName.value)) {
                dom.themeEditorName.value = getThemePreset(themeKey).name;
            }
        });
        dom.themeEditorName.addEventListener("blur", () => {
            const preset = getThemePreset(getThemeEditorTheme());
            const normalized = normalizeWhitespace(dom.themeEditorName.value).slice(0, 40);
            if (!normalized) {
                dom.themeEditorName.value = preset.name;
                return;
            }
            if (normalized !== dom.themeEditorName.value) {
                dom.themeEditorName.value = normalized;
            }
        });
    }

    if (dom.themeEditorList) {
        dom.themeEditorList.addEventListener("input", (evt) => {
            const themeKey = getThemeEditorTheme();
            const picker = evt.target.closest("[data-theme-color-picker]");
            if (picker) {
                const colorKey = picker.dataset.themeColorPicker;
                if (!colorKey) return;
                if (setThemePresetColor(themeKey, colorKey, picker.value)) {
                    const row = picker.closest(".theme-editor-row");
                    const textInput = row?.querySelector(`[data-theme-color-text="${colorKey}"]`);
                    if (textInput) textInput.value = picker.value.toUpperCase();
                }
                return;
            }

            const textInput = evt.target.closest("[data-theme-color-text]");
            if (!textInput) return;
            const colorKey = textInput.dataset.themeColorText;
            if (!colorKey) return;
            const normalized = normalizeThemeHex(textInput.value, "");
            if (!normalized) return;
            if (setThemePresetColor(themeKey, colorKey, normalized)) {
                const row = textInput.closest(".theme-editor-row");
                const colorInput = row?.querySelector(`[data-theme-color-picker="${colorKey}"]`);
                if (colorInput) colorInput.value = normalized;
            }
            textInput.value = normalized.toUpperCase();
        });

        dom.themeEditorList.addEventListener("focusout", (evt) => {
            const textInput = evt.target.closest("[data-theme-color-text]");
            if (!textInput) return;
            const colorKey = textInput.dataset.themeColorText;
            if (!colorKey) return;
            textInput.value = getThemePreset(getThemeEditorTheme())[colorKey].toUpperCase();
        });
    }

    if (dom.themeEditorReset) {
        dom.themeEditorReset.addEventListener("click", () => {
            const themeKey = getThemeEditorTheme();
            const preset = getThemePreset(themeKey);
            if (!window.confirm(`Reset "${preset.name}" to its default theme name and colors?`)) return;
            state.themePresets[themeKey] = cloneThemePreset(DEFAULT_THEME_PRESETS[themeKey]);
            saveThemePresets();
            if (state.theme === themeKey) applyTheme(state.theme);
            else renderThemeSelectOptions();
            renderThemeEditor();
            setStatus(`Reset theme "${getThemePreset(themeKey).name}" to defaults.`);
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

    if (dom.parsePdfs) {
        dom.parsePdfs.addEventListener("change", () => {
            syncExperimentalNestedOptions();
        });
    }

    if (dom.enablePdfCopyToolCheckbox) {
        dom.enablePdfCopyToolCheckbox.checked = state.enablePdfCopyTool;
        dom.enablePdfCopyToolCheckbox.addEventListener("change", () => {
            state.enablePdfCopyTool = dom.enablePdfCopyToolCheckbox.checked;
            window.localStorage.setItem(PDF_COPY_TOOL_ENABLED_KEY, state.enablePdfCopyTool ? "true" : "false");
            syncExperimentalNestedOptions();
            syncPdfExperimentalToolVisibility();
            syncPdfViewerControls();
        });
    }

    if (dom.enablePdfTextSelectCheckbox) {
        dom.enablePdfTextSelectCheckbox.checked = state.enablePdfTextSelectTool;
        dom.enablePdfTextSelectCheckbox.addEventListener("change", () => {
            state.enablePdfTextSelectTool = dom.enablePdfTextSelectCheckbox.checked;
            window.localStorage.setItem(PDF_TEXT_SELECT_TOOL_ENABLED_KEY, state.enablePdfTextSelectTool ? "true" : "false");
            syncExperimentalNestedOptions();
            syncPdfExperimentalToolVisibility();
            syncPdfViewerControls();
        });
    }

    if (dom.enableAudioCheckbox) {
        dom.enableAudioCheckbox.checked = state.audioEnabled;
        dom.enableAudioCheckbox.addEventListener("change", () => {
            void setAmbientAudioEnabled(dom.enableAudioCheckbox.checked, { showError: true });
        });
    }

    if (dom.audioVolumeSlider) {
        dom.audioVolumeSlider.value = String(state.audioVolume);
        const commitAudioVolume = () => {
            state.audioVolume = clampAmbientAudioVolume(dom.audioVolumeSlider.value);
            window.localStorage.setItem(AUDIO_VOLUME_KEY, String(state.audioVolume));
            syncExperimentalNestedOptions();
            applyAmbientAudioVolume();
        };
        dom.audioVolumeSlider.addEventListener("input", commitAudioVolume);
        dom.audioVolumeSlider.addEventListener("change", commitAudioVolume);
    }

    if (dom.previewCopiedTextCheckbox) {
        dom.previewCopiedTextCheckbox.checked = state.previewCopiedText;
        dom.previewCopiedTextCheckbox.addEventListener("change", () => {
            state.previewCopiedText = dom.previewCopiedTextCheckbox.checked;
            window.localStorage.setItem(PDF_COPY_PREVIEW_ENABLED_KEY, state.previewCopiedText ? "true" : "false");
            if (!state.previewCopiedText) {
                hidePdfCopyPreview();
            }
            syncExperimentalNestedOptions();
        });
    }

    if (dom.pdfCopyPreviewDurationSlider) {
        dom.pdfCopyPreviewDurationSlider.value = String(state.pdfCopyPreviewDurationSetting);
        const commitPdfCopyPreviewDuration = () => {
            state.pdfCopyPreviewDurationSetting = clampInfiniteSliderSetting(
                dom.pdfCopyPreviewDurationSlider.value,
                DEFAULT_PDF_COPY_PREVIEW_DURATION_SETTING,
            );
            window.localStorage.setItem(PDF_COPY_PREVIEW_DURATION_KEY, String(state.pdfCopyPreviewDurationSetting));
            syncExperimentalNestedOptions();
        };
        dom.pdfCopyPreviewDurationSlider.addEventListener("input", commitPdfCopyPreviewDuration);
        dom.pdfCopyPreviewDurationSlider.addEventListener("change", commitPdfCopyPreviewDuration);
    }

    if (dom.downscalePdfCaptureImagesCheckbox) {
        dom.downscalePdfCaptureImagesCheckbox.checked = state.downscalePdfCaptureImages;
        dom.downscalePdfCaptureImagesCheckbox.addEventListener("change", () => {
            state.downscalePdfCaptureImages = dom.downscalePdfCaptureImagesCheckbox.checked;
            window.localStorage.setItem(PDF_CAPTURE_DOWNSCALE_ENABLED_KEY, state.downscalePdfCaptureImages ? "true" : "false");
        });
    }

    if (dom.enablePdfStarryBackgroundCheckbox) {
        dom.enablePdfStarryBackgroundCheckbox.checked = state.enablePdfStarryBackground;
        dom.enablePdfStarryBackgroundCheckbox.addEventListener("change", () => {
            state.enablePdfStarryBackground = dom.enablePdfStarryBackgroundCheckbox.checked;
            window.localStorage.setItem(PDF_STARRY_BACKGROUND_ENABLED_KEY, state.enablePdfStarryBackground ? "true" : "false");
            syncExperimentalNestedOptions();
            syncPdfExperimentalToolVisibility();
        });
    }

    if (dom.pdfStarryBrightnessSlider) {
        const commitPdfStarryBrightness = () => {
            state.pdfStarryBrightness = clampPdfStarryBrightness(dom.pdfStarryBrightnessSlider.value);
            window.localStorage.setItem(PDF_STARRY_BRIGHTNESS_KEY, String(state.pdfStarryBrightness));
            applyPdfStarryBackgroundSettings();
        };
        dom.pdfStarryBrightnessSlider.addEventListener("input", commitPdfStarryBrightness);
        dom.pdfStarryBrightnessSlider.addEventListener("change", commitPdfStarryBrightness);
    }

    if (dom.pdfStarrySpeedSlider) {
        const commitPdfStarrySpeed = () => {
            state.pdfStarrySpeed = clampPdfStarrySpeed(dom.pdfStarrySpeedSlider.value);
            window.localStorage.setItem(PDF_STARRY_SPEED_KEY, String(state.pdfStarrySpeed));
            applyPdfStarryBackgroundSettings();
        };
        dom.pdfStarrySpeedSlider.addEventListener("input", commitPdfStarrySpeed);
        dom.pdfStarrySpeedSlider.addEventListener("change", commitPdfStarrySpeed);
    }

    if (dom.pdfStarryDensitySlider) {
        const commitPdfStarryDensity = () => {
            state.pdfStarryDensity = clampPdfStarryDensity(dom.pdfStarryDensitySlider.value);
            window.localStorage.setItem(PDF_STARRY_DENSITY_KEY, String(state.pdfStarryDensity));
            applyPdfStarryBackgroundSettings();
        };
        dom.pdfStarryDensitySlider.addEventListener("input", commitPdfStarryDensity);
        dom.pdfStarryDensitySlider.addEventListener("change", commitPdfStarryDensity);
    }

    if (dom.pdfStarryStraightnessSlider) {
        const commitPdfStarryStraightness = () => {
            state.pdfStarryStraightness = clampPdfStarryStraightness(dom.pdfStarryStraightnessSlider.value);
            window.localStorage.setItem(PDF_STARRY_STRAIGHTNESS_KEY, String(state.pdfStarryStraightness));
            applyPdfStarryBackgroundSettings();
        };
        dom.pdfStarryStraightnessSlider.addEventListener("input", commitPdfStarryStraightness);
        dom.pdfStarryStraightnessSlider.addEventListener("change", commitPdfStarryStraightness);
    }

    if (dom.unlockPdfViewerWidthCheckbox) {
        dom.unlockPdfViewerWidthCheckbox.checked = state.unlockPdfViewerWidth;
        dom.unlockPdfViewerWidthCheckbox.addEventListener("change", () => {
            state.unlockPdfViewerWidth = dom.unlockPdfViewerWidthCheckbox.checked;
            window.localStorage.setItem(PDF_VIEWER_WIDTH_UNLOCKED_KEY, state.unlockPdfViewerWidth ? "true" : "false");
            syncPdfExperimentalToolVisibility();
        });
    }

    if (dom.debugModeCheckbox) {
        dom.debugModeCheckbox.checked = state.debugMode;
        dom.debugModeCheckbox.addEventListener("change", () => {
            state.debugMode = dom.debugModeCheckbox.checked;
            window.localStorage.setItem("article-debug-mode", state.debugMode ? "true" : "false");
            syncExperimentalNestedOptions();
            debugLog(`Debug mode ${state.debugMode ? "enabled" : "disabled"}.`);
            if (state.debugMode) setStatus("Debug mode enabled.");
        });
    }

    if (dom.debugLogRetentionSlider) {
        dom.debugLogRetentionSlider.value = String(state.debugLogRetentionSetting);
        const commitDebugLogRetention = () => {
            state.debugLogRetentionSetting = clampInfiniteSliderSetting(
                dom.debugLogRetentionSlider.value,
                DEFAULT_DEBUG_LOG_RETENTION_SETTING,
            );
            window.localStorage.setItem(DEBUG_LOG_RETENTION_KEY, String(state.debugLogRetentionSetting));
            syncExperimentalNestedOptions();
        };
        dom.debugLogRetentionSlider.addEventListener("input", commitDebugLogRetention);
        dom.debugLogRetentionSlider.addEventListener("change", commitDebugLogRetention);
    }

    syncExperimentalNestedOptions();

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

    if (dom.showAbstractPreviewNotesCheckbox) {
        dom.showAbstractPreviewNotesCheckbox.checked = state.showAbstractPreviewNotes;
        dom.showAbstractPreviewNotesCheckbox.addEventListener("change", () => {
            state.showAbstractPreviewNotes = dom.showAbstractPreviewNotesCheckbox.checked;
            window.localStorage.setItem(ABSTRACT_PREVIEW_NOTES_ENABLED_KEY, state.showAbstractPreviewNotes ? "true" : "false");
            if (state.abstractPreviewArticle && dom.abstractModal && !dom.abstractModal.classList.contains("hidden")) {
                openAbstract(state.abstractPreviewArticle);
            }
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
            if (dom.nicheTagAutocomplete) dom.nicheTagAutocomplete.classList.add("hidden");
        };
        dom.nicheTagsInput.addEventListener("input", () => {
            updateNicheTagAutocomplete(dom.nicheTagsInput.value);
        });
        dom.nicheTagsInput.addEventListener("keydown", (evt) => {
            const items = dom.nicheTagAutocomplete?.querySelectorAll(".ac-item") || [];
            if (evt.key === "Tab" || (evt.key === "Enter" && items.length > 0)) {
                evt.preventDefault();
                const activeIdx = Math.max(0, state.nicheAcIndex);
                const active = items[activeIdx];
                if (active) {
                    addNicheTagChip(active.dataset.tag || "");
                    dom.nicheTagsInput.value = "";
                    dom.nicheTagAutocomplete?.classList.add("hidden");
                }
                return;
            }
            if (evt.key === "Enter" || evt.key === ",") {
                evt.preventDefault();
                commitNicheInput();
                return;
            }
            if (evt.key === "ArrowDown") {
                evt.preventDefault();
                if (items.length === 0) return;
                state.nicheAcIndex = Math.min(state.nicheAcIndex + 1, items.length - 1);
                items.forEach((it, i) => it.classList.toggle("active", i === state.nicheAcIndex));
                return;
            }
            if (evt.key === "ArrowUp") {
                evt.preventDefault();
                if (items.length === 0) return;
                state.nicheAcIndex = Math.max(state.nicheAcIndex - 1, 0);
                items.forEach((it, i) => it.classList.toggle("active", i === state.nicheAcIndex));
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
        dom.nicheTagsInput.addEventListener("blur", () => {
            commitNicheInput();
            window.setTimeout(() => dom.nicheTagAutocomplete?.classList.add("hidden"), 150);
        });
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
            updateNicheUiVisibility();
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
            debouncedTagSuggestionRefresh();
            if (state.current && !dom.modal.classList.contains("hidden")) {
                await saveMetadata({ type: "clean-abstract-click" });
            }
        });
    }

    // Tag input: autocomplete + chip creation
    dom.tagInput.addEventListener("input", () => {
        updateTagAutocomplete(dom.tagInput.value);
        debouncedTagSuggestionRefresh();
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
            if (chips.length > 0) {
                chips[chips.length - 1].remove();
                debouncedTagSuggestionRefresh();
                refreshMetadataDirtyState();
            }
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
    [dom.title, dom.authors, dom.journal, dom.doi, dom.abstract, dom.notes].forEach((field) => {
        field.addEventListener("input", debouncedTagSuggestionRefresh);
    });

    // Ctrl+scroll to resize cards
    document.addEventListener("wheel", (evt) => {
        if (!evt.ctrlKey) return;
        if (isPdfViewerOpen()) return;
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
        updateTagTintControlVisibility();
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
            applySurfaceOpacity(dom.surfaceOpacitySlider.value, { displayScale: true });
            window.localStorage.setItem("article-surface-opacity", String(state.surfaceOpacity));
        });
    }
    if (dom.defaultPdfZoomSlider) {
        dom.defaultPdfZoomSlider.addEventListener("input", () => {
            applyDefaultPdfZoom(dom.defaultPdfZoomSlider.value);
            window.localStorage.setItem(DEFAULT_PDF_ZOOM_KEY, String(state.defaultPdfZoom));
        });
    }
    bindNightFilterControlSet({
        enabled: dom.nightFilterEnabled,
        controls: dom.nightFilterControls,
        mode: dom.nightFilterMode,
        strengthSlider: dom.nightFilterStrengthSlider,
        strengthValue: dom.nightFilterStrengthValue,
    });
    bindNightFilterControlSet({
        enabled: dom.pdfNightFilterEnabled,
        controls: dom.pdfNightFilterControls,
        mode: dom.pdfNightFilterMode,
        strengthSlider: dom.pdfNightFilterStrengthSlider,
        strengthValue: dom.pdfNightFilterStrengthValue,
    });
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
        if (dom.themeSelectContainer && !dom.themeSelectContainer.contains(evt.target)) {
            setThemeSelectMenuOpen(false);
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
    if (dom.tagGradientReachSlider) {
        dom.tagGradientReachSlider.addEventListener("input", () => {
            applyTagGradientReach(dom.tagGradientReachSlider.value);
            window.localStorage.setItem("article-tag-gradient-reach", String(state.tagGradientReach));
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
    if (dom.renameTagBtn) {
        dom.renameTagBtn.addEventListener("click", renameTagEverywhere);
    }
    if (dom.removeTagBtn) {
        dom.removeTagBtn.addEventListener("click", removeTagEverywhere);
    }
    dom.modalClose.addEventListener("click", closeEditor);
    if (dom.pdfViewerClose) {
        dom.pdfViewerClose.addEventListener("click", closePdfViewer);
    }
    if (dom.pdfToggleHeaderFold) {
        dom.pdfToggleHeaderFold.addEventListener("click", () => {
            setPdfHeaderFolded(!pdfViewer.headerFolded);
        });
    }
    if (dom.abstractTitle) {
        dom.abstractTitle.addEventListener("click", (evt) => {
            if (state.abstractPreviewArticle) {
                handleArticleOpenClick(evt, state.abstractPreviewArticle);
            }
        });
    }
    if (dom.pdfOpenMetadata) {
        dom.pdfOpenMetadata.addEventListener("click", openPdfViewerMetadata);
    }
    if (dom.pdfOpenAbstract) {
        dom.pdfOpenAbstract.addEventListener("click", openPdfViewerAbstract);
    }
    if (dom.pdfOpenExternal) {
        dom.pdfOpenExternal.addEventListener("click", () => {
            const article = getResolvedPdfViewerArticle();
            if (article) {
                openPdfExternal(article);
            }
        });
    }
    if (dom.pdfCopyBibtex) {
        dom.pdfCopyBibtex.addEventListener("click", async () => {
            const article = getResolvedPdfViewerArticle();
            if (!article) return;
            const bib = generateBibtex(article);
            const ok = await copyToClipboard(bib);
            showToast(ok ? "BibTeX copied to clipboard" : "Failed to copy BibTeX");
        });
    }
    if (dom.pdfCopyRegionToggle) {
        dom.pdfCopyRegionToggle.addEventListener("click", () => {
            togglePdfCopyRegionTool();
        });
    }
    if (dom.pdfTextSelectToggle) {
        dom.pdfTextSelectToggle.addEventListener("click", () => {
            togglePdfTextSelectTool();
        });
    }
    if (dom.pdfCaptureThumbnailToggle) {
        dom.pdfCaptureThumbnailToggle.addEventListener("click", () => {
            togglePdfThumbnailCaptureTool();
        });
    }
    if (dom.pdfCapturePreset) {
        dom.pdfCapturePreset.value = normalizePdfCapturePreset(pdfViewer.capturePreset);
        dom.pdfCapturePreset.addEventListener("change", () => {
            pdfViewer.capturePreset = normalizePdfCapturePreset(dom.pdfCapturePreset.value);
            if (pdfViewer.toolMode !== "capture-thumbnail" || !pdfViewer.capturePageNumber) return;
            const currentRect = pdfViewer.captureRect;
            const center = currentRect
                ? { x: currentRect.left + (currentRect.width / 2), y: currentRect.top + (currentRect.height / 2) }
                : null;
            pdfViewer.captureRect = createDefaultPdfCaptureRect(pdfViewer.capturePageNumber, pdfViewer.capturePreset, center);
            renderPdfToolOverlays();
            requestPdfCapturePreviewRender();
            syncPdfViewerControls();
        });
    }
    if (dom.pdfCaptureSave) {
        dom.pdfCaptureSave.addEventListener("click", () => {
            savePdfCaptureThumbnail().catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to capture thumbnail: ${message}`, true);
            });
        });
    }
    if (dom.pdfCaptureCancel) {
        dom.pdfCaptureCancel.addEventListener("click", () => {
            setPdfToolMode("none");
            syncPdfViewerControls();
        });
    }
    if (dom.pdfPrevPage) {
        dom.pdfPrevPage.addEventListener("click", () => {
            goToPdfPage(pdfViewer.page - 1).catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to change page: ${message}`, true);
            });
        });
    }
    if (dom.pdfNextPage) {
        dom.pdfNextPage.addEventListener("click", () => {
            goToPdfPage(pdfViewer.page + 1).catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to change page: ${message}`, true);
            });
        });
    }
    if (dom.pdfPageNumber) {
        const commitPdfPageNumber = () => {
            if (!pdfViewer.doc) return;
            goToPdfPage(dom.pdfPageNumber.value).catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to change page: ${message}`, true);
                syncPdfViewerControls();
            });
        };
        dom.pdfPageNumber.addEventListener("change", commitPdfPageNumber);
        dom.pdfPageNumber.addEventListener("blur", commitPdfPageNumber);
        dom.pdfPageNumber.addEventListener("keydown", (evt) => {
            if (evt.key !== "Enter") return;
            evt.preventDefault();
            commitPdfPageNumber();
        });
    }
    if (dom.pdfZoomOut) {
        dom.pdfZoomOut.addEventListener("click", () => nudgePdfZoom(-1));
    }
    if (dom.pdfZoomIn) {
        dom.pdfZoomIn.addEventListener("click", () => nudgePdfZoom(1));
    }
    if (dom.pdfFitWidth) {
        dom.pdfFitWidth.addEventListener("click", () => setPdfZoomMode("fit-width"));
    }
    if (dom.pdfFitPage) {
        dom.pdfFitPage.addEventListener("click", () => setPdfZoomMode("fit-page"));
    }
    if (dom.pdfSearchInput) {
        dom.pdfSearchInput.addEventListener("input", debouncedPdfSearch);
        dom.pdfSearchInput.addEventListener("keydown", (evt) => {
            if (evt.key !== "Enter") return;
            evt.preventDefault();
            movePdfSearch(evt.shiftKey ? -1 : 1).catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to move search: ${message}`, true);
            });
        });
    }
    if (dom.pdfSearchPrev) {
        dom.pdfSearchPrev.addEventListener("click", () => {
            movePdfSearch(-1).catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to move search: ${message}`, true);
            });
        });
    }
    if (dom.pdfSearchNext) {
        dom.pdfSearchNext.addEventListener("click", () => {
            movePdfSearch(1).catch((err) => {
                const message = typeof err === "string" ? err : (err instanceof Error ? err.message : "Unknown error");
                setStatus(`Failed to move search: ${message}`, true);
            });
        });
    }
    if (dom.pdfCanvasWrap) {
        dom.pdfCanvasWrap.addEventListener("scroll", debouncedPdfViewerScroll, { passive: true });
        dom.pdfCanvasWrap.addEventListener("pointerdown", handlePdfCanvasPointerDown);
        dom.pdfCanvasWrap.addEventListener("dblclick", handlePdfViewerDoubleClick);
    }
    window.addEventListener("pointermove", handlePdfToolPointerMove, { passive: false });
    window.addEventListener("pointerup", handlePdfToolPointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePdfToolPointerUp, { passive: false });
    document.addEventListener("wheel", handlePdfViewerGlobalWheel, { passive: false, capture: true });
    window.addEventListener("resize", debouncedPdfViewerResize);
    window.addEventListener("resize", updateFilesMenuViewportBounds);
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
            const currentArticle = state.current;
            const removedId = state.current.id;
            await invoke("remove_article", { articleId: state.current.id });
            closeEditor();
            removeTagSuggestionCorpusArticle(removedId);
            const thumbPath = articleThumbPath(currentArticle);
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
        dom.editorOpenBtn.addEventListener("click", (evt) => {
            if (state.current) handleArticleOpenClick(evt, state.current);
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
            recordDoiFetchAttempt();
            const meta = await invoke("fetch_doi_metadata", { doi: doiStr });
            if (meta.title) dom.title.value = meta.title;
            if (meta.authors) dom.authors.value = meta.authors;
            if (meta.year) dom.year.value = meta.year;
            if (meta.journal) dom.journal.value = meta.journal;
            if (meta.volume) dom.volume.value = meta.volume;
            if (meta.number) dom.issue.value = meta.number;
            if (meta.pages) dom.pages.value = meta.pages;
            if (meta.abstract) dom.abstract.value = cleanAbstract(meta.abstract, state.abstractSectionCount);
            if (meta.doi) dom.doi.value = meta.doi;
            debouncedTagSuggestionRefresh();
            // Store ref DOIs on the current article's metadata in memory
            if (state.current) {
                const fetchedRefDois = getReferenceDois(meta);
                state.current.metadata.ref_dois = fetchedRefDois;
                await persistReferenceDois(state.current.id, fetchedRefDois);
            }

            debugLog(`Crossref metadata fetched for DOI ${doiStr}.`);
            refreshMetadataDirtyState();
            const saveResult = await saveMetadata({
                type: "doi-fetch-success",
                markSavedWhenUnchanged: true,
            });
            if (saveResult === "saved") {
                setStatus("Metadata fetched from Crossref and saved.");
            } else if (saveResult === "unchanged") {
                setStatus("Metadata fetched from Crossref.");
            }
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
            invalidateTagSuggestionCorpus();
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
                invalidateTagSuggestionCorpus();
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
            invalidateTagSuggestionCorpus();
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
    [dom.modal, dom.abstractModal, dom.pdfViewerModal, dom.tagColorEditor, dom.themeEditor, dom.hotkeysModal, dom.duplicateModal].forEach((modalEl) => {
        if (!modalEl) return;
        modalEl.addEventListener("mousedown", (evt) => {
            if (evt.target === modalEl) {
                if (modalEl === dom.pdfViewerModal) {
                    closePdfViewer();
                } else {
                    modalEl.classList.add("hidden");
                }
            }
        });
    });

    function handleModalKeyboardNavigation(evt) {
        const pdfViewerOpen = isPdfViewerOpen();
        const metadataOpen = !dom.modal.classList.contains("hidden");
        const abstractOpen = !dom.abstractModal.classList.contains("hidden");
        if (!pdfViewerOpen && !metadataOpen && !abstractOpen) return false;

        // Preserve normal caret/navigation behavior while actively editing metadata fields.
        if (metadataOpen && isMetadataEditableField(evt.target)) return false;
        if (pdfViewerOpen && isPdfViewerEditableField(evt.target)) return false;

        const activeArticle = pdfViewerOpen
            ? getResolvedPdfViewerArticle()
            : (metadataOpen ? state.current : state.abstractPreviewArticle);
        if (!activeArticle?.id) return false;

        const modalView = getCurrentModalRotationView();
        const isPrevModalShortcut = matchesKeyboardShortcut(evt, "prevModal");
        const isNextModalShortcut = matchesKeyboardShortcut(evt, "nextModal");
        const isPrevShortcut = matchesKeyboardShortcut(evt, "prevArticle");
        const isNextShortcut = matchesKeyboardShortcut(evt, "nextArticle");
        const isModalSwitchShortcut = isPrevModalShortcut || isNextModalShortcut;
        if (!isModalSwitchShortcut && !isPrevShortcut && !isNextShortcut) return false;

        const articleDirection = isPrevShortcut ? -1 : 1;
        const modalDirection = isPrevModalShortcut ? -1 : 1;
        const targetArticle = isModalSwitchShortcut ? activeArticle : getNeighborArticleById(activeArticle.id, articleDirection);
        if (!targetArticle?.id || !modalView) return false;

        evt.preventDefault();
        evt.stopPropagation();
        if (state.modalArrowBusy) return true;
        state.modalArrowBusy = true;

        (async () => {
            const resolved = resolveArticleById(targetArticle.id) || targetArticle;
            if (isModalSwitchShortcut) {
                const targetView = getAdjacentModalRotationView(modalView, modalDirection);
                if (!targetView) return;
                if (modalView === "metadata") {
                    await saveMetadata({
                        type: isPrevModalShortcut ? "arrow-prev-modal" : "arrow-next-modal",
                    });
                }
                const latestResolved = resolveArticleById(resolved.id) || resolved;
                closeModalRotationView(modalView);
                await openModalRotationView(targetView, latestResolved);
                return;
            }

            if (modalView === "metadata") {
                await saveMetadata({ type: "arrow-article-nav" });
            }

            const latestResolved = resolveArticleById(resolved.id) || resolved;
            closeModalRotationView(modalView);
            await openModalRotationView(modalView, latestResolved);
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
            // Priority: autocomplete -> color editors -> PDF viewer -> abstract -> duplicate/edit modal -> hotkeys -> backup modal
            if (!dom.tagAutocomplete.classList.contains("hidden")) {
                dom.tagAutocomplete.classList.add("hidden");
                return;
            }
            if (!dom.tagColorEditor.classList.contains("hidden")) {
                dom.tagColorEditor.classList.add("hidden");
                return;
            }
            if (dom.themeEditor && !dom.themeEditor.classList.contains("hidden")) {
                closeThemeEditor();
                return;
            }
            if (dom.pdfViewerModal && !dom.pdfViewerModal.classList.contains("hidden")) {
                if (pdfViewer.toolMode !== "none") {
                    setPdfToolMode("none");
                    syncPdfViewerControls();
                    return;
                }
                if (pdfViewer.headerFolded) {
                    setPdfHeaderFolded(false);
                    return;
                }
                closePdfViewer();
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
            if (dom.pdfViewerModal && !dom.pdfViewerModal.classList.contains("hidden")) return;
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
            if (dom.pdfViewerModal && !dom.pdfViewerModal.classList.contains("hidden") && dom.pdfSearchInput) {
                dom.pdfSearchInput.focus();
                dom.pdfSearchInput.select();
            } else {
                dom.searchInput.focus();
            }
        }

        const pdfViewerOpen = isPdfViewerOpen();
        if (pdfViewerOpen && !isPdfViewerEditableField(evt.target) && !evt.repeat) {
            if (matchesKeyboardShortcut(evt, "pdfCopyTool")) {
                if (togglePdfCopyRegionTool()) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    return;
                }
            }
            if (matchesKeyboardShortcut(evt, "pdfThumbnailTool")) {
                if (togglePdfThumbnailCaptureTool()) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    return;
                }
            }
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
                    nextFocused.dataset.skipAutosave === "true" ||
                    nextFocused.closest("[data-skip-autosave='true']"))) {
                return;
            }
            saveMetadata(evt);
        });
    }

    if (dom.errorBannerClose) {
        dom.errorBannerClose.addEventListener("click", () => {
            hideGlobalErrorBanner();
        });
    }
    if (dom.pdfCopyPreviewClose) {
        dom.pdfCopyPreviewClose.addEventListener("click", () => {
            hidePdfCopyPreview();
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
                showToast("Debug log is empty.");
                return;
            }
            const ok = await copyRawToClipboard(lines.join("\n"));
            showToast(ok ? "Debug log copied to clipboard" : "Failed to copy debug log");
        });
    }
    if (dom.showErrorsCheckbox) {
        dom.showErrorsCheckbox.checked = state.showErrorsGlobally;
        dom.showErrorsCheckbox.addEventListener("change", () => {
            state.showErrorsGlobally = dom.showErrorsCheckbox.checked;
            window.localStorage.setItem("article-show-errors", String(state.showErrorsGlobally));
            if (!state.showErrorsGlobally) {
                hideGlobalErrorBanner();
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
        trimErrorLogListToLimit();
    }

    if (state.showErrorsGlobally) {
        showGlobalErrorBanner(message);
    }
}

window.addEventListener("error", (e) => {
    logGlobalError(e.message, e.filename, e.lineno);
});

window.addEventListener("unhandledrejection", (e) => {
    logGlobalError(e.reason?.message || String(e.reason));
});

function applyLaunchDisabledToggles() {
    state.nightFilterEnabled = false;
    state.audioEnabled = false;
    window.localStorage.setItem(NIGHT_FILTER_ENABLED_KEY, "false");
    window.localStorage.setItem(AUDIO_ENABLED_KEY, "false");
}

function reorderFilesMenuSections() {
    if (!dom.filesMenu || !dom.experimentalSection || !dom.nicheTagsField) return;
    if (dom.nicheTagsField.parentElement !== dom.filesMenu) return;
    dom.nicheTagsField.insertAdjacentElement("afterend", dom.experimentalSection);
}

async function init() {
    applyLaunchDisabledToggles();
    reorderFilesMenuSections();
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
