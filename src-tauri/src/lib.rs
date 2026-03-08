use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::{DateTime, Utc};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb, RgbImage};
use lopdf::{Document as PdfDoc, Object};
use regex::Regex;
use serde::{Deserialize, Serialize};
use reqwest;
use std::time::Duration;
use sha1_smol::Sha1;
use std::collections::HashMap;
use std::fs;
use std::panic;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;

use walkdir::WalkDir;

// ── Constants ───────────────────────────────────────────────────────────────
const THUMBNAIL_W: u32 = 420;
const THUMBNAIL_H: u32 = 260;
const DEMO_MODE_DIRNAME: &str = "demo_mode";

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Metadata {
    pub title: String,
    pub authors: String,
    pub year: String,
    pub journal: String,
    pub volume: String,
    pub number: String,
    pub pages: String,
    pub doi: String,
    #[serde(rename = "abstract")]
    pub abstract_text: String,
    pub keywords: Vec<String>,
    pub tags: Vec<String>,
    pub notes: String,
    pub ref_dois: Vec<String>,
}

// ── Crossref API Responses ──────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct CrossrefAuthor {
    pub given: Option<String>,
    pub family: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CrossrefDate {
    #[serde(rename = "date-parts")]
    pub date_parts: Option<Vec<Vec<u32>>>,
}

#[derive(Debug, Deserialize)]
pub struct CrossrefReference {
    #[serde(rename = "DOI")]
    pub doi: Option<String>,
    pub year: Option<String>,
    pub author: Option<String>,
    #[serde(rename = "article-title")]
    pub article_title: Option<String>,
    pub unstructured: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CrossrefMessage {
    pub title: Option<Vec<String>>,
    pub author: Option<Vec<CrossrefAuthor>>,
    pub published: Option<CrossrefDate>,
    #[serde(rename = "published-print")]
    pub published_print: Option<CrossrefDate>,
    #[serde(rename = "published-online")]
    pub published_online: Option<CrossrefDate>,
    #[serde(rename = "container-title")]
    pub container_title: Option<Vec<String>>,
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub page: Option<String>,
    #[serde(rename = "DOI")]
    pub doi: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_raw: Option<String>,
    pub reference: Option<Vec<CrossrefReference>>,
}

#[derive(Debug, Deserialize)]
pub struct CrossrefResponse {
    pub status: String,
    pub message: CrossrefMessage,
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
    #[serde(default)]
    pub date_added: String,
    #[serde(default)]
    pub last_opened: String,
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

#[derive(Debug, Serialize)]
pub struct DemoModeResponse {
    pub enabled: bool,
    pub articles_dir: String,
    pub data_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetadataPayload {
    pub title: Option<String>,
    pub authors: Option<String>,
    pub year: Option<String>,
    pub journal: Option<String>,
    pub volume: Option<String>,
    pub number: Option<String>,
    pub pages: Option<String>,
    pub doi: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub thumbnail_mode: Option<String>,
    pub ref_dois: Option<Vec<String>>,
}

// ── App State ───────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LibraryMode {
    Primary,
    Demo,
}

pub struct AppState {
    root_dir: PathBuf,
    demo_root_dir: PathBuf,
    mode: LibraryMode,
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
        let demo_root_dir = root_dir.join(DEMO_MODE_DIRNAME);
        let mut state = Self {
            root_dir,
            demo_root_dir,
            mode: LibraryMode::Primary,
            articles_dir: PathBuf::new(),
            data_dir: PathBuf::new(),
            thumbnails_dir: PathBuf::new(),
            manual_thumbnails_dir: PathBuf::new(),
            overrides_dir: PathBuf::new(),
            index_path: PathBuf::new(),
            index: None,
            default_strategy: "hybrid".into(),
        };
        state.refresh_active_paths();
        state
    }

    fn active_storage_root(&self) -> &Path {
        match self.mode {
            LibraryMode::Primary => &self.root_dir,
            LibraryMode::Demo => &self.demo_root_dir,
        }
    }

    fn refresh_active_paths(&mut self) {
        let storage_root = self.active_storage_root().to_path_buf();
        self.articles_dir = storage_root.join("Articles");
        self.data_dir = storage_root.join("library_data");
        self.thumbnails_dir = self.data_dir.join("thumbnails");
        self.manual_thumbnails_dir = self.data_dir.join("manual_thumbnails");
        self.overrides_dir = self.data_dir.join("overrides");
        self.index_path = self.data_dir.join("index.json");
    }

    fn set_demo_mode(&mut self, enabled: bool) {
        self.mode = if enabled {
            LibraryMode::Demo
        } else {
            LibraryMode::Primary
        };
        self.refresh_active_paths();
        self.index = None;
        self.ensure_dirs();
    }

    fn demo_mode_enabled(&self) -> bool {
        self.mode == LibraryMode::Demo
    }

    fn clear_demo_data(&self) -> Result<(), String> {
        if self.demo_root_dir.exists() {
            fs::remove_dir_all(&self.demo_root_dir)
                .map_err(|e| format!("Failed to clear demo data: {}", e))?;
        }
        Ok(())
    }

