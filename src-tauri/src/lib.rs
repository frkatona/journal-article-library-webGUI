use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb, RgbImage};
use lopdf::{Document as PdfDoc, Object};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha1_smol::Sha1;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use walkdir::WalkDir;

// ── Constants ───────────────────────────────────────────────────────────────
const THUMBNAIL_W: u32 = 420;
const THUMBNAIL_H: u32 = 260;

// ── Types ───────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailInfo {
    pub path: String,
    pub source: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoMeta {
    pub title: String,
    pub authors: String,
    pub year: String,
    pub journal: String,
    pub doi: String,
    #[serde(rename = "abstract")]
    pub abstract_text: String,
    pub keywords: Vec<String>,
    pub page_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub title: String,
    pub authors: String,
    pub year: String,
    pub journal: String,
    pub doi: String,
    #[serde(rename = "abstract")]
    pub abstract_text: String,
    pub keywords: Vec<String>,
    pub tags: Vec<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Article {
    pub id: String,
    pub pdf_filename: String,
    pub pdf_relpath: String,
    pub file_size: u64,
    pub file_modified: String,
    #[serde(rename = "auto")]
    pub auto_meta: AutoMeta,
    pub auto_thumbnail: ThumbnailInfo,
    pub metadata: Metadata,
    pub thumbnail: ThumbnailInfo,
    pub search_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexPayload {
    pub generated_at: String,
    pub thumbnail_strategy: String,
    pub article_count: usize,
    pub articles: Vec<Article>,
}

#[derive(Debug, Serialize)]
pub struct ArticlesResponse {
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub generated_at: String,
    pub thumbnail_strategy: String,
    pub articles: Vec<Article>,
}

#[derive(Debug, Serialize)]
pub struct TagItem {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct TagsResponse {
    pub tags: Vec<TagItem>,
}

#[derive(Debug, Serialize)]
pub struct ReindexResponse {
    pub ok: bool,
    pub article_count: usize,
    pub generated_at: String,
    pub thumbnail_strategy: String,
}

#[derive(Debug, Serialize)]
pub struct MutationResponse {
    pub ok: bool,
    pub article: Article,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetadataPayload {
    pub title: Option<String>,
    pub authors: Option<String>,
    pub year: Option<String>,
    pub journal: Option<String>,
    pub doi: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub thumbnail_mode: Option<String>,
}

// ── App State ───────────────────────────────────────────────────────────────
pub struct AppState {
    root_dir: PathBuf,
    articles_dir: PathBuf,
    data_dir: PathBuf,
    thumbnails_dir: PathBuf,
    manual_thumbnails_dir: PathBuf,
    overrides_dir: PathBuf,
    index_path: PathBuf,
    index: Option<IndexPayload>,
    default_strategy: String,
}

impl AppState {
    fn new(root_dir: PathBuf) -> Self {
        let articles_dir = root_dir.join("Articles");
        let data_dir = root_dir.join("library_data");
        let thumbnails_dir = data_dir.join("thumbnails");
        let manual_thumbnails_dir = data_dir.join("manual_thumbnails");
        let overrides_dir = data_dir.join("overrides");
        let index_path = data_dir.join("index.json");
        Self {
            root_dir,
            articles_dir,
            data_dir,
            thumbnails_dir,
            manual_thumbnails_dir,
            overrides_dir,
            index_path,
            index: None,
            default_strategy: "hybrid".into(),
        }
    }

    fn ensure_dirs(&self) {
        let _ = fs::create_dir_all(&self.data_dir);
        let _ = fs::create_dir_all(&self.thumbnails_dir);
        let _ = fs::create_dir_all(&self.manual_thumbnails_dir);
        let _ = fs::create_dir_all(&self.overrides_dir);
    }
}

// ── Utility Functions ───────────────────────────────────────────────────────

fn normalize_text(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_spaces(value: &str) -> String {
    let re = Regex::new(r"\s+").unwrap();
    re.replace_all(value.trim(), " ").to_string()
}

fn safe_slug(text: &str, max_len: usize) -> String {
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    let slug = re.replace_all(&text.to_lowercase(), "-").to_string();
    let slug = slug.trim_matches('-').to_string();
    let slug = if slug.is_empty() {
        "article".to_string()
    } else {
        slug
    };
    let truncated = if slug.len() > max_len {
        slug[..max_len].trim_end_matches('-').to_string()
    } else {
        slug
    };
    if truncated.is_empty() {
        "article".to_string()
    } else {
        truncated
    }
}

fn article_id_for_path(pdf_path: &Path, articles_dir: &Path) -> String {
    let rel = pdf_path
        .strip_prefix(articles_dir)
        .unwrap_or(pdf_path)
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();
    let mut hasher = Sha1::new();
    hasher.update(rel.as_bytes());
    let digest = &hasher.digest().to_string()[..10];
    let stem = pdf_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    format!("{}-{}", safe_slug(&stem, 58), digest)
}

fn parse_filename_metadata(pdf_path: &Path) -> (String, String, String) {
    let stem = pdf_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .trim()
        .to_string();
    let re = Regex::new(r"^\((?P<year>\d{4})\)\s*(?P<authors>.+?)\s*-\s*(?P<title>.+?)$").unwrap();
    match re.captures(&stem) {
        Some(caps) => (
            caps["title"].trim().to_string(),
            caps["authors"].trim().to_string(),
            caps["year"].trim().to_string(),
        ),
        None => (stem, String::new(), String::new()),
    }
}

fn extract_year_from_pdf_date(date_value: &str) -> String {
    if date_value.is_empty() {
        return String::new();
    }
    let re = Regex::new(r"(19|20)\d{2}").unwrap();
    match re.find(date_value) {
        Some(m) => m.as_str().to_string(),
        None => String::new(),
    }
}

fn extract_doi_from_text(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let re = Regex::new(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+\b").unwrap();
    match re.find(text) {
        Some(m) => m.as_str().to_string(),
        None => String::new(),
    }
}

fn keywords_to_list(value: &str) -> Vec<String> {
    let raw = normalize_text(value);
    if raw.is_empty() {
        return vec![];
    }
    let re = Regex::new(r"[;,|]").unwrap();
    re.split(&raw)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn extract_abstract_from_text(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let lines: Vec<String> = text
        .lines()
        .map(|l| normalize_spaces(l))
        .filter(|l| !l.is_empty())
        .collect();
    if lines.is_empty() {
        return String::new();
    }

    let abstract_re =
        Regex::new(r"(?i)^abstract[\s\.:;-]*$|^abstract:|^abstract\s").unwrap();
    let mut start_idx: Option<usize> = None;
    for (idx, line) in lines.iter().take(100).enumerate() {
        if abstract_re.is_match(line) {
            start_idx = Some(idx);
            break;
        }
    }
    let start_idx = match start_idx {
        Some(i) => i,
        None => return String::new(),
    };

    let stop_re = Regex::new(
        r"(?i)^(keywords?|index terms?)\b|^(introduction|background)\b|^\d+[\.\)]\s*(introduction|background)\b|^(materials and methods|experimental section|methods)\b"
    ).unwrap();

    let mut abstract_lines: Vec<String> = Vec::new();
    for line in lines.iter().skip(start_idx + 1) {
        if stop_re.is_match(line) {
            break;
        }
        abstract_lines.push(line.clone());
        let joined: String = abstract_lines.join(" ");
        if joined.len() > 2200 {
            break;
        }
    }

    let abstract_text = normalize_spaces(&abstract_lines.join(" "));
    if abstract_text.len() > 2000 {
        format!("{}...", &abstract_text[..1997])
    } else {
        abstract_text
    }
}

// ── PDF Helpers (lopdf) ─────────────────────────────────────────────────────

/// Resolve an Object reference if it's indirect, otherwise return it directly.
fn resolve_obj<'a>(doc: &'a PdfDoc, obj: &'a Object) -> Option<&'a Object> {
    match obj {
        Object::Reference(id) => doc.get_object(*id).ok(),
        other => Some(other),
    }
}

/// Extract a string value from a PDF dictionary key.
fn pdf_dict_string(doc: &PdfDoc, dict: &lopdf::Dictionary, key: &[u8]) -> String {
    dict.get(key)
        .ok()
        .and_then(|obj| resolve_obj(doc, obj))
        .and_then(|obj| match obj {
            Object::String(bytes, _) => {
                // Try UTF-16 BE first (BOM: 0xFE 0xFF)
                if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                    let chars: Vec<u16> = bytes[2..]
                        .chunks(2)
                        .filter_map(|chunk| {
                            if chunk.len() == 2 {
                                Some(u16::from_be_bytes([chunk[0], chunk[1]]))
                            } else {
                                None
                            }
                        })
                        .collect();
                    String::from_utf16_lossy(&chars)
                } else {
                    // Try UTF-8, fall back to latin-1
                    String::from_utf8(bytes.clone())
                        .unwrap_or_else(|_| bytes.iter().map(|&b| b as char).collect())
                }
            }
            _ => None,
        })
        .unwrap_or_default()
}

fn pdf_dict_name(dict: &lopdf::Dictionary, key: &[u8]) -> String {
    dict.get(key)
        .ok()
        .and_then(|obj| match obj {
            Object::Name(name) => Some(String::from_utf8_lossy(name).to_string()),
            _ => None,
        })
        .unwrap_or_default()
}

fn pdf_dict_int(doc: &PdfDoc, dict: &lopdf::Dictionary, key: &[u8]) -> i64 {
    dict.get(key)
        .ok()
        .and_then(|obj| resolve_obj(doc, obj))
        .and_then(|obj| match obj {
            Object::Integer(n) => Some(*n),
            _ => None,
        })
        .unwrap_or(0)
}

// ── PDF Metadata Extraction ─────────────────────────────────────────────────

fn extract_pdf_text(pdf_path: &Path) -> String {
    pdf_extract::extract_text(pdf_path).unwrap_or_default()
}

fn extract_auto_metadata(pdf_path: &Path) -> AutoMeta {
    let (fn_title, fn_authors, fn_year) = parse_filename_metadata(pdf_path);

    let fallback = AutoMeta {
        title: if fn_title.is_empty() {
            pdf_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        } else {
            fn_title.clone()
        },
        authors: fn_authors.clone(),
        year: fn_year.clone(),
        journal: String::new(),
        doi: String::new(),
        abstract_text: String::new(),
        keywords: vec![],
        page_count: 0,
    };

    let doc = match PdfDoc::load(pdf_path) {
        Ok(d) => d,
        Err(_) => return fallback,
    };

    let page_count = doc.get_pages().len() as i32;

    // Extract metadata from the Info dictionary
    let (pdf_title, pdf_author, pdf_subject, pdf_keywords, pdf_creation, pdf_mod) =
        if let Ok(info_dict) = doc.trailer.get(b"Info")
            .and_then(|obj| {
                match obj {
                    Object::Reference(id) => doc.get_object(*id)
                        .and_then(|o| o.as_dict().map(|d| d.clone())),
                    Object::Dictionary(d) => Ok(d.clone()),
                    _ => Err(lopdf::Error::ObjectNotFound),
                }
            })
        {
            (
                pdf_dict_string(&doc, &info_dict, b"Title"),
                pdf_dict_string(&doc, &info_dict, b"Author"),
                pdf_dict_string(&doc, &info_dict, b"Subject"),
                pdf_dict_string(&doc, &info_dict, b"Keywords"),
                pdf_dict_string(&doc, &info_dict, b"CreationDate"),
                pdf_dict_string(&doc, &info_dict, b"ModDate"),
            )
        } else {
            (String::new(), String::new(), String::new(), String::new(), String::new(), String::new())
        };

    // Extract text for DOI and abstract
    let full_text = extract_pdf_text(pdf_path);

    let title = if !fn_title.is_empty() {
        fn_title
    } else if !normalize_text(&pdf_title).is_empty() {
        normalize_text(&pdf_title)
    } else {
        pdf_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    };

    let authors = if !fn_authors.is_empty() {
        fn_authors
    } else {
        normalize_text(&pdf_author)
    };

    let year = if !fn_year.is_empty() {
        fn_year
    } else {
        let y = extract_year_from_pdf_date(&normalize_text(&pdf_creation));
        if !y.is_empty() {
            y
        } else {
            extract_year_from_pdf_date(&normalize_text(&pdf_mod))
        }
    };

    let journal = normalize_text(&pdf_subject);
    let doi = {
        // Only search first ~3000 chars for DOI
        let search_text = if full_text.len() > 3000 {
            &full_text[..3000]
        } else {
            &full_text
        };
        let d = extract_doi_from_text(search_text);
        if !d.is_empty() {
            d
        } else {
            extract_doi_from_text(&normalize_text(&pdf_subject))
        }
    };
    let abstract_text = extract_abstract_from_text(&full_text);
    let keywords = keywords_to_list(&pdf_keywords);

    AutoMeta {
        title,
        authors,
        year,
        journal,
        doi,
        abstract_text,
        keywords,
        page_count,
    }
}

// ── Thumbnail Generation ────────────────────────────────────────────────────

fn embedded_image_score(img: &DynamicImage) -> f64 {
    let (w, h) = img.dimensions();
    if w < 180 || h < 120 {
        return -1.0;
    }
    let area = (w * h) as f64;
    if area < 120_000.0 {
        return -1.0;
    }
    let aspect = w as f64 / h as f64;
    if aspect < 0.22 || aspect > 4.8 {
        return -1.0;
    }

    let gray = img.to_luma8();
    let (sum, sum_sq, _min_v, max_v, count) = gray.pixels().fold(
        (0.0_f64, 0.0_f64, 255u8, 0u8, 0u64),
        |(sum, sum_sq, min_v, max_v, count), p| {
            let v = p.0[0];
            (
                sum + v as f64,
                sum_sq + (v as f64 * v as f64),
                min_v.min(v),
                max_v.max(v),
                count + 1,
            )
        },
    );
    if count == 0 {
        return -1.0;
    }
    let mean = sum / count as f64;
    let variance = (sum_sq / count as f64) - (mean * mean);
    let stddev = variance.max(0.0).sqrt();

    if stddev < 14.0 {
        return -1.0;
    }

    let min_v = gray.pixels().fold(255u8, |acc, p| acc.min(p.0[0]));
    let dynamic_range = (max_v - min_v) as f64;
    let target_aspect = THUMBNAIL_W as f64 / THUMBNAIL_H as f64;
    let aspect_penalty = (aspect - target_aspect).abs() * 26000.0;
    area + (stddev * 9000.0) + (dynamic_range * 1800.0) - aspect_penalty
}

fn first_significant_embedded_image(pdf_path: &Path, max_pages: i32) -> Option<DynamicImage> {
    let doc = PdfDoc::load(pdf_path).ok()?;
    let pages = doc.get_pages();
    let mut page_ids: Vec<(u32, lopdf::ObjectId)> = pages.into_iter().collect();
    page_ids.sort_by_key(|(num, _)| *num);

    let mut best_image: Option<DynamicImage> = None;
    let mut best_score = -1.0_f64;

    for (idx, (_page_num, page_id)) in page_ids.iter().enumerate() {
        if idx >= max_pages as usize {
            break;
        }

        let page_dict = match doc.get_object(*page_id) {
            Ok(Object::Dictionary(d)) => d,
            _ => continue,
        };

        // Get Resources -> XObject dictionary
        let resources = match page_dict.get(b"Resources") {
            Ok(obj) => match resolve_obj(&doc, obj) {
                Some(Object::Dictionary(d)) => d,
                _ => continue,
            },
            Err(_) => continue,
        };

        let xobjects = match resources.get(b"XObject") {
            Ok(obj) => match resolve_obj(&doc, obj) {
                Some(Object::Dictionary(d)) => d,
                _ => continue,
            },
            Err(_) => continue,
        };

        for (_name, obj_ref) in xobjects.iter() {
            let obj_id = match obj_ref {
                Object::Reference(id) => *id,
                _ => continue,
            };

            let xobj = match doc.get_object(obj_id) {
                Ok(Object::Stream(stream)) => stream,
                _ => continue,
            };

            // Check /Subtype is /Image
            let subtype = pdf_dict_name(&xobj.dict, b"Subtype");
            if subtype != "Image" {
                continue;
            }

            let width = pdf_dict_int(&doc, &xobj.dict, b"Width");
            let height = pdf_dict_int(&doc, &xobj.dict, b"Height");

            if (width * height) < 60000 {
                continue;
            }

            // Try to decode the image stream
            let img_data = match xobj.decompressed_content() {
                Ok(data) => data,
                Err(_) => {
                    // If decompression fails, try the raw content
                    xobj.content.clone()
                }
            };

            // Try loading as a standard image format first (JPEG, PNG)
            if let Ok(img) = image::load_from_memory(&img_data) {
                let score = embedded_image_score(&img);
                if score > best_score {
                    best_score = score;
                    best_image = Some(img);
                }
                continue;
            }

            // Try interpreting raw RGB/Gray data
            let bpc = pdf_dict_int(&doc, &xobj.dict, b"BitsPerComponent");
            let cs_name = pdf_dict_name(&xobj.dict, b"ColorSpace");

            if bpc == 8 && width > 0 && height > 0 {
                let w = width as u32;
                let h = height as u32;

                if (cs_name.contains("RGB") || cs_name == "DeviceRGB")
                    && img_data.len() >= (w * h * 3) as usize
                {
                    if let Some(rgb_img) = ImageBuffer::<Rgb<u8>, _>::from_raw(w, h, img_data.clone()) {
                        let dynamic = DynamicImage::ImageRgb8(rgb_img);
                        let score = embedded_image_score(&dynamic);
                        if score > best_score {
                            best_score = score;
                            best_image = Some(dynamic);
                        }
                    }
                } else if (cs_name.contains("Gray") || cs_name == "DeviceGray")
                    && img_data.len() >= (w * h) as usize
                {
                    let rgb_img: RgbImage = ImageBuffer::from_fn(w, h, |x, y| {
                        let idx = (y * w + x) as usize;
                        let v = img_data.get(idx).copied().unwrap_or(0);
                        Rgb([v, v, v])
                    });
                    let dynamic = DynamicImage::ImageRgb8(rgb_img);
                    let score = embedded_image_score(&dynamic);
                    if score > best_score {
                        best_score = score;
                        best_image = Some(dynamic);
                    }
                }
            }
        }
    }

    best_image
}

fn placeholder_thumbnail(_title: &str) -> DynamicImage {
    let mut canvas = RgbImage::from_pixel(THUMBNAIL_W, THUMBNAIL_H, Rgb([23, 34, 47]));
    for y in 0..THUMBNAIL_H {
        for x in 0..THUMBNAIL_W {
            let factor = (y as f32 / THUMBNAIL_H as f32 * 0.3) + 0.85;
            let base = canvas.get_pixel(x, y).0;
            canvas.put_pixel(
                x,
                y,
                Rgb([
                    (base[0] as f32 * factor).min(255.0) as u8,
                    (base[1] as f32 * factor).min(255.0) as u8,
                    (base[2] as f32 * factor).min(255.0) as u8,
                ]),
            );
        }
    }
    DynamicImage::ImageRgb8(canvas)
}

fn save_thumbnail_image(source: &DynamicImage, output_path: &Path) {
    let (sw, sh) = source.dimensions();
    let src_aspect = sw as f64 / sh as f64;
    let tgt_aspect = THUMBNAIL_W as f64 / THUMBNAIL_H as f64;

    let (cw, ch) = if src_aspect > tgt_aspect {
        (THUMBNAIL_W, ((THUMBNAIL_W as f64 / src_aspect) as u32).max(1))
    } else {
        (((THUMBNAIL_H as f64 * src_aspect) as u32).max(1), THUMBNAIL_H)
    };
    let contained = source.resize_exact(cw, ch, FilterType::Lanczos3);

    let bg_resized = source.resize_to_fill(THUMBNAIL_W, THUMBNAIL_H, FilterType::CatmullRom);
    let bg_blurred = bg_resized.blur(22.0);
    let mut canvas = bg_blurred.to_rgb8();
    for pixel in canvas.pixels_mut() {
        pixel.0[0] = (pixel.0[0] as f32 * 0.62) as u8;
        pixel.0[1] = (pixel.0[1] as f32 * 0.62) as u8;
        pixel.0[2] = (pixel.0[2] as f32 * 0.62) as u8;
    }

    let x_off = (THUMBNAIL_W.saturating_sub(cw)) / 2;
    let y_off = (THUMBNAIL_H.saturating_sub(ch)) / 2;
    let contained_rgb = contained.to_rgb8();
    for y in 0..ch.min(THUMBNAIL_H) {
        for x in 0..cw.min(THUMBNAIL_W) {
            let dx = x_off + x;
            let dy = y_off + y;
            if dx < THUMBNAIL_W && dy < THUMBNAIL_H {
                canvas.put_pixel(dx, dy, *contained_rgb.get_pixel(x, y));
            }
        }
    }

    let _ = canvas.save(output_path);
}

fn generate_auto_thumbnail(
    pdf_path: &Path,
    article_id: &str,
    title: &str,
    strategy: &str,
    thumbnails_dir: &Path,
    root_dir: &Path,
) -> ThumbnailInfo {
    let output_path = thumbnails_dir.join(format!("{}.jpg", article_id));
    let mut source_type = "placeholder";

    let mut selected_image: Option<DynamicImage> = None;

    // "hybrid" and "embedded" both try embedded images
    if strategy == "hybrid" || strategy == "embedded" {
        selected_image = first_significant_embedded_image(pdf_path, 8);
        if selected_image.is_some() {
            source_type = "embedded";
        }
    }

    // "first-page" strategy: no pure-Rust page renderer available,
    // so we fall back to placeholder. In "hybrid" mode, we also use
    // placeholder if no embedded image was found.
    if selected_image.is_none() {
        source_type = "placeholder";
        selected_image = Some(placeholder_thumbnail(title));
    }

    if let Some(img) = &selected_image {
        save_thumbnail_image(img, &output_path);
    }

    let rel_path = output_path
        .strip_prefix(root_dir)
        .unwrap_or(&output_path)
        .to_string_lossy()
        .replace('\\', "/");

    ThumbnailInfo {
        path: rel_path,
        source: source_type.to_string(),
        mode: "auto".to_string(),
    }
}

// ── Override Management ─────────────────────────────────────────────────────

fn load_override(overrides_dir: &Path, article_id: &str) -> serde_json::Value {
    let path = overrides_dir.join(format!("{}.json", article_id));
    if !path.exists() {
        return serde_json::Value::Object(serde_json::Map::new());
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => serde_json::Value::Object(serde_json::Map::new()),
    }
}

fn save_override(overrides_dir: &Path, article_id: &str, data: &serde_json::Value) {
    let path = overrides_dir.join(format!("{}.json", article_id));
    let content = serde_json::to_string_pretty(data).unwrap_or_default();
    let _ = fs::write(path, content);
}

fn merge_metadata(auto: &AutoMeta, over: &serde_json::Value) -> Metadata {
    let get_str = |key: &str| -> String {
        over.get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    };

    Metadata {
        title: if over.get("title").is_some() {
            get_str("title")
        } else {
            normalize_text(&auto.title)
        },
        authors: if over.get("authors").is_some() {
            get_str("authors")
        } else {
            normalize_text(&auto.authors)
        },
        year: if over.get("year").is_some() {
            get_str("year")
        } else {
            normalize_text(&auto.year)
        },
        journal: if over.get("journal").is_some() {
            get_str("journal")
        } else {
            normalize_text(&auto.journal)
        },
        doi: if over.get("doi").is_some() {
            get_str("doi")
        } else {
            normalize_text(&auto.doi)
        },
        abstract_text: if over.get("abstract").is_some() {
            get_str("abstract")
        } else {
            normalize_text(&auto.abstract_text)
        },
        keywords: auto.keywords.clone(),
        tags: over
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default(),
        notes: if over.get("notes").is_some() {
            get_str("notes")
        } else {
            String::new()
        },
    }
}

fn resolve_thumbnail(
    auto_thumb: &ThumbnailInfo,
    over: &serde_json::Value,
    root_dir: &Path,
) -> ThumbnailInfo {
    let manual_mode = over
        .get("thumbnail_mode")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
        == "manual";
    let manual_rel = over
        .get("manual_thumbnail")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    if manual_mode && !manual_rel.is_empty() {
        let manual_path = root_dir.join(&manual_rel);
        if manual_path.exists() {
            return ThumbnailInfo {
                path: manual_rel,
                source: "manual".to_string(),
                mode: "manual".to_string(),
            };
        }
    }
    auto_thumb.clone()
}

fn build_search_text(article: &Article) -> String {
    let md = &article.metadata;
    let parts = vec![
        article.pdf_filename.clone(),
        md.title.clone(),
        md.authors.clone(),
        md.year.clone(),
        md.journal.clone(),
        md.doi.clone(),
        md.abstract_text.clone(),
        md.keywords.join(" "),
        md.tags.join(" "),
        md.notes.clone(),
    ];
    parts
        .into_iter()
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

// ── Indexing ────────────────────────────────────────────────────────────────

fn index_articles(state: &mut AppState, strategy: &str) -> IndexPayload {
    state.ensure_dirs();

    let mut pdfs: Vec<PathBuf> = Vec::new();
    for entry in WalkDir::new(&state.articles_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                if ext.eq_ignore_ascii_case("pdf") {
                    pdfs.push(entry.into_path());
                }
            }
        }
    }
    pdfs.sort();

    let mut articles: Vec<Article> = Vec::new();

    for pdf_path in &pdfs {
        let article_id = article_id_for_path(pdf_path, &state.articles_dir);
        let stat = match fs::metadata(pdf_path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let auto = extract_auto_metadata(pdf_path);
        let auto_thumb = generate_auto_thumbnail(
            pdf_path,
            &article_id,
            &auto.title,
            strategy,
            &state.thumbnails_dir,
            &state.root_dir,
        );
        let over = load_override(&state.overrides_dir, &article_id);
        let metadata = merge_metadata(&auto, &over);
        let thumbnail = resolve_thumbnail(&auto_thumb, &over, &state.root_dir);

        let rel_path = pdf_path
            .strip_prefix(&state.root_dir)
            .unwrap_or(pdf_path)
            .to_string_lossy()
            .replace('\\', "/");

        let modified = stat
            .modified()
            .ok()
            .map(|t| {
                let dt: chrono::DateTime<Utc> = t.into();
                dt.to_rfc3339()
            })
            .unwrap_or_default();

        let mut article = Article {
            id: article_id,
            pdf_filename: pdf_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            pdf_relpath: rel_path,
            file_size: stat.len(),
            file_modified: modified,
            auto_meta: auto,
            auto_thumbnail: auto_thumb,
            metadata,
            thumbnail,
            search_text: String::new(),
        };
        article.search_text = build_search_text(&article);
        articles.push(article);
    }

    articles.sort_by(|a, b| {
        let ya = normalize_text(&a.metadata.year);
        let yb = normalize_text(&b.metadata.year);
        yb.cmp(&ya).then_with(|| {
            normalize_text(&a.metadata.title).cmp(&normalize_text(&b.metadata.title))
        })
    });

    let payload = IndexPayload {
        generated_at: Utc::now().to_rfc3339(),
        thumbnail_strategy: strategy.to_string(),
        article_count: articles.len(),
        articles,
    };

    let json = serde_json::to_string_pretty(&payload).unwrap_or_default();
    let _ = fs::write(&state.index_path, json);

    state.index = Some(payload.clone());
    payload
}

fn load_index(state: &mut AppState) -> IndexPayload {
    if let Some(idx) = &state.index {
        return idx.clone();
    }
    if state.index_path.exists() {
        if let Ok(content) = fs::read_to_string(&state.index_path) {
            if let Ok(payload) = serde_json::from_str::<IndexPayload>(&content) {
                state.index = Some(payload.clone());
                return payload;
            }
        }
    }
    index_articles(state, &state.default_strategy.clone())
}

fn find_article_mut<'a>(
    index: &'a mut IndexPayload,
    article_id: &str,
) -> Option<&'a mut Article> {
    index.articles.iter_mut().find(|a| a.id == article_id)
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_articles(
    state: tauri::State<'_, Mutex<AppState>>,
    query: Option<String>,
    tag: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<ArticlesResponse, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let index = load_index(&mut st);

    let query_str = query.unwrap_or_default().trim().to_lowercase();
    let tag_str = tag.unwrap_or_default().trim().to_lowercase();
    let limit = limit.unwrap_or(200).max(1).min(500);
    let offset = offset.unwrap_or(0);

    let mut rows: Vec<Article> = index.articles.clone();

    if !query_str.is_empty() {
        let terms: Vec<&str> = query_str.split_whitespace().collect();
        rows.retain(|a| {
            let st = a.search_text.to_lowercase();
            terms.iter().all(|t| st.contains(t))
        });
    }

    if !tag_str.is_empty() {
        rows.retain(|a| {
            a.metadata
                .tags
                .iter()
                .any(|t| t.trim().to_lowercase() == tag_str)
        });
    }

    let total = rows.len();
    let paged: Vec<Article> = rows.into_iter().skip(offset).take(limit).collect();

    Ok(ArticlesResponse {
        total,
        offset,
        limit,
        generated_at: index.generated_at.clone(),
        thumbnail_strategy: index.thumbnail_strategy.clone(),
        articles: paged,
    })
}

#[tauri::command]
fn get_tags(state: tauri::State<'_, Mutex<AppState>>) -> Result<TagsResponse, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let index = load_index(&mut st);

    let mut counts: HashMap<String, usize> = HashMap::new();
    for article in &index.articles {
        for tag in &article.metadata.tags {
            let clean = tag.trim().to_string();
            if !clean.is_empty() {
                *counts.entry(clean).or_insert(0) += 1;
            }
        }
    }

    let mut items: Vec<TagItem> = counts
        .into_iter()
        .map(|(name, count)| TagItem { name, count })
        .collect();
    items.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(TagsResponse { tags: items })
}

#[tauri::command]
fn reindex(
    state: tauri::State<'_, Mutex<AppState>>,
    strategy: Option<String>,
) -> Result<ReindexResponse, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let strat = strategy
        .unwrap_or_else(|| st.default_strategy.clone())
        .trim()
        .to_string();
    let strat = if ["hybrid", "embedded", "first-page"].contains(&strat.as_str()) {
        strat
    } else {
        st.default_strategy.clone()
    };

    let payload = index_articles(&mut st, &strat);

    Ok(ReindexResponse {
        ok: true,
        article_count: payload.article_count,
        generated_at: payload.generated_at.clone(),
        thumbnail_strategy: payload.thumbnail_strategy.clone(),
    })
}

#[tauri::command]
fn save_metadata(
    state: tauri::State<'_, Mutex<AppState>>,
    article_id: String,
    payload: MetadataPayload,
) -> Result<MutationResponse, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let _index = load_index(&mut st);

    let mut existing = load_override(&st.overrides_dir, &article_id);
    let obj = existing
        .as_object_mut()
        .ok_or("corrupt override")?;

    if let Some(v) = &payload.title {
        obj.insert("title".into(), serde_json::Value::String(v.trim().to_string()));
    }
    if let Some(v) = &payload.authors {
        obj.insert("authors".into(), serde_json::Value::String(v.trim().to_string()));
    }
    if let Some(v) = &payload.year {
        obj.insert("year".into(), serde_json::Value::String(v.trim().to_string()));
    }
    if let Some(v) = &payload.journal {
        obj.insert("journal".into(), serde_json::Value::String(v.trim().to_string()));
    }
    if let Some(v) = &payload.doi {
        obj.insert("doi".into(), serde_json::Value::String(v.trim().to_string()));
    }
    if let Some(v) = &payload.abstract_text {
        obj.insert("abstract".into(), serde_json::Value::String(v.trim().to_string()));
    }
    if let Some(v) = &payload.notes {
        obj.insert("notes".into(), serde_json::Value::String(v.trim().to_string()));
    }
    if let Some(tags) = &payload.tags {
        let arr: Vec<serde_json::Value> = tags
            .iter()
            .map(|t| serde_json::Value::String(t.trim().to_string()))
            .filter(|v| !v.as_str().unwrap_or_default().is_empty())
            .collect();
        obj.insert("tags".into(), serde_json::Value::Array(arr));
    }
    if let Some(mode) = &payload.thumbnail_mode {
        let m = mode.trim().to_lowercase();
        let m = if m == "auto" || m == "manual" {
            m
        } else {
            "auto".to_string()
        };
        obj.insert("thumbnail_mode".into(), serde_json::Value::String(m));
    }

    save_override(&st.overrides_dir, &article_id, &existing);

    let index = st.index.as_mut().ok_or("no index loaded")?;
    let article = find_article_mut(index, &article_id).ok_or("Article not found")?;

    article.metadata = merge_metadata(&article.auto_meta, &existing);
    article.thumbnail = resolve_thumbnail(&article.auto_thumbnail, &existing, &st.root_dir);
    article.search_text = build_search_text(article);

    let updated = article.clone();

    let json = serde_json::to_string_pretty(index).unwrap_or_default();
    let _ = fs::write(&st.index_path, json);

    Ok(MutationResponse {
        ok: true,
        article: updated,
    })
}

#[tauri::command]
fn upload_thumbnail(
    state: tauri::State<'_, Mutex<AppState>>,
    article_id: String,
    data: String,
) -> Result<MutationResponse, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let _index = load_index(&mut st);

    let bytes = B64
        .decode(&data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    let img =
        image::load_from_memory(&bytes).map_err(|e| format!("Failed to parse image: {}", e))?;

    let output_path = st.manual_thumbnails_dir.join(format!("{}.jpg", article_id));
    save_thumbnail_image(&img, &output_path);

    let manual_rel = output_path
        .strip_prefix(&st.root_dir)
        .unwrap_or(&output_path)
        .to_string_lossy()
        .replace('\\', "/");

    let mut over = load_override(&st.overrides_dir, &article_id);
    let obj = over.as_object_mut().ok_or("corrupt override")?;
    obj.insert(
        "thumbnail_mode".into(),
        serde_json::Value::String("manual".into()),
    );
    obj.insert(
        "manual_thumbnail".into(),
        serde_json::Value::String(manual_rel),
    );
    save_override(&st.overrides_dir, &article_id, &over);

    let index = st.index.as_mut().ok_or("no index loaded")?;
    let article = find_article_mut(index, &article_id).ok_or("Article not found")?;
    article.thumbnail = resolve_thumbnail(&article.auto_thumbnail, &over, &st.root_dir);
    article.search_text = build_search_text(article);

    let updated = article.clone();

    let json = serde_json::to_string_pretty(index).unwrap_or_default();
    let _ = fs::write(&st.index_path, json);

    Ok(MutationResponse {
        ok: true,
        article: updated,
    })
}

#[tauri::command]
fn open_pdf(state: tauri::State<'_, Mutex<AppState>>, relpath: String) -> Result<(), String> {
    let st = state.lock().map_err(|e| e.to_string())?;
    let full_path = st.root_dir.join(&relpath);
    if !full_path.exists() {
        return Err(format!("File not found: {}", relpath));
    }
    opener::open(&full_path).map_err(|e| format!("Failed to open PDF: {}", e))
}

#[tauri::command]
fn get_thumbnail_url(
    state: tauri::State<'_, Mutex<AppState>>,
    rel_path: String,
) -> Result<String, String> {
    let st = state.lock().map_err(|e| e.to_string())?;
    let full_path = st.root_dir.join(&rel_path);
    if !full_path.exists() {
        return Ok(String::new());
    }
    let bytes = fs::read(&full_path).map_err(|e| e.to_string())?;
    let encoded = B64.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", encoded))
}

#[tauri::command]
fn get_root_dir(state: tauri::State<'_, Mutex<AppState>>) -> Result<String, String> {
    let st = state.lock().map_err(|e| e.to_string())?;
    Ok(st.root_dir.to_string_lossy().to_string())
}

// ── App Setup ───────────────────────────────────────────────────────────────

pub fn run() {
    let root_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|pp| pp.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let root_dir = if cfg!(debug_assertions) {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or(root_dir)
    } else {
        root_dir
    };

    let app_state = AppState::new(root_dir);
    app_state.ensure_dirs();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(app_state))
        .invoke_handler(tauri::generate_handler![
            get_articles,
            get_tags,
            reindex,
            save_metadata,
            upload_thumbnail,
            open_pdf,
            get_thumbnail_url,
            get_root_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
