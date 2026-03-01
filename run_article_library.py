from __future__ import annotations

import argparse
import hashlib
import json
import re
import socket
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from flask import Flask, abort, jsonify, request, send_from_directory
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps, ImageStat

ROOT_DIR = Path(__file__).resolve().parent
ARTICLES_DIR = ROOT_DIR / "Articles"
DATA_DIR = ROOT_DIR / "library_data"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
MANUAL_THUMBNAILS_DIR = DATA_DIR / "manual_thumbnails"
OVERRIDES_DIR = DATA_DIR / "overrides"
INDEX_PATH = DATA_DIR / "index.json"
WEB_DIR = ROOT_DIR / "web"

THUMBNAIL_SIZE = (420, 260)
VALID_THUMBNAIL_STRATEGIES = {"hybrid", "embedded", "first-page"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    MANUAL_THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    OVERRIDES_DIR.mkdir(parents=True, exist_ok=True)


def _unique_ints(items: list[int]) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _port_candidates(preferred: int) -> list[int]:
    nearby = [preferred + offset for offset in range(1, 8) if preferred + offset <= 65535]
    common = [18080, 5000, 8765, 9000, 5500, 8081, 3000]
    return _unique_ints([preferred, *nearby, *common])


def can_bind_socket(host: str, port: int) -> tuple[bool, OSError | None]:
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    try:
        with socket.socket(family, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
        return True, None
    except OSError as exc:
        return False, exc


def format_bind_error(error: OSError | None) -> str:
    if error is None:
        return "unknown socket error"
    code = getattr(error, "winerror", None)
    if code is not None:
        return f"{error} (WinError {code})"
    return str(error)


def pick_listen_port(host: str, preferred_port: int, allow_fallback: bool) -> int:
    ok, first_error = can_bind_socket(host, preferred_port)
    if ok:
        return preferred_port

    if not allow_fallback:
        raise OSError(
            f"Failed to bind to {host}:{preferred_port}: {format_bind_error(first_error)}"
        ) from first_error

    for candidate in _port_candidates(preferred_port):
        ok, _ = can_bind_socket(host, candidate)
        if ok:
            if candidate != preferred_port:
                print(
                    f"Port {preferred_port} unavailable ({format_bind_error(first_error)}). "
                    f"Using {candidate} instead.",
                    flush=True,
                )
            return candidate

    raise OSError(
        f"No available ports found starting at {preferred_port}. "
        f"Initial error: {format_bind_error(first_error)}"
    ) from first_error


def safe_slug(text: str, max_len: int = 58) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if not slug:
        slug = "article"
    return slug[:max_len].strip("-") or "article"


def article_id_for_path(pdf_path: Path) -> str:
    rel = pdf_path.relative_to(ARTICLES_DIR).as_posix().lower()
    digest = hashlib.sha1(rel.encode("utf-8")).hexdigest()[:10]
    return f"{safe_slug(pdf_path.stem)}-{digest}"


def parse_filename_metadata(pdf_path: Path) -> dict[str, Any]:
    # Format: "(2024) Author et al - Title"
    stem = pdf_path.stem.strip()
    match = re.match(
        r"^\((?P<year>\d{4})\)\s*(?P<authors>.+?)\s*-\s*(?P<title>.+?)$",
        stem,
    )
    if not match:
        return {"title": stem, "authors": "", "year": ""}
    return {
        "title": match.group("title").strip(),
        "authors": match.group("authors").strip(),
        "year": match.group("year").strip(),
    }


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def extract_year_from_pdf_date(date_value: str) -> str:
    if not date_value:
        return ""
    # Common format: D:20231227153000Z
    match = re.search(r"(19|20)\d{2}", date_value)
    return match.group(0) if match else ""


def extract_doi_from_text(text: str) -> str:
    # Generic DOI pattern.
    match = re.search(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+\b", text or "")
    return match.group(0) if match else ""


def keywords_to_list(value: str) -> list[str]:
    raw = normalize_text(value)
    if not raw:
        return []
    parts = re.split(r"[;,|]", raw)
    return [p.strip() for p in parts if p.strip()]


def _embedded_image_score(image: Image.Image, width: int, height: int) -> float:
    area = width * height
    if width < 180 or height < 120:
        return -1.0
    if area < 120000:
        return -1.0

    aspect = width / height if height else 0
    if aspect < 0.22 or aspect > 4.8:
        return -1.0

    gray = image.convert("L")
    stats = ImageStat.Stat(gray)
    stddev = stats.stddev[0] if stats.stddev else 0.0
    if stddev < 14.0:
        # Flat image (solid fills, logos, masks).
        return -1.0

    extrema = stats.extrema[0] if stats.extrema else (0, 255)
    dynamic_range = (extrema[1] - extrema[0]) if isinstance(extrema, tuple) else 255
    target_aspect = THUMBNAIL_SIZE[0] / THUMBNAIL_SIZE[1]
    aspect_penalty = abs(aspect - target_aspect) * 26000
    return area + (stddev * 9000) + (dynamic_range * 1800) - aspect_penalty


def first_significant_embedded_image(doc: fitz.Document, max_pages: int = 8) -> Image.Image | None:
    best_image: Image.Image | None = None
    best_score = -1.0

    for page_idx in range(min(max_pages, doc.page_count)):
        page = doc.load_page(page_idx)
        for image_ref in page.get_images(full=True):
            xref = image_ref[0]
            extracted = doc.extract_image(xref)
            if not extracted:
                continue
            width = int(extracted.get("width") or 0)
            height = int(extracted.get("height") or 0)
            if width * height < 60000:
                # Skip tiny icons/logos.
                continue
            image_bytes = extracted.get("image")
            if not image_bytes:
                continue
            try:
                image = Image.open(BytesIO(image_bytes)).convert("RGB")
            except Exception:
                continue
            score = _embedded_image_score(image, width, height)
            if score <= best_score:
                continue
            best_score = score
            best_image = image

    return best_image


def first_page_render(doc: fitz.Document) -> Image.Image | None:
    if doc.page_count < 1:
        return None
    page = doc.load_page(0)
    page_rect = page.rect
    if page_rect.width <= 0 or page_rect.height <= 0:
        return None

    target_w, target_h = THUMBNAIL_SIZE
    scale = max(target_w / page_rect.width, target_h / page_rect.height)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def placeholder_thumbnail(title: str) -> Image.Image:
    canvas = Image.new("RGB", THUMBNAIL_SIZE, color=(23, 34, 47))
    draw = ImageDraw.Draw(canvas)
    short = (title[:72] + "...") if len(title) > 72 else title
    draw.text((18, 18), "NO PREVIEW", fill=(209, 220, 232))
    draw.text((18, 58), short or "Untitled", fill=(171, 194, 214))
    return canvas


def save_thumbnail_image(image: Image.Image, output_path: Path) -> None:
    # Preserve full preview without cropping using subtle blurred extrapolation.
    source = image.convert("RGB")
    contained = ImageOps.contain(source, THUMBNAIL_SIZE, method=Image.Resampling.LANCZOS)
    background = ImageOps.fit(source, THUMBNAIL_SIZE, method=Image.Resampling.BICUBIC)
    background = background.filter(ImageFilter.GaussianBlur(radius=22))
    background = ImageEnhance.Brightness(background).enhance(0.62)
    canvas = background
    x_off = (THUMBNAIL_SIZE[0] - contained.width) // 2
    y_off = (THUMBNAIL_SIZE[1] - contained.height) // 2
    canvas.paste(contained, (x_off, y_off))
    canvas.save(output_path, format="JPEG", quality=88)


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", normalize_text(value)).strip()


def extract_abstract_from_text(text: str) -> str:
    if not text:
        return ""

    lines = [normalize_spaces(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return ""

    start_idx = -1
    for idx, line in enumerate(lines[:100]):
        lowered = line.lower()
        if re.fullmatch(r"abstract[\s\.:;-]*", lowered) or lowered.startswith("abstract:") or lowered.startswith(
            "abstract "
        ):
            start_idx = idx
            break

    if start_idx < 0:
        return ""

    stop_patterns = (
        r"^(keywords?|index terms?)\b",
        r"^(introduction|background)\b",
        r"^\d+[\.\)]\s*(introduction|background)\b",
        r"^(materials and methods|experimental section|methods)\b",
    )
    abstract_lines: list[str] = []
    for line in lines[start_idx + 1 :]:
        lowered = line.lower()
        if any(re.match(pattern, lowered) for pattern in stop_patterns):
            break
        abstract_lines.append(line)
        if len(" ".join(abstract_lines)) > 2200:
            break

    abstract = normalize_spaces(" ".join(abstract_lines))
    if len(abstract) > 2000:
        return abstract[:1997] + "..."
    return abstract


def generate_auto_thumbnail(
    pdf_path: Path,
    article_id: str,
    title: str,
    strategy: str,
) -> dict[str, str]:
    output_path = THUMBNAILS_DIR / f"{article_id}.jpg"
    source = "placeholder"

    with fitz.open(pdf_path) as doc:
        selected_image: Image.Image | None = None
        if strategy in {"hybrid", "embedded"}:
            selected_image = first_significant_embedded_image(doc)
            if selected_image is not None:
                source = "embedded"
        if selected_image is None and strategy in {"hybrid", "first-page"}:
            selected_image = first_page_render(doc)
            if selected_image is not None:
                source = "first-page"
        if selected_image is None:
            selected_image = placeholder_thumbnail(title)

    save_thumbnail_image(selected_image, output_path)
    return {
        "path": output_path.relative_to(ROOT_DIR).as_posix(),
        "source": source,
        "mode": "auto",
    }


def load_override(article_id: str) -> dict[str, Any]:
    override_path = OVERRIDES_DIR / f"{article_id}.json"
    if not override_path.exists():
        return {}
    try:
        return json.loads(override_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_override(article_id: str, payload: dict[str, Any]) -> None:
    override_path = OVERRIDES_DIR / f"{article_id}.json"
    override_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def merge_metadata(auto: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = {
        "title": normalize_text(auto.get("title")),
        "authors": normalize_text(auto.get("authors")),
        "year": normalize_text(auto.get("year")),
        "journal": normalize_text(auto.get("journal")),
        "doi": normalize_text(auto.get("doi")),
        "abstract": normalize_text(auto.get("abstract")),
        "keywords": list(auto.get("keywords") or []),
        "tags": [],
        "notes": "",
    }

    for key in ["title", "authors", "year", "journal", "doi", "abstract"]:
        if key in override:
            merged[key] = normalize_text(override.get(key))

    if "tags" in override:
        merged["tags"] = [normalize_text(t) for t in (override.get("tags") or []) if normalize_text(t)]
    if "notes" in override:
        merged["notes"] = normalize_text(override.get("notes"))

    return merged


def resolve_thumbnail(
    auto_thumbnail: dict[str, str],
    override: dict[str, Any],
) -> dict[str, str]:
    manual_mode = normalize_text(override.get("thumbnail_mode")) == "manual"
    manual_rel = normalize_text(override.get("manual_thumbnail"))
    if manual_mode and manual_rel:
        manual_path = ROOT_DIR / manual_rel
        if manual_path.exists():
            return {
                "path": manual_rel,
                "source": "manual",
                "mode": "manual",
            }

    return auto_thumbnail


def build_search_text(article: dict[str, Any]) -> str:
    md = article.get("metadata") or {}
    parts = [
        article.get("pdf_filename", ""),
        md.get("title", ""),
        md.get("authors", ""),
        md.get("year", ""),
        md.get("journal", ""),
        md.get("doi", ""),
        md.get("abstract", ""),
        " ".join(md.get("keywords") or []),
        " ".join(md.get("tags") or []),
        md.get("notes", ""),
    ]
    return " ".join(normalize_text(p).lower() for p in parts if normalize_text(p))


def extract_auto_metadata(pdf_path: Path) -> dict[str, Any]:
    from_filename = parse_filename_metadata(pdf_path)
    with fitz.open(pdf_path) as doc:
        pdf_meta = doc.metadata or {}
        first_page_text = ""
        abstract_scan_text = ""
        if doc.page_count > 0:
            try:
                first_page_text = doc.load_page(0).get_text("text")
            except Exception:
                first_page_text = ""
        for page_idx in range(min(3, doc.page_count)):
            try:
                abstract_scan_text += "\n" + doc.load_page(page_idx).get_text("text")
            except Exception:
                continue

        title = normalize_text(from_filename.get("title")) or normalize_text(pdf_meta.get("title")) or pdf_path.stem
        authors = normalize_text(from_filename.get("authors")) or normalize_text(pdf_meta.get("author"))
        year = (
            normalize_text(from_filename.get("year"))
            or extract_year_from_pdf_date(normalize_text(pdf_meta.get("creationDate")))
            or extract_year_from_pdf_date(normalize_text(pdf_meta.get("modDate")))
        )
        journal = normalize_text(pdf_meta.get("subject"))
        doi = extract_doi_from_text(first_page_text) or extract_doi_from_text(normalize_text(pdf_meta.get("subject")))
        abstract = extract_abstract_from_text(abstract_scan_text)
        keywords = keywords_to_list(pdf_meta.get("keywords", ""))

        return {
            "title": title,
            "authors": authors,
            "year": year,
            "journal": journal,
            "doi": doi,
            "abstract": abstract,
            "keywords": keywords,
            "page_count": doc.page_count,
        }


def index_articles(thumbnail_strategy: str) -> dict[str, Any]:
    ensure_dirs()
    pdfs = sorted(ARTICLES_DIR.rglob("*.pdf"))
    articles: list[dict[str, Any]] = []

    for pdf_path in pdfs:
        article_id = article_id_for_path(pdf_path)
        stat = pdf_path.stat()

        auto = extract_auto_metadata(pdf_path)
        auto_thumb = generate_auto_thumbnail(
            pdf_path=pdf_path,
            article_id=article_id,
            title=auto.get("title", pdf_path.stem),
            strategy=thumbnail_strategy,
        )
        override = load_override(article_id)
        metadata = merge_metadata(auto, override)
        thumb = resolve_thumbnail(auto_thumb, override)

        article = {
            "id": article_id,
            "pdf_filename": pdf_path.name,
            "pdf_relpath": pdf_path.relative_to(ROOT_DIR).as_posix(),
            "file_size": stat.st_size,
            "file_modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            "auto": auto,
            "auto_thumbnail": auto_thumb,
            "metadata": metadata,
            "thumbnail": thumb,
        }
        article["search_text"] = build_search_text(article)
        articles.append(article)

    articles.sort(
        key=lambda a: (
            normalize_text(a.get("metadata", {}).get("year") or "0"),
            normalize_text(a.get("metadata", {}).get("title")),
        ),
        reverse=True,
    )

    index_payload = {
        "generated_at": utc_now_iso(),
        "thumbnail_strategy": thumbnail_strategy,
        "article_count": len(articles),
        "articles": articles,
    }
    INDEX_PATH.write_text(json.dumps(index_payload, indent=2), encoding="utf-8")
    return index_payload


def load_index() -> dict[str, Any]:
    if not INDEX_PATH.exists():
        return index_articles(thumbnail_strategy="hybrid")
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def find_article(index_data: dict[str, Any], article_id: str) -> dict[str, Any] | None:
    for article in index_data.get("articles", []):
        if article.get("id") == article_id:
            return article
    return None


def update_index_article(article_id: str, override: dict[str, Any]) -> dict[str, Any]:
    index_data = load_index()
    article = find_article(index_data, article_id)
    if article is None:
        raise KeyError(article_id)

    auto = article.get("auto") or {}
    auto_thumbnail = article.get("auto_thumbnail") or {}
    if not auto_thumbnail:
        guessed_path = THUMBNAILS_DIR / f"{article_id}.jpg"
        auto_thumbnail = {
            "path": guessed_path.relative_to(ROOT_DIR).as_posix(),
            "source": "auto",
            "mode": "auto",
        }
    article["metadata"] = merge_metadata(auto, override)
    article["thumbnail"] = resolve_thumbnail(auto_thumbnail, override)
    article["search_text"] = build_search_text(article)

    INDEX_PATH.write_text(json.dumps(index_data, indent=2), encoding="utf-8")
    return article


def normalize_tags(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        pieces = [p.strip() for p in raw.split(",")]
        return [p for p in pieces if p]
    if isinstance(raw, list):
        tags = [normalize_text(item) for item in raw]
        return [t for t in tags if t]
    return []


def parse_metadata_payload() -> dict[str, Any]:
    if request.form:
        form = request.form
        payload: dict[str, Any] = {}
        for key in ["title", "authors", "year", "journal", "doi", "abstract", "notes", "thumbnail_mode"]:
            if key in form:
                payload[key] = form.get(key)

        if "tags" in form:
            tags_values = [normalize_text(v) for v in form.getlist("tags")]
            tags_values = [v for v in tags_values if v]
            payload["tags"] = tags_values

        return payload

    json_payload = request.get_json(silent=True)
    if isinstance(json_payload, dict):
        return json_payload

    raw_body = request.get_data(cache=False, as_text=True)
    if not normalize_text(raw_body):
        return {}

    try:
        parsed = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        abort(400, f"Invalid metadata payload: {exc.msg}")

    if not isinstance(parsed, dict):
        abort(400, "Invalid metadata payload: expected a JSON object.")
    return parsed


def valid_thumbnail_mode(value: Any) -> str:
    normalized = normalize_text(value).lower()
    return normalized if normalized in {"auto", "manual"} else "auto"


def save_uploaded_thumbnail(article_id: str, image_bytes: bytes) -> str:
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    output_path = MANUAL_THUMBNAILS_DIR / f"{article_id}.jpg"
    save_thumbnail_image(image, output_path)
    return output_path.relative_to(ROOT_DIR).as_posix()


def build_app(default_strategy: str) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["DEFAULT_THUMBNAIL_STRATEGY"] = default_strategy

    @app.after_request
    def disable_cache(response: Any) -> Any:
        # Prevent stale frontend/API assets from masking recent edits.
        path = request.path or ""
        if path.startswith("/api/") or path in {"/", "/styles.css", "/app.js"}:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    @app.get("/")
    def serve_index() -> Any:
        return send_from_directory(WEB_DIR, "index.html")

    @app.get("/styles.css")
    def serve_styles() -> Any:
        return send_from_directory(WEB_DIR, "styles.css")

    @app.get("/app.js")
    def serve_script() -> Any:
        return send_from_directory(WEB_DIR, "app.js")

    @app.get("/Articles/<path:filename>")
    def serve_article_pdf(filename: str) -> Any:
        return send_from_directory(ARTICLES_DIR, filename)

    @app.get("/library_data/<path:filename>")
    def serve_library_data(filename: str) -> Any:
        return send_from_directory(DATA_DIR, filename)

    @app.get("/api/articles")
    def api_articles() -> Any:
        query = normalize_text(request.args.get("query")).lower()
        tag = normalize_text(request.args.get("tag")).lower()
        match_mode = normalize_text(request.args.get("match_mode", "include")).lower()
        filter_incomplete = request.args.get("filter_incomplete", "false").lower() == "true"
        try:
            limit = max(1, min(500, int(request.args.get("limit", 200))))
            offset = max(0, int(request.args.get("offset", 0)))
        except ValueError:
            abort(400, "Invalid pagination values.")

        index_data = load_index()
        rows = index_data.get("articles", [])

        if query:
            terms = [piece for piece in query.split() if piece]
            rows = [
                article
                for article in rows
                if all(term in normalize_text(article.get("search_text")).lower() for term in terms)
            ]

        if tag:
            if match_mode == "exclude":
                rows = [
                    article
                    for article in rows
                    if tag not in [normalize_text(t).lower() for t in article.get("metadata", {}).get("tags", [])]
                ]
            else:
                rows = [
                    article
                    for article in rows
                    if tag in [normalize_text(t).lower() for t in article.get("metadata", {}).get("tags", [])]
                ]

        if filter_incomplete:
            def is_incomplete(art: dict[str, Any]) -> bool:
                md = art.get("metadata", {})
                has_abstract = bool(md.get("abstract", "").strip())
                has_tags = bool(md.get("tags", []))
                return not (has_abstract and has_tags)
            
            rows = [a for a in rows if is_incomplete(a)]

        total = len(rows)
        rows = rows[offset : offset + limit]
        return jsonify(
            {
                "total": total,
                "offset": offset,
                "limit": limit,
                "generated_at": index_data.get("generated_at"),
                "thumbnail_strategy": index_data.get("thumbnail_strategy"),
                "articles": rows,
            }
        )

    @app.get("/api/tags")
    def api_tags() -> Any:
        index_data = load_index()
        counts: dict[str, int] = {}
        for article in index_data.get("articles", []):
            for tag in article.get("metadata", {}).get("tags", []):
                clean = normalize_text(tag)
                if not clean:
                    continue
                counts[clean] = counts.get(clean, 0) + 1
        items = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))
        return jsonify({"tags": [{"name": name, "count": count} for name, count in items]})

    @app.post("/api/reindex")
    def api_reindex() -> Any:
        payload = request.get_json(silent=True) or {}
        strategy = normalize_text(payload.get("strategy")) or app.config["DEFAULT_THUMBNAIL_STRATEGY"]
        if strategy not in VALID_THUMBNAIL_STRATEGIES:
            abort(400, "Invalid thumbnail strategy.")
        index_data = index_articles(thumbnail_strategy=strategy)
        return jsonify(
            {
                "ok": True,
                "article_count": index_data.get("article_count"),
                "generated_at": index_data.get("generated_at"),
                "thumbnail_strategy": strategy,
            }
        )

    @app.post("/api/articles/<article_id>/metadata")
    def api_update_metadata(article_id: str) -> Any:
        payload = parse_metadata_payload()
        if find_article(load_index(), article_id) is None:
            abort(404, "Article not found.")

        existing = load_override(article_id)
        updated = dict(existing)

        for key in ["title", "authors", "year", "journal", "doi", "abstract", "notes"]:
            if key in payload:
                updated[key] = normalize_text(payload.get(key))

        if "tags" in payload:
            updated["tags"] = normalize_tags(payload.get("tags"))

        if "thumbnail_mode" in payload:
            updated["thumbnail_mode"] = valid_thumbnail_mode(payload.get("thumbnail_mode"))

        save_override(article_id, updated)
        updated_article = update_index_article(article_id, updated)

        return jsonify({"ok": True, "article": updated_article})

    @app.post("/api/articles/<article_id>/thumbnail")
    def api_upload_thumbnail(article_id: str) -> Any:
        if find_article(load_index(), article_id) is None:
            abort(404, "Article not found.")

        upload = request.files.get("thumbnail")
        if upload is None:
            abort(400, "Missing file field: thumbnail")

        data = upload.read()
        if not data:
            abort(400, "Empty thumbnail upload.")

        try:
            manual_rel = save_uploaded_thumbnail(article_id, data)
        except Exception:
            abort(400, "Could not parse uploaded image.")

        override = load_override(article_id)
        override["thumbnail_mode"] = "manual"
        override["manual_thumbnail"] = manual_rel
        save_override(article_id, override)

        updated_article = update_index_article(article_id, override)

        return jsonify({"ok": True, "article": updated_article})

    @app.get("/api/articles/<article_id>/text-front")
    def api_get_article_text_front(article_id: str) -> Any:
        index_data = load_index()
        article = find_article(index_data, article_id)
        if article is None:
            abort(404, "Article not found.")
        
        pdf_path = ARTICLES_DIR / article["pdf_filename"]
        if not pdf_path.exists():
            abort(404, "PDF missing.")
            
        try:
            doc = fitz.open(pdf_path)
            text = ""
            for i in range(min(3, doc.page_count)):
                page = doc.load_page(i)
                text += page.get_text() + "\n"
            return jsonify({"ok": True, "text": text})
        except Exception as e:
            abort(500, f"Error reading PDF: {e}")

    @app.get("/api/articles/<article_id>/text-back")
    def api_get_article_text_back(article_id: str) -> Any:
        index_data = load_index()
        article = find_article(index_data, article_id)
        if article is None:
            abort(404, "Article not found.")
        
        pdf_path = ARTICLES_DIR / article["pdf_filename"]
        if not pdf_path.exists():
            abort(404, "PDF missing.")
            
        try:
            doc = fitz.open(pdf_path)
            text = ""
            start_page = max(0, doc.page_count - 4)
            for i in range(start_page, doc.page_count):
                page = doc.load_page(i)
                text += page.get_text() + "\n"
            return jsonify({"ok": True, "text": text})
        except Exception as e:
            abort(500, f"Error reading PDF: {e}")

    @app.delete("/api/articles/<article_id>")
    def api_delete_article(article_id: str) -> Any:
        index_data = load_index()
        article = find_article(index_data, article_id)
        if article is None:
            abort(404, "Article not found.")
        
        # Remove primary PDF
        pdf_relpath = article.get("pdf_relpath")
        if pdf_relpath:
            pdf_path = ROOT_DIR / pdf_relpath
            if pdf_path.exists():
                try:
                    pdf_path.unlink()
                except OSError:
                    pass

        # Remove manual thumbnail
        manual_thumb = MANUAL_THUMBNAILS_DIR / f"{article_id}.jpg"
        if manual_thumb.exists():
            try:
                manual_thumb.unlink()
            except OSError:
                pass
                
        # Remove auto thumbnail
        auto_thumb = THUMBNAILS_DIR / f"{article_id}.jpg"
        if auto_thumb.exists():
            try:
                auto_thumb.unlink()
            except OSError:
                pass
                
        # Remove override meta
        override_file = OVERRIDES_DIR / f"{article_id}.json"
        if override_file.exists():
            try:
                override_file.unlink()
            except OSError:
                pass
                
        # Remove from index
        index_data["articles"] = [a for a in index_data.get("articles", []) if a.get("id") != article_id]
        index_data["article_count"] = len(index_data["articles"])
        INDEX_PATH.write_text(json.dumps(index_data, indent=2), encoding="utf-8")
        
        return jsonify({"ok": True})

    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local scientific article thumbnail library")
    parser.add_argument("--host", default="127.0.0.1", help="Host for local web server.")
    parser.add_argument("--port", type=int, default=8080, help="Port for local web server.")
    parser.add_argument(
        "--no-port-fallback",
        action="store_true",
        help="Do not auto-select an alternate port if the requested port cannot be bound.",
    )
    parser.add_argument(
        "--thumbnail-strategy",
        default="hybrid",
        choices=sorted(VALID_THUMBNAIL_STRATEGIES),
        help="How automatic thumbnails are extracted.",
    )
    parser.add_argument(
        "--reindex-only",
        action="store_true",
        help="Only rebuild index and thumbnails, then exit.",
    )
    parser.add_argument(
        "--skip-reindex",
        action="store_true",
        help="Start server without rebuilding index first.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_dirs()

    if not ARTICLES_DIR.exists():
        raise FileNotFoundError(f"Missing folder: {ARTICLES_DIR}")

    if not args.skip_reindex or not INDEX_PATH.exists():
        index_articles(thumbnail_strategy=args.thumbnail_strategy)

    if args.reindex_only:
        print("Index rebuilt.", flush=True)
        return

    listen_port = pick_listen_port(
        host=args.host,
        preferred_port=args.port,
        allow_fallback=not args.no_port_fallback,
    )
    print(f"Serving article library at http://{args.host}:{listen_port}", flush=True)

    app = build_app(default_strategy=args.thumbnail_strategy)
    app.run(host=args.host, port=listen_port, debug=False)


if __name__ == "__main__":
    main()