    fn ensure_dirs(&self) {
        let _ = fs::create_dir_all(&self.articles_dir);
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

    let abstract_re = Regex::new(r"(?i)^abstract[\s\.:;-]*$|^abstract:|^abstract\s").unwrap();
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
                    Some(String::from_utf16_lossy(&chars))
                } else {
                    // Try UTF-8, fall back to latin-1
                    Some(
                        String::from_utf8(bytes.clone())
                            .unwrap_or_else(|_| bytes.iter().map(|&b| b as char).collect()),
                    )
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

fn extract_pdf_text(pdf_path: &Path, long_parse: bool) -> String {
    // Run on a thread with 8 MB stack to avoid stack overflow on complex PDFs
    let path = pdf_path.to_path_buf();
    let (tx, rx) = std::sync::mpsc::channel();

    let handle = thread::Builder::new()
        .stack_size(8 * 1024 * 1024)
        .spawn(move || {
            let res = panic::catch_unwind(panic::AssertUnwindSafe(|| {
                pdf_extract::extract_text(&path).unwrap_or_default()
            }))
            .unwrap_or_default();
            let _ = tx.send(res);
        });

    if long_parse {
        if let Ok(h) = handle {
            let _ = h.join();
        }
        rx.recv().unwrap_or_default()
    } else {
        match rx.recv_timeout(std::time::Duration::from_secs(2)) {
            Ok(s) => s,
            Err(_) => String::new(),
        }
    }
}

fn extract_auto_metadata(pdf_path: &Path, long_parse: bool) -> AutoMeta {
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

    let doc = match panic::catch_unwind(panic::AssertUnwindSafe(|| PdfDoc::load(pdf_path))) {
        Ok(Ok(d)) => d,
        _ => return fallback,
    };

    let page_count = doc.get_pages().len() as i32;

    // Extract metadata from the Info dictionary
    let (pdf_title, pdf_author, pdf_subject, pdf_keywords, pdf_creation, pdf_mod) =
        if let Ok(info_dict) = doc.trailer.get(b"Info").and_then(|obj| match obj {
            Object::Reference(id) => doc
                .get_object(*id)
                .and_then(|o| o.as_dict().map(|d| d.clone())),
            Object::Dictionary(d) => Ok(d.clone()),
            _ => Err(lopdf::Error::ObjectNotFound),
        }) {
            (
                pdf_dict_string(&doc, &info_dict, b"Title"),
                pdf_dict_string(&doc, &info_dict, b"Author"),
                pdf_dict_string(&doc, &info_dict, b"Subject"),
                pdf_dict_string(&doc, &info_dict, b"Keywords"),
                pdf_dict_string(&doc, &info_dict, b"CreationDate"),
                pdf_dict_string(&doc, &info_dict, b"ModDate"),
            )
        } else {
            (
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
            )
        };

    // Extract text for DOI and abstract
    let full_text = extract_pdf_text(pdf_path, long_parse);

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
    let doc = panic::catch_unwind(panic::AssertUnwindSafe(|| PdfDoc::load(pdf_path)))
        .ok()?
        .ok()?;
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
                    if let Some(rgb_img) =
                        ImageBuffer::<Rgb<u8>, _>::from_raw(w, h, img_data.clone())
                    {
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
        (
            THUMBNAIL_W,
            ((THUMBNAIL_W as f64 / src_aspect) as u32).max(1),
        )
    } else {
        (
            ((THUMBNAIL_H as f64 * src_aspect) as u32).max(1),
            THUMBNAIL_H,
        )
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
        volume: get_str("volume"),
        number: get_str("number"),
        pages: get_str("pages"),
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
        ref_dois: over
            .get("ref_dois")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default(),
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

fn process_single_pdf(
    pdf_path: &Path,
    state: &AppState,
    strategy: &str,
    fast: bool,
    long_parse: bool,
) -> Option<Article> {
    let article_id = article_id_for_path(pdf_path, &state.articles_dir);
    let stat = fs::metadata(pdf_path).ok()?;

    let mut auto = if fast {
        let (fn_title, fn_authors, fn_year) = parse_filename_metadata(pdf_path);
        AutoMeta {
            title: fn_title,
            authors: fn_authors,
            year: fn_year,
            journal: String::new(),
            doi: String::new(),
            abstract_text: String::new(),
            keywords: Vec::new(),
            page_count: 0,
        }
    } else {
        extract_auto_metadata(pdf_path, long_parse)
    };

    // If we extracted a DOI (or have one via another method), attempt to pull perfectly clean metadata from Crossref
    if !fast && !auto.doi.is_empty() {
        if let Ok(crossref_meta) = fetch_doi_metadata_sync(state, &auto.doi) {
            if !crossref_meta.title.is_empty() {
                auto.title = crossref_meta.title;
            }
            if !crossref_meta.authors.is_empty() {
                auto.authors = crossref_meta.authors;
            }
            if !crossref_meta.year.is_empty() {
                auto.year = crossref_meta.year;
            }
            if !crossref_meta.journal.is_empty() {
                auto.journal = crossref_meta.journal;
            }
            if !crossref_meta.abstract_text.is_empty() {
                auto.abstract_text = crossref_meta.abstract_text;
            }
        }
    }

    let auto_thumb = if fast {
        // Reuse existing thumbnail or generate a fast placeholder
        let existing_path = state.thumbnails_dir.join(format!("{}.jpg", article_id));
        if existing_path.exists() {
            let rel_path = existing_path
                .strip_prefix(&state.root_dir)
                .unwrap_or(&existing_path)
                .to_string_lossy()
                .replace('\\', "/");
            ThumbnailInfo {
                path: rel_path,
                source: "existing".to_string(),
                mode: "auto".to_string(),
            }
        } else {
            let output_path = state.thumbnails_dir.join(format!("{}.jpg", article_id));
            let img = placeholder_thumbnail(&auto.title);
            let _ = img.to_rgb8().save(&output_path);
            let rel_path = output_path
                .strip_prefix(&state.root_dir)
                .unwrap_or(&output_path)
                .to_string_lossy()
                .replace('\\', "/");
            ThumbnailInfo {
                path: rel_path,
                source: "placeholder".to_string(),
                mode: "auto".to_string(),
            }
        }
    } else {
        generate_auto_thumbnail(
            pdf_path,
            &article_id,
            &auto.title,
            strategy,
            &state.thumbnails_dir,
            &state.root_dir,
        )
    };
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

    // date_added: read from override or set to now
    let date_added = over
        .get("date_added")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            let now = Utc::now().to_rfc3339();
            // Persist date_added in override so it survives reindexing
            let mut ov = load_override(&state.overrides_dir, &article_id);
            if let Some(obj) = ov.as_object_mut() {
                obj.insert("date_added".into(), serde_json::Value::String(now.clone()));
            }
            save_override(&state.overrides_dir, &article_id, &ov);
            now
        });

    let last_opened = over
        .get("last_opened")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
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
        date_added,
        last_opened,
    };
    article.search_text = build_search_text(&article);
    Some(article)
}

fn index_articles(state: &mut AppState, strategy: &str, fast: bool, long_parse: bool) -> IndexPayload {
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
        // Wrap the entire per-PDF block so one bad file can't crash the app
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            process_single_pdf(pdf_path, state, strategy, fast, long_parse)
        }));
        match result {
            Ok(Some(article)) => articles.push(article),
            Ok(None) => { /* file inaccessible, skip */ }
            Err(_) => {
                eprintln!("Warning: skipped problematic PDF: {}", pdf_path.display());
            }
        }
    }

    articles.sort_by(|a, b| {
        let ya = normalize_text(&a.metadata.year);
        let yb = normalize_text(&b.metadata.year);
        yb.cmp(&ya)
            .then_with(|| normalize_text(&a.metadata.title).cmp(&normalize_text(&b.metadata.title)))
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
    index_articles(state, &state.default_strategy.clone(), true, false)
}

fn find_article_mut<'a>(index: &'a mut IndexPayload, article_id: &str) -> Option<&'a mut Article> {
    index.articles.iter_mut().find(|a| a.id == article_id)
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_articles(
    state: tauri::State<'_, Mutex<AppState>>,
    query: Option<String>,
    tags: Option<Vec<String>>,
    match_mode: Option<String>,
    filter_incomplete: Option<bool>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<ArticlesResponse, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let index = load_index(&mut st);

    let query_str = query.unwrap_or_default().trim().to_lowercase();
    let tags_list = tags.unwrap_or_default();
    let tags_lower: Vec<String> = tags_list.into_iter().map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty()).collect();
    let limit = limit.unwrap_or(200).max(1).min(500);
    let offset = offset.unwrap_or(0);

    let match_mode = match_mode.unwrap_or_else(|| "include".to_string());
    let filter_incomplete = filter_incomplete.unwrap_or(false);

    let mut rows: Vec<Article> = index.articles.clone();

    if !query_str.is_empty() {
        let terms: Vec<&str> = query_str.split_whitespace().collect();
        rows.retain(|a| {
            let st = a.search_text.to_lowercase();
            terms.iter().all(|t| st.contains(t))
        });
    }

    if !tags_lower.is_empty() {
        if match_mode == "any" {
            rows.retain(|a| {
                let article_tags: Vec<String> = a.metadata.tags.iter().map(|t| t.trim().to_lowercase()).collect();
                tags_lower.iter().any(|t| article_tags.contains(t))
            });
        } else if match_mode == "none" {
            rows.retain(|a| {
                let article_tags: Vec<String> = a.metadata.tags.iter().map(|t| t.trim().to_lowercase()).collect();
                !tags_lower.iter().any(|t| article_tags.contains(t))
            });
        } else {
            rows.retain(|a| {
                let article_tags: Vec<String> = a.metadata.tags.iter().map(|t| t.trim().to_lowercase()).collect();
                tags_lower.iter().all(|t| article_tags.contains(t))
            });
        }
    }

    if filter_incomplete {
        rows.retain(|a| {
            let md = &a.metadata;
            let has_title = !md.title.trim().is_empty();
            let has_authors = !md.authors.trim().is_empty();
            let has_year = !md.year.trim().is_empty();
            let has_journal = !md.journal.trim().is_empty();
            let has_doi = !md.doi.trim().is_empty();
            let has_abstract = !md.abstract_text.trim().is_empty();
            let has_tags = !md.tags.is_empty() && md.tags.iter().any(|t| !t.trim().is_empty());
            
            !(has_title && has_authors && has_year && has_journal && has_doi && has_abstract && has_tags)
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
    fast: Option<bool>,
    long_parse: Option<bool>,
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

    let fast_mode = fast.unwrap_or(false);
    let lp_mode = long_parse.unwrap_or(false);
    let payload = index_articles(&mut st, &strat, fast_mode, lp_mode);

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
    let obj = existing.as_object_mut().ok_or("corrupt override")?;

    if let Some(v) = &payload.title {
        obj.insert(
            "title".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.authors {
        obj.insert(
            "authors".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.year {
        obj.insert(
            "year".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.journal {
        obj.insert(
            "journal".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.volume {
        obj.insert(
            "volume".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.number {
        obj.insert(
            "number".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.pages {
        obj.insert(
            "pages".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.doi {
        obj.insert(
            "doi".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.abstract_text {
        obj.insert(
            "abstract".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
    }
    if let Some(v) = &payload.notes {
        obj.insert(
            "notes".into(),
            serde_json::Value::String(v.trim().to_string()),
        );
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
    if let Some(dois) = &payload.ref_dois {
        let arr: Vec<serde_json::Value> = dois
            .iter()
            .map(|d| serde_json::Value::String(d.trim().to_string()))
            .filter(|v| !v.as_str().unwrap_or_default().is_empty())
            .collect();
        obj.insert("ref_dois".into(), serde_json::Value::Array(arr));
    }

    save_override(&st.overrides_dir, &article_id, &existing);

    let root_dir = st.root_dir.clone();
    let index_path = st.index_path.clone();
    let index = st.index.as_mut().ok_or("no index loaded")?;
    let article = find_article_mut(index, &article_id).ok_or("Article not found")?;

    article.metadata = merge_metadata(&article.auto_meta, &existing);
    article.thumbnail = resolve_thumbnail(&article.auto_thumbnail, &existing, &root_dir);
    article.search_text = build_search_text(article);

    let updated = article.clone();

    let json = serde_json::to_string_pretty(index).unwrap_or_default();
    let _ = fs::write(&index_path, json);

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

    let root_dir = st.root_dir.clone();
    let index_path = st.index_path.clone();
    let index = st.index.as_mut().ok_or("no index loaded")?;
    let article = find_article_mut(index, &article_id).ok_or("Article not found")?;
    article.thumbnail = resolve_thumbnail(&article.auto_thumbnail, &over, &root_dir);
    article.search_text = build_search_text(article);

    let updated = article.clone();

    let json = serde_json::to_string_pretty(index).unwrap_or_default();
    let _ = fs::write(&index_path, json);

    Ok(MutationResponse {
        ok: true,
        article: updated,
    })
}

#[tauri::command]
fn remove_article(
    state: tauri::State<'_, Mutex<AppState>>,
    article_id: String,
) -> Result<bool, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let _index = load_index(&mut st);

    let article_opt = st.index.as_ref().and_then(|idx| idx.articles.iter().find(|a| a.id == article_id).cloned());
    let article = article_opt.ok_or("Article not found")?;

    // Delete PDF
    let pdf_path = st.root_dir.join(&article.pdf_relpath);
    let _ = fs::remove_file(pdf_path);

    // Delete manual thumbnail
    let manual_thumb = st.manual_thumbnails_dir.join(format!("{}.jpg", article_id));
    let _ = fs::remove_file(manual_thumb);

    // Delete auto thumbnail
    let auto_thumb = st.root_dir.join(&article.auto_thumbnail.path);
    let _ = fs::remove_file(auto_thumb);

    // Delete override meta
    let override_file = st.overrides_dir.join(format!("{}.json", article_id));
    let _ = fs::remove_file(override_file);

    // Remove from index
    let index_path = st.index_path.clone();
    let index = st.index.as_mut().ok_or("no index loaded")?;
    index.articles.retain(|a| a.id != article_id);
    index.article_count = index.articles.len();

    let json = serde_json::to_string_pretty(index).unwrap_or_default();
    let _ = fs::write(&index_path, json);

    Ok(true)
}

#[tauri::command]
fn open_pdf(state: tauri::State<'_, Mutex<AppState>>, relpath: String) -> Result<(), String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let full_path = st.root_dir.join(&relpath);
    if !full_path.exists() {
        return Err(format!("File not found: {}", relpath));
    }

    // Update last_opened timestamp
    let now = Utc::now().to_rfc3339();
    let overrides_dir = st.overrides_dir.clone();
    let index_path = st.index_path.clone();
    if let Some(index) = st.index.as_mut() {
        if let Some(article) = index.articles.iter_mut().find(|a| a.pdf_relpath == relpath) {
            article.last_opened = now.clone();
            let mut over = load_override(&overrides_dir, &article.id);
            if let Some(obj) = over.as_object_mut() {
                obj.insert("last_opened".into(), serde_json::Value::String(now));
            }
            save_override(&overrides_dir, &article.id, &over);
        }
        let json = serde_json::to_string_pretty(index).unwrap_or_default();
        let _ = fs::write(&index_path, json);
    }

    opener::open(&full_path).map_err(|e| format!("Failed to open PDF: {}", e))
}

#[tauri::command]
async fn fetch_doi_metadata(state: tauri::State<'_, Mutex<AppState>>, doi: String) -> Result<Metadata, String> {
    let clean_doi = doi.trim().to_string();
    if clean_doi.is_empty() {
        return Err("DOI cannot be empty".into());
    }

    let data_dir = state
        .lock()
        .map_err(|e| format!("State lock error during DOI fetch: {}", e))?
        .data_dir
        .clone();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("LiteratureLibrary/0.8 (mailto:user@localhost)")
        .build()
        .map_err(|e| {
            let msg = format!("Client builder error: {}", e);
            write_crash_log(&data_dir, &msg);
            msg
        })?;

    let url = format!("https://api.crossref.org/works/{}", clean_doi);

    let resp = client.get(&url).send().await.map_err(|e| {
        let msg = format!("Network error fetching DOI '{}': {}", clean_doi, e);
        write_crash_log(&data_dir, &msg);
        msg
    })?;

    if !resp.status().is_success() {
        let msg = format!("API returned status {} for DOI '{}'", resp.status(), clean_doi);
        write_crash_log(&data_dir, &msg);
        return Err(msg);
    }

    let crossref: CrossrefResponse = resp.json().await.map_err(|e| {
        let msg = format!("JSON parsing error for DOI '{}': {}", clean_doi, e);
        write_crash_log(&data_dir, &msg);
        msg
    })?;
    let msg = crossref.message;

    let title = msg.title.unwrap_or_default().into_iter().next().unwrap_or_default();

    let mut authors_list = Vec::new();
    if let Some(author_vec) = msg.author {
        for a in author_vec {
            let given = a.given.unwrap_or_default();
            let family = a.family.unwrap_or_default();
            if !given.is_empty() && !family.is_empty() {
                authors_list.push(format!("{} {}", given, family));
            } else if !family.is_empty() {
                authors_list.push(family);
            }
        }
    }
    let authors = authors_list.join(", ");

    let mut year = String::new();
    let dates_to_try = [msg.published, msg.published_print, msg.published_online];
    for d in dates_to_try.into_iter().flatten() {
        if let Some(parts) = &d.date_parts {
            if let Some(first_part) = parts.first() {
                if let Some(y) = first_part.first() {
                    year = y.to_string();
                    break;
                }
            }
        }
    }

    let journal = msg.container_title.unwrap_or_default().into_iter().next().unwrap_or_default();
    let volume = msg.volume.unwrap_or_default();
    let number = msg.issue.unwrap_or_default();
    let pages = msg.page.unwrap_or_default();
    let returned_doi = msg.doi.unwrap_or(clean_doi.clone());

    let mut abstract_text = msg.abstract_raw.unwrap_or_default();
    // Strip common JATS XML tags
    for tag in &["<jats:title>Abstract</jats:title>", "<jats:p>", "<jats:sec>", "</jats:sec>", "<sec>", "</sec>", "<title>", "</title>"] {
        abstract_text = abstract_text.replace(tag, "");
    }
    abstract_text = abstract_text.replace("</jats:p>", "\n\n");
    // Strip any remaining XML-like tags
    let tag_re = regex::Regex::new(r"<[^>]+>").unwrap();
    abstract_text = tag_re.replace_all(&abstract_text, "").to_string();

    // Collect reference DOIs
    let ref_dois: Vec<String> = msg.reference
        .unwrap_or_default()
        .into_iter()
        .filter_map(|r| {
            if let Some(d) = r.doi.filter(|d| !d.is_empty()) {
                let mut out = String::new();
                if let Some(y) = r.year.filter(|y| !y.is_empty()) {
                    out.push_str(&format!("({}) ", y));
                }
                if let Some(a) = r.author.filter(|a| !a.is_empty()) {
                    out.push_str(&format!("{}. ", a));
                }
                if let Some(t) = r.article_title.or(r.unstructured).filter(|t| !t.is_empty()) {
                    let words: Vec<&str> = t.split_whitespace().take(4).collect();
                    out.push_str(&format!("\"{}...\" ", words.join(" ")));
                }
                out.push_str(&format!("- {}", d.to_lowercase()));
                Some(out.trim().to_string())
            } else {
                None
            }
        })
        .collect();

    let meta = Metadata {
        title,
        authors,
        year,
        journal,
        volume,
        number,
        pages,
        doi: returned_doi.to_lowercase(),
        abstract_text: abstract_text.trim().to_string(),
        keywords: Vec::new(),
        tags: Vec::new(),
        notes: String::new(),
        ref_dois,
    };

    Ok(meta)
}

fn fetch_doi_metadata_sync(state: &AppState, doi: &str) -> Result<Metadata, String> {
    let clean_doi = doi.trim().to_string();
    if clean_doi.is_empty() {
        return Err("DOI cannot be empty".into());
    }

    let data_dir = state.data_dir.clone();

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("LiteratureLibrary/0.8 (mailto:user@localhost)")
        .build()
        .map_err(|e| {
            let msg = format!("Client builder error: {}", e);
            write_crash_log(&data_dir, &msg);
            msg
        })?;

    let url = format!("https://api.crossref.org/works/{}", clean_doi);

    let resp = client.get(&url).send().map_err(|e| {
        let msg = format!("Network error fetching DOI '{}': {}", clean_doi, e);
        write_crash_log(&data_dir, &msg);
        msg
    })?;

    if !resp.status().is_success() {
        let msg = format!("API returned status {} for DOI '{}'", resp.status(), clean_doi);
        write_crash_log(&data_dir, &msg);
        return Err(msg);
    }

    let crossref: CrossrefResponse = resp.json().map_err(|e| {
        let msg = format!("JSON parsing error for DOI '{}': {}", clean_doi, e);
        write_crash_log(&data_dir, &msg);
        msg
    })?;
    let msg = crossref.message;

    let title = msg.title.unwrap_or_default().into_iter().next().unwrap_or_default();

    let mut authors_list = Vec::new();
    if let Some(author_vec) = msg.author {
        for a in author_vec {
            let given = a.given.unwrap_or_default();
            let family = a.family.unwrap_or_default();
            if !given.is_empty() && !family.is_empty() {
                authors_list.push(format!("{} {}", given, family));
            } else if !family.is_empty() {
                authors_list.push(family);
            }
        }
    }
    let authors = authors_list.join(", ");

    let mut year = String::new();
    let dates_to_try = [msg.published, msg.published_print, msg.published_online];
    for d in dates_to_try.into_iter().flatten() {
        if let Some(parts) = &d.date_parts {
            if let Some(first_part) = parts.first() {
                if let Some(y) = first_part.first() {
                    year = y.to_string();
                    break;
                }
            }
        }
    }

    let journal = msg.container_title.unwrap_or_default().into_iter().next().unwrap_or_default();
    let volume = msg.volume.unwrap_or_default();
    let number = msg.issue.unwrap_or_default();
    let pages = msg.page.unwrap_or_default();
    let returned_doi = msg.doi.unwrap_or(clean_doi.clone());

    let mut abstract_text = msg.abstract_raw.unwrap_or_default();
    for tag in &["<jats:title>Abstract</jats:title>", "<jats:p>", "<jats:sec>", "</jats:sec>", "<sec>", "</sec>", "<title>", "</title>"] {
        abstract_text = abstract_text.replace(tag, "");
    }
    abstract_text = abstract_text.replace("</jats:p>", "\n\n");
    let tag_re = regex::Regex::new(r"<[^>]+>").unwrap();
    abstract_text = tag_re.replace_all(&abstract_text, "").to_string();

    let ref_dois: Vec<String> = msg.reference
        .unwrap_or_default()
        .into_iter()
        .filter_map(|r| {
            if let Some(d) = r.doi.filter(|d| !d.is_empty()) {
                let mut out = String::new();
                if let Some(y) = r.year.filter(|y| !y.is_empty()) {
                    out.push_str(&format!("({}) ", y));
                }
                if let Some(a) = r.author.filter(|a| !a.is_empty()) {
                    out.push_str(&format!("{}. ", a));
                }
                if let Some(t) = r.article_title.or(r.unstructured).filter(|t| !t.is_empty()) {
                    let words: Vec<&str> = t.split_whitespace().take(4).collect();
                    out.push_str(&format!("\"{}...\" ", words.join(" ")));
                }
                out.push_str(&format!("- {}", d.to_lowercase()));
                Some(out.trim().to_string())
            } else {
                None
            }
        })
        .collect();

    let meta = Metadata {
        title,
        authors,
        year,
        journal,
        volume,
        number,
        pages,
        doi: returned_doi.to_lowercase(),
        abstract_text: abstract_text.trim().to_string(),
        keywords: Vec::new(),
        tags: Vec::new(),
        notes: String::new(),
        ref_dois,
    };

    Ok(meta)
}

#[tauri::command]
fn open_file_location(
    state: tauri::State<'_, Mutex<AppState>>,
    relpath: String,
) -> Result<(), String> {
    let st = state.lock().map_err(|e| e.to_string())?;
    let full_path = st.root_dir.join(&relpath);
    if !full_path.exists() {
        return Err(format!("File not found: {}", relpath));
    }

    #[cfg(target_os = "windows")]
    {
        let mut path_str = full_path.to_string_lossy().replace('/', "\\");
        if path_str.starts_with("\\\\?\\") {
            path_str = path_str.replacen("\\\\?\\", "", 1);
        }

        Command::new("explorer.exe")
            .raw_arg(format!("/select,\"{}\"", path_str))
            .spawn()
            .map_err(|e| format!("Failed to open location: {}", e))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let parent = full_path.parent().unwrap_or(&full_path);
        return opener::open(parent).map_err(|e| format!("Failed to open location: {}", e));
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".into())
}

#[tauri::command]
fn open_articles_folder(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let st = state.lock().map_err(|e| e.to_string())?;

    // Strip `\\?\` prefix which often breaks `opener` on Windows
    let mut path_str = st.articles_dir.to_string_lossy().to_string();
    if path_str.starts_with("\\\\?\\") {
        path_str = path_str.replacen("\\\\?\\", "", 1);
    }

    opener::open(&path_str).map_err(|e| format!("Failed to open articles folder: {}", e))
}

#[tauri::command]
fn set_demo_mode(
    state: tauri::State<'_, Mutex<AppState>>,
    enabled: bool,
    clear_demo_data: Option<bool>,
) -> Result<DemoModeResponse, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;

    if enabled {
        st.set_demo_mode(true);
    } else {
        if clear_demo_data.unwrap_or(false) {
            st.index = None;
            st.clear_demo_data()?;
        }
        st.set_demo_mode(false);
    }

    Ok(DemoModeResponse {
        enabled: st.demo_mode_enabled(),
        articles_dir: st.articles_dir.to_string_lossy().to_string(),
        data_dir: st.data_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let target = url.trim();
    if target.is_empty() {
        return Err("URL is empty".into());
    }
    if !(target.starts_with("http://") || target.starts_with("https://")) {
        return Err("Only http/https URLs are allowed".into());
    }
    opener::open(target).map_err(|e| format!("Failed to open URL: {}", e))
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
fn import_pdf(
    state: tauri::State<'_, Mutex<AppState>>,
    filename: String,
    data: String,
    long_parse: Option<bool>,
) -> Result<MutationResponse, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let _index = load_index(&mut st);
    st.ensure_dirs();

    // Decode the base64 PDF data
    let bytes = B64
        .decode(&data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let file_size = bytes.len() as u64;

    // Determine output filename, deduplicating if needed
    let mut safe_name = filename.trim().replace('/', "_").replace('\\', "_");
    if safe_name.is_empty() {
        safe_name = "imported.pdf".to_string();
    } else if !safe_name.to_lowercase().ends_with(".pdf") {
        safe_name = format!("{}.pdf", safe_name);
    }

    // Duplicate check
    if let Some(index) = st.index.as_ref() {
        if let Some(existing) = index
            .articles
            .iter()
            .find(|a| a.pdf_filename == safe_name && a.file_size == file_size)
        {
            return Ok(MutationResponse {
                ok: true,
                article: existing.clone(),
            });
        }
    }

    let mut output_path = st.articles_dir.join(&safe_name);
    if output_path.exists() {
        let stem = output_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext = output_path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let mut counter = 1u32;
        loop {
            let candidate = st
                .articles_dir
                .join(format!("{}_{}.{}", stem, counter, ext));
            if !candidate.exists() {
                output_path = candidate;
                break;
            }
            counter += 1;
        }
    }

    fs::write(&output_path, &bytes).map_err(|e| format!("Failed to write PDF: {}", e))?;

    // Process the new PDF
    let strategy = st.default_strategy.clone();
    let lp = long_parse.unwrap_or(false);
    let article = process_single_pdf(&output_path, &st, &strategy, true, lp)
        .ok_or_else(|| "Failed to process imported PDF".to_string())?;

    // Add to the in-memory index
    let index_path = st.index_path.clone();
    let index = st.index.as_mut().ok_or("no index loaded")?;
    index.articles.push(article.clone());
    index.article_count = index.articles.len();

    let json = serde_json::to_string_pretty(index).unwrap_or_default();
    let _ = fs::write(&index_path, json);

    Ok(MutationResponse { ok: true, article })
}

#[tauri::command]
async fn import_pdfs_from_paths(
    state: tauri::State<'_, Mutex<AppState>>,
    paths: Vec<String>,
    long_parse: Option<bool>,
) -> Result<Vec<MutationResponse>, String> {
    // Clone necessary state for async usage
    let (articles_dir, default_strategy) = {
        let st = state.lock().map_err(|e| e.to_string())?;
        (st.articles_dir.clone(), st.default_strategy.clone())
    };

    // First do some quick duplicate filtering without locking heavily
    let mut tasks = Vec::new();
    let mut instant_results = Vec::new();

    for path_str in paths {
        let path = PathBuf::from(&path_str);
        if !path.exists() || !path.is_file() {
            continue;
        }

        let file_size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
            
        let mut safe_name = filename.trim().replace('/', "_").replace('\\', "_");
        if safe_name.is_empty() {
            safe_name = "imported.pdf".to_string();
        } else if !safe_name.to_lowercase().ends_with(".pdf") {
            safe_name = format!("{}.pdf", safe_name);
        }

        // Check duplicate
        let mut is_dup = false;
        let mut existing_article = None;
        {
            let st = state.lock().map_err(|e| e.to_string())?;
            if let Some(index) = st.index.as_ref() {
                if let Some(existing) = index
                    .articles
                    .iter()
                    .find(|a| a.pdf_filename == safe_name && a.file_size == file_size)
                {
                    is_dup = true;
                    existing_article = Some(existing.clone());
                }
            }
        }

        if is_dup {
            instant_results.push(MutationResponse {
                ok: true,
                article: existing_article.unwrap(),
            });
            continue;
        }

        // Not a duplicate; figure out the final output path
        let mut output_path = articles_dir.join(&safe_name);
        let path_parent = path.parent().and_then(|p| p.canonicalize().ok());
        let articles_can = articles_dir.canonicalize().ok();

        if path_parent.is_some() && path_parent == articles_can {
            output_path = path.clone();
        } else {
            if output_path.exists() {
                let stem = output_path.file_stem().unwrap_or_default().to_string_lossy();
                let ext = output_path.extension().unwrap_or_default().to_string_lossy();
                let mut counter = 1u32;
                loop {
                    let candidate = articles_dir.join(format!("{}_{}.{}", stem, counter, ext));
                    if !candidate.exists() {
                        output_path = candidate;
                        break;
                    }
                    counter += 1;
                }
            }
        }

        tasks.push((path, output_path));
    }

    // Now copy files and process PDFs concurrently (max 3 at a time)
    // to strictly respect Crossref API rate limits.
    let strategy_arc = Arc::new(default_strategy);
    
    // We must separate AppState from the async thread, so we will generate the full articles, 
    // and ONLY attach to the index queue afterwards.
    let mut async_results = Vec::new();
    
    // To process concurrently, but `process_single_pdf` demands an `&AppState`. 
    // We will do locking sequentially for each task to keep it simple and thread-safe.
    for (src_path, dst) in tasks {
        if src_path != dst {
             if let Err(e) = fs::copy(&src_path, &dst) {
                 return Err(format!("Failed to copy file: {}", e));
             }
        }
        
        // This blocks the event thread a tiny bit per PDF, but the network request 
        // to crossref will sleep it gracefully, acting as its own throttle limit.
        let article_opt = {
            let st = state.lock().map_err(|e| e.to_string())?;
            let lp = long_parse.unwrap_or(false);
            process_single_pdf(&dst, &st, &strategy_arc, true, lp)
        };
        
        if let Some(article) = article_opt {
             async_results.push(MutationResponse { ok: true, article });
        } else {
             return Err(format!("Failed to parse PDF metadata: {:?}", dst));
        }
    }

    // Final bulk state lock
    let mut final_results = instant_results;
    if !async_results.is_empty() {
        let mut st = state.lock().map_err(|e| e.to_string())?;
        if let Some(index) = st.index.as_mut() {
            for res in &async_results {
                index.articles.retain(|a| a.id != res.article.id);
                index.articles.push(res.article.clone());
            }
            index.article_count = index.articles.len();
        }
        
        if let Some(index) = st.index.as_ref() {
            if let Ok(json) = serde_json::to_string_pretty(index) {
                let _ = fs::write(&st.index_path, json);
            }
        }
        final_results.extend(async_results);
    }

    Ok(final_results)
}

#[tauri::command]
fn get_root_dir(state: tauri::State<'_, Mutex<AppState>>) -> Result<String, String> {
    let st = state.lock().map_err(|e| e.to_string())?;
    Ok(st.root_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_storage_report(state: tauri::State<'_, Mutex<AppState>>) -> Result<StorageReportResponse, String> {
    let (root_dir, data_dir, overrides_dir, index_path, index_payload) = {
        let mut st = state.lock().map_err(|e| e.to_string())?;
        let index = load_index(&mut st).clone();
        (
            st.root_dir.clone(),
            st.data_dir.clone(),
            st.overrides_dir.clone(),
            st.index_path.clone(),
            index,
        )
    };

    let mut folders = Vec::new();
    let mut total_bytes = 0_u64;
    let mut root_file_bytes = 0_u64;
    let mut root_file_count = 0_usize;

    let entries = fs::read_dir(&root_dir).map_err(|e| format!("Failed to read app folder: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let meta = entry.metadata().map_err(|e| e.to_string())?;

        if meta.is_dir() {
            let (bytes, file_count, dir_count) = collect_recursive_usage(&path)?;
            total_bytes += bytes;
            folders.push(StorageFolderStat {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                bytes,
                file_count,
                dir_count,
            });
        } else if meta.is_file() {
            total_bytes += meta.len();
            root_file_bytes += meta.len();
            root_file_count += 1;
        }
    }

    folders.sort_by(|a, b| {
        b.bytes
            .cmp(&a.bytes)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let article_count = index_payload.articles.len();
    let overrides_bytes = collect_recursive_usage(&overrides_dir)?.0;
    let backup_bytes = file_size_or_zero(&data_dir.join("index.backup1.json"))
        + file_size_or_zero(&data_dir.join("index.backup2.json"));

    let mut identity_bytes = 0_u64;
    let mut auto_meta_bytes = 0_u64;
    let mut merged_meta_bytes = 0_u64;
    let mut search_text_bytes = 0_u64;
    let mut search_text_non_empty = 0_usize;
    let mut thumbnail_ref_bytes = 0_u64;
    let mut timestamp_bytes = 0_u64;

    let mut title_bytes = 0_u64;
    let mut title_non_empty = 0_usize;
    let mut authors_bytes = 0_u64;
    let mut authors_non_empty = 0_usize;
    let mut year_bytes = 0_u64;
    let mut year_non_empty = 0_usize;
    let mut journal_bytes = 0_u64;
    let mut journal_non_empty = 0_usize;
    let mut volume_bytes = 0_u64;
    let mut volume_non_empty = 0_usize;
    let mut issue_bytes = 0_u64;
    let mut issue_non_empty = 0_usize;
    let mut pages_bytes = 0_u64;
    let mut pages_non_empty = 0_usize;
    let mut doi_bytes = 0_u64;
    let mut doi_non_empty = 0_usize;
    let mut abstract_bytes = 0_u64;
    let mut abstract_non_empty = 0_usize;
    let mut keywords_bytes = 0_u64;
    let mut keywords_non_empty = 0_usize;
    let mut tags_bytes = 0_u64;
    let mut tags_non_empty = 0_usize;
    let mut notes_bytes = 0_u64;
    let mut notes_non_empty = 0_usize;
    let mut ref_dois_bytes = 0_u64;
    let mut ref_dois_non_empty = 0_usize;

    for article in &index_payload.articles {
        identity_bytes += json_size(&(
            &article.id,
            &article.pdf_filename,
            &article.pdf_relpath,
            article.file_size,
            &article.file_modified,
        ));
        auto_meta_bytes += json_size(&article.auto_meta);
        merged_meta_bytes += json_size(&article.metadata);
        thumbnail_ref_bytes += json_size(&(&article.auto_thumbnail, &article.thumbnail));
        timestamp_bytes += json_size(&(&article.date_added, &article.last_opened));

        search_text_bytes += json_size(&article.search_text);
        if !article.search_text.trim().is_empty() {
            search_text_non_empty += 1;
        }

        title_bytes += json_size(&article.metadata.title);
        if !article.metadata.title.trim().is_empty() {
            title_non_empty += 1;
        }

        authors_bytes += json_size(&article.metadata.authors);
        if !article.metadata.authors.trim().is_empty() {
            authors_non_empty += 1;
        }

        year_bytes += json_size(&article.metadata.year);
        if !article.metadata.year.trim().is_empty() {
            year_non_empty += 1;
        }

        journal_bytes += json_size(&article.metadata.journal);
        if !article.metadata.journal.trim().is_empty() {
            journal_non_empty += 1;
        }

        volume_bytes += json_size(&article.metadata.volume);
        if !article.metadata.volume.trim().is_empty() {
            volume_non_empty += 1;
        }

        issue_bytes += json_size(&article.metadata.number);
        if !article.metadata.number.trim().is_empty() {
            issue_non_empty += 1;
        }

        pages_bytes += json_size(&article.metadata.pages);
        if !article.metadata.pages.trim().is_empty() {
            pages_non_empty += 1;
        }

        doi_bytes += json_size(&article.metadata.doi);
        if !article.metadata.doi.trim().is_empty() {
            doi_non_empty += 1;
        }

        abstract_bytes += json_size(&article.metadata.abstract_text);
        if !article.metadata.abstract_text.trim().is_empty() {
            abstract_non_empty += 1;
        }

        keywords_bytes += json_size(&article.metadata.keywords);
        if !article.metadata.keywords.is_empty() {
            keywords_non_empty += 1;
        }

        tags_bytes += json_size(&article.metadata.tags);
        if !article.metadata.tags.is_empty() {
            tags_non_empty += 1;
        }

        notes_bytes += json_size(&article.metadata.notes);
        if !article.metadata.notes.trim().is_empty() {
            notes_non_empty += 1;
        }

        ref_dois_bytes += json_size(&article.metadata.ref_dois);
        if !article.metadata.ref_dois.is_empty() {
            ref_dois_non_empty += 1;
        }
    }

    let mut section_bytes = Vec::new();
    push_stat(&mut section_bytes, "article identity + file info", identity_bytes, article_count);
    push_stat(&mut section_bytes, "auto metadata payload", auto_meta_bytes, article_count);
    push_stat(&mut section_bytes, "merged metadata payload", merged_meta_bytes, article_count);
    push_stat(&mut section_bytes, "search text payload", search_text_bytes, search_text_non_empty);
    push_stat(&mut section_bytes, "thumbnail references", thumbnail_ref_bytes, article_count);
    push_stat(&mut section_bytes, "timestamps", timestamp_bytes, article_count);
    section_bytes.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let mut merged_field_bytes = Vec::new();
    push_stat(&mut merged_field_bytes, "abstract", abstract_bytes, abstract_non_empty);
    push_stat(&mut merged_field_bytes, "notes", notes_bytes, notes_non_empty);
    push_stat(&mut merged_field_bytes, "title", title_bytes, title_non_empty);
    push_stat(&mut merged_field_bytes, "authors", authors_bytes, authors_non_empty);
    push_stat(&mut merged_field_bytes, "journal", journal_bytes, journal_non_empty);
    push_stat(&mut merged_field_bytes, "doi", doi_bytes, doi_non_empty);
    push_stat(&mut merged_field_bytes, "tags", tags_bytes, tags_non_empty);
    push_stat(&mut merged_field_bytes, "reference DOIs", ref_dois_bytes, ref_dois_non_empty);
    push_stat(&mut merged_field_bytes, "keywords", keywords_bytes, keywords_non_empty);
    push_stat(&mut merged_field_bytes, "year", year_bytes, year_non_empty);
    push_stat(&mut merged_field_bytes, "volume", volume_bytes, volume_non_empty);
    push_stat(&mut merged_field_bytes, "issue", issue_bytes, issue_non_empty);
    push_stat(&mut merged_field_bytes, "pages", pages_bytes, pages_non_empty);
    merged_field_bytes.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    Ok(StorageReportResponse {
        root_dir: root_dir.to_string_lossy().to_string(),
        total_bytes,
        root_file_bytes,
        root_file_count,
        folders,
        metadata: MetadataStorageReport {
            article_count,
            index_json_bytes: file_size_or_zero(&index_path),
            overrides_bytes,
            backup_bytes,
            section_bytes,
            merged_field_bytes,
        },
    })
}

// ── Backups ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct BackupInfo {
    pub name: String,
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BackupsResponse {
    pub backups: Vec<BackupInfo>,
}

#[derive(Debug, Serialize)]
pub struct StorageFolderStat {
    pub name: String,
    pub path: String,
    pub bytes: u64,
    pub file_count: usize,
    pub dir_count: usize,
}

#[derive(Debug, Serialize)]
pub struct StorageBreakdownStat {
    pub name: String,
    pub bytes: u64,
    pub non_empty: usize,
}

#[derive(Debug, Serialize)]
pub struct MetadataStorageReport {
    pub article_count: usize,
    pub index_json_bytes: u64,
    pub overrides_bytes: u64,
    pub backup_bytes: u64,
    pub section_bytes: Vec<StorageBreakdownStat>,
    pub merged_field_bytes: Vec<StorageBreakdownStat>,
}

#[derive(Debug, Serialize)]
pub struct StorageReportResponse {
    pub root_dir: String,
    pub total_bytes: u64,
    pub root_file_bytes: u64,
    pub root_file_count: usize,
    pub folders: Vec<StorageFolderStat>,
    pub metadata: MetadataStorageReport,
}

fn json_size<T: Serialize>(value: &T) -> u64 {
    serde_json::to_vec(value)
        .map(|buf| buf.len() as u64)
        .unwrap_or(0)
}

fn file_size_or_zero(path: &Path) -> u64 {
    fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
}

fn collect_recursive_usage(path: &Path) -> Result<(u64, usize, usize), String> {
    if !path.exists() {
        return Ok((0, 0, 0));
    }

    let mut bytes = 0_u64;
    let mut file_count = 0_usize;
    let mut dir_count = 0_usize;

    for entry in WalkDir::new(path).min_depth(1) {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_file() {
            bytes += meta.len();
            file_count += 1;
        } else if meta.is_dir() {
            dir_count += 1;
        }
    }

    Ok((bytes, file_count, dir_count))
}

fn push_stat(stats: &mut Vec<StorageBreakdownStat>, name: &str, bytes: u64, non_empty: usize) {
    stats.push(StorageBreakdownStat {
        name: name.to_string(),
        bytes,
        non_empty,
    });
}

#[tauri::command]
fn create_backup(state: tauri::State<'_, Mutex<AppState>>) -> Result<bool, String> {
    let st = state.lock().map_err(|e| e.to_string())?;
    if !st.index_path.exists() {
        return Ok(false);
    }
    
    let b1 = st.data_dir.join("index.backup1.json");
    let b2 = st.data_dir.join("index.backup2.json");

    // Rotate b1 to b2 if b1 exists
    if b1.exists() {
        let _ = fs::copy(&b1, &b2);
    }
    // Copy current to b1
    match fs::copy(&st.index_path, &b1) {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Failed to create backup: {}", e)),
    }
}

#[tauri::command]
fn get_article_text_front(
    state: tauri::State<'_, Mutex<AppState>>,
    article_id: String,
) -> Result<String, String> {
    let (pdf_path, data_dir) = {
        let mut st = state.lock().map_err(|e| e.to_string())?;
        let index = load_index(&mut st);
        let article = index
            .articles
            .iter()
            .find(|a| a.id == article_id)
            .ok_or_else(|| "Article not found".to_string())?;
        (st.articles_dir.join(&article.pdf_filename), st.data_dir.clone())
    };
    if !pdf_path.exists() {
        return Err("PDF file not found".into());
    }

    match panic::catch_unwind(panic::AssertUnwindSafe(|| pdf_extract::extract_text(&pdf_path))) {
        Ok(Ok(text)) => {
            let prefix: String = text.chars().take(10000).collect();
            Ok(prefix)
        }
        Ok(Err(e)) => {
            let msg = format!("Failed to extract front text from PDF '{}': {:?}", pdf_path.display(), e);
            write_crash_log(&data_dir, &msg);
            Err(msg)
        }
        Err(_) => {
            let msg = format!("Panic while extracting front text from PDF '{}'.", pdf_path.display());
            write_crash_log(&data_dir, &msg);
            Err(msg)
        }
    }
}

#[tauri::command]
fn get_article_text_back(
    state: tauri::State<'_, Mutex<AppState>>,
    article_id: String,
) -> Result<String, String> {
    let (pdf_path, data_dir) = {
        let mut st = state.lock().map_err(|e| e.to_string())?;
        let index = load_index(&mut st);
        let article = index
            .articles
            .iter()
            .find(|a| a.id == article_id)
            .ok_or_else(|| "Article not found".to_string())?;
        (st.articles_dir.join(&article.pdf_filename), st.data_dir.clone())
    };
    if !pdf_path.exists() {
        return Err("PDF file not found".into());
    }

    match panic::catch_unwind(panic::AssertUnwindSafe(|| pdf_extract::extract_text(&pdf_path))) {
        Ok(Ok(text)) => {
            let total_chars = text.chars().count();
            let start = total_chars.saturating_sub(15000);
            let suffix: String = text.chars().skip(start).collect();
            Ok(suffix)
        }
        Ok(Err(e)) => {
            let msg = format!("Failed to extract back text from PDF '{}': {:?}", pdf_path.display(), e);
            write_crash_log(&data_dir, &msg);
            Err(msg)
        }
        Err(_) => {
            let msg = format!("Panic while extracting back text from PDF '{}'.", pdf_path.display());
            write_crash_log(&data_dir, &msg);
            Err(msg)
        }
    }
}

#[tauri::command]
fn get_backups(state: tauri::State<'_, Mutex<AppState>>) -> Result<BackupsResponse, String> {
    let st = state.lock().map_err(|e| e.to_string())?;
    let b1 = st.data_dir.join("index.backup1.json");
    let b2 = st.data_dir.join("index.backup2.json");

    let mut backups = Vec::new();

    for (name, path) in [("backup1", b1), ("backup2", b2)] {
        let timestamp = if path.exists() {
            fs::metadata(&path)
                .and_then(|m| m.modified())
                .map(|sys_time| {
                    let dt: DateTime<Utc> = sys_time.into();
                    dt.to_rfc3339()
                })
                .ok()
        } else {
            None
        };
        backups.push(BackupInfo {
            name: name.to_string(),
            timestamp,
        });
    }

    Ok(BackupsResponse { backups })
}

#[tauri::command]
fn restore_backup(
    state: tauri::State<'_, Mutex<AppState>>,
    backup_name: String,
) -> Result<bool, String> {
    let mut st = state.lock().map_err(|e| e.to_string())?;
    let backup_file = match backup_name.as_str() {
        "backup1" => st.data_dir.join("index.backup1.json"),
        "backup2" => st.data_dir.join("index.backup2.json"),
        _ => return Err("Invalid backup name".into()),
    };

    if !backup_file.exists() {
        return Err("Backup file does not exist".into());
    }

    match fs::copy(&backup_file, &st.index_path) {
        Ok(_) => {
            // Force memory reload of index
            st.index = None;
            Ok(true)
        }
        Err(e) => Err(format!("Failed to restore backup: {}", e)),
    }
}

// ── Crash Log ────────────────────────────────────────────────────────────────

fn write_crash_log(data_dir: &Path, message: &str) {
    use std::io::Write;
    let log_path = data_dir.join("crash.log");
    let timestamp = chrono::Utc::now().to_rfc3339();
    let line = format!("[{}] {}\n", timestamp, message);
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = f.write_all(line.as_bytes());
    }
}

#[tauri::command]
fn get_crash_log(state: tauri::State<'_, Mutex<AppState>>) -> String {
    let data_dir = match state.lock() {
        Ok(st) => st.data_dir.clone(),
        Err(e) => return format!("Could not access crash log directory: {}", e),
    };
    let log_path = data_dir.join("crash.log");
    fs::read_to_string(&log_path).unwrap_or_else(|_| "No crash log found.".to_string())
}

// ── App Setup ───────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::Manager;
            let root_dir = if cfg!(debug_assertions) {
                let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                manifest_dir
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| {
                        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                    })
            } else {
                app.path().app_local_data_dir().unwrap_or_else(|_| {
                    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                })
            };

            let app_state = AppState::new(root_dir);
            app_state.ensure_dirs();
            let panic_log_dir = app_state.data_dir.clone();
            let default_hook = panic::take_hook();
            panic::set_hook(Box::new(move |info| {
                let location = info
                    .location()
                    .map(|loc| format!("{}:{}", loc.file(), loc.line()))
                    .unwrap_or_else(|| "unknown location".to_string());
                let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
                    (*s).to_string()
                } else if let Some(s) = info.payload().downcast_ref::<String>() {
                    s.clone()
                } else {
                    "non-string panic payload".to_string()
                };
                let message = format!("PANIC at {}: {}", location, payload);
                write_crash_log(&panic_log_dir, &message);
                default_hook(info);
            }));
            app.manage(Mutex::new(app_state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_articles,
            get_tags,
            reindex,
            save_metadata,
            upload_thumbnail,
            remove_article,
            open_pdf,
            open_file_location,
            open_articles_folder,
            set_demo_mode,
            open_external_url,
            get_thumbnail_url,
            get_root_dir,
            get_storage_report,
            import_pdf,
            import_pdfs_from_paths,
            fetch_doi_metadata,
            get_article_text_front,
            get_article_text_back,
            create_backup,
            get_backups,
            restore_backup,
            get_crash_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
