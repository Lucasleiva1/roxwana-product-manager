use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};
use tauri::{AppHandle, Manager, WindowEvent};

const MIGRATION: &str = include_str!("../migrations/001_initial.sql");
const BACKUP_FOLDER_NAME: &str = "ROXWANA Product Manager Backup";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseInfo {
    database_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderResult {
    folder_path: String,
    backup_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<PackageImageFileResult>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SheetResult {
    sheet_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BarcodeResult {
    svg_path: String,
    png_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageFileResult {
    original_path: String,
    final_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageImageFileResult {
    id: String,
    original_path: String,
    final_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionResult {
    text: String,
    language: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    app_name: String,
    backup_version: i64,
    created_at: String,
    reason: String,
    source_database_path: String,
    source_product_root: String,
    product_count: i64,
    file_count: u64,
    total_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupStatus {
    available: bool,
    backup_exists: bool,
    drive_path: Option<String>,
    backup_path: Option<String>,
    last_backup_at: Option<String>,
    product_count: i64,
    file_count: u64,
    total_bytes: u64,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupOperationResult {
    status: BackupStatus,
    backed_up: bool,
    restored: bool,
    backup_path: Option<String>,
    message: String,
}

#[derive(Default)]
struct CopySummary {
    file_count: u64,
    total_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VariantInput {
    id: String,
    sku: String,
    color_code: String,
    size_code: String,
    stock: i64,
    barcode_value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageInput {
    id: String,
    color_code: String,
    image_number: i64,
    device: String,
    role: String,
    original_name: String,
    final_filename: String,
    original_path: Option<String>,
    final_path: Option<String>,
    approved: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageImageInput {
    id: String,
    original_name: String,
    final_filename: String,
    approved: bool,
    original_path: Option<String>,
    final_path: Option<String>,
    original_data_url: Option<String>,
    webp_data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageBarcodeInput {
    sku: String,
    svg: String,
    png_data_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageWhatsAppImageInput {
    original_name: String,
    data_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductPackageInput {
    product: Value,
    product_sheet: String,
    web_info: Option<String>,
    images: Vec<PackageImageInput>,
    barcodes: Vec<PackageBarcodeInput>,
    #[serde(default)]
    print_files: Vec<PackagePrintFileInput>,
    whatsapp_image: Option<PackageWhatsAppImageInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackagePrintFileInput {
    id: String,
    original_name: String,
    data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductInput {
    id: String,
    model_code: String,
    garment_type: String,
    model_prefix: String,
    model_number: i64,
    model_raw: String,
    name: String,
    slug: String,
    gender: String,
    category: String,
    collection_drop: String,
    price: i64,
    previous_price: Option<i64>,
    status: String,
    highlighted: bool,
    sort_order: i64,
    technique: String,
    material: String,
    short_description: String,
    long_description: String,
    whatsapp_text: String,
    notes: String,
    variants: Vec<VariantInput>,
    images: Vec<ImageInput>,
    created_at: String,
    updated_at: String,
}

fn data_root(app: &AppHandle) -> Result<PathBuf, String> {
    let current = std::env::current_dir().map_err(|error| error.to_string())?;
    if current.join("package.json").exists() {
        return Ok(current);
    }
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = data_root(app)?.join("data");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path.join("roxwana.db"))
}

fn connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch(MIGRATION)
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn product_folder(app: &AppHandle, model_code: &str) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join("ROXWANA Product Manager")
        .join("productos")
        .join(safe_file_name(model_code, "producto-sin-codigo")))
}

fn product_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join("ROXWANA Product Manager")
        .join("productos"))
}

fn create_folder_structure(folder: &Path) -> Result<(), String> {
    for relative in [
        "ficha",
        "imagenes/originales",
        "imagenes/webp",
        "imagenes/portada",
        "imagenes/aprobadas",
        "imagenes/whatsapp",
        "estampas",
        "mockups",
        "codigos-barra",
        "impresion",
        "impresion/trabajos-para-impresion",
        "notas",
    ] {
        fs::create_dir_all(folder.join(relative)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn safe_file_name(value: &str, fallback: &str) -> String {
    let raw = Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(fallback);
    let clean: String = raw
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect();
    let trimmed = clean.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn image_file_match_score(
    filename: &str,
    image_number: Option<i64>,
    color_code: Option<&str>,
    device: Option<&str>,
    role: Option<&str>,
) -> i32 {
    let lower = filename.to_lowercase();
    let mut score = 0;
    if let Some(role) = role {
        let role = role.to_lowercase();
        if role.contains("portada") {
            score += 12;
        }
    }
    if lower.contains("portada") || lower.contains("cover") || lower.contains("frente") {
        score += 10;
    }
    if let Some(number) = image_number {
        let padded = format!("{number:02}");
        if lower.contains(&format!("-{padded}-")) || lower.starts_with(&format!("{padded}-")) {
            score += 8;
        }
    }
    if let Some(color) = color_code {
        let color = color.to_lowercase();
        if !color.is_empty() && (lower.starts_with(&color) || lower.contains(&format!("-{color}-")))
        {
            score += 4;
        }
    }
    if let Some(device) = device {
        let device = device.to_lowercase();
        if !device.is_empty() && lower.contains(&device) {
            score += 2;
        }
    }
    score
}

fn image_folder_score(path: &Path) -> i32 {
    let text = path.to_string_lossy().replace('\\', "/").to_lowercase();
    if text.contains("/imagenes/portada/") {
        return 80;
    }
    if text.contains("/imagenes/webp/") {
        return 70;
    }
    if text.contains("/imagenes/aprobadas/") {
        return 60;
    }
    if text.contains("/imagenes/originales/") {
        return 50;
    }
    if text.contains("/imagenes/whatsapp/") {
        return 30;
    }
    if text.contains("/imagenes/") {
        return 10;
    }
    0
}

fn is_product_display_image_candidate(path: &Path) -> bool {
    let text = path.to_string_lossy().replace('\\', "/").to_lowercase();
    is_supported_image_file(path)
        && text.contains("/imagenes/")
        && !text.contains("/codigos-barra/")
        && !text.contains("/impresion/")
        && !text.contains("/ficha/")
        && !text.contains("/notas/")
}

fn collect_image_candidates(folder: &Path, candidates: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_image_candidates(&path, candidates);
            } else if is_product_display_image_candidate(&path) {
                candidates.push(path);
            }
        }
    }
}

fn best_image_candidate(
    root: &Path,
    image_number: Option<i64>,
    color_code: Option<&str>,
    device: Option<&str>,
    role: Option<&str>,
) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    collect_image_candidates(root, &mut candidates);
    candidates
        .into_iter()
        .filter_map(|path| {
            let filename = path.file_name().and_then(|name| name.to_str())?;
            let matched_score = image_file_match_score(filename, image_number, color_code, device, role);
            let score = image_folder_score(&path) + if matched_score > 0 { matched_score } else { 1 };
            Some((score, path))
        })
        .max_by(|(score_a, path_a), (score_b, path_b)| {
            score_a
                .cmp(score_b)
                .then_with(|| path_b.to_string_lossy().cmp(&path_a.to_string_lossy()))
        })
        .map(|(_, path)| path)
}

fn is_supported_image_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_lowercase)
            .as_deref(),
        Some("webp" | "png" | "jpg" | "jpeg" | "avif")
    )
}

fn resolve_restored_image_path(
    folder: &Path,
    preferred_name: &str,
    fallback_name: &str,
    image_number: Option<i64>,
    color_code: Option<&str>,
    device: Option<&str>,
) -> PathBuf {
    let safe_preferred = safe_file_name(preferred_name, fallback_name);
    let preferred_path = folder.join(&safe_preferred);
    if preferred_path.exists() {
        return preferred_path;
    }

    let mut best: Option<(i32, PathBuf)> = None;
    if let Ok(entries) = fs::read_dir(folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if !is_supported_image_file(&path) {
                continue;
            }
            let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let score = image_file_match_score(filename, image_number, color_code, device, None);
            let score = if score > 0 { score } else { 1 };
            if best
                .as_ref()
                .map_or(true, |(best_score, _)| score > *best_score)
            {
                best = Some((score, path));
            }
        }
    }

    best.map(|(_, path)| path).unwrap_or(preferred_path)
}

fn resolve_restored_display_image_path(
    product_folder: &Path,
    preferred_final_name: &str,
    original_name: &str,
    image_number: Option<i64>,
    color_code: Option<&str>,
    device: Option<&str>,
    role: Option<&str>,
) -> PathBuf {
    let image_folders = [
        product_folder.join("imagenes/portada"),
        product_folder.join("imagenes/webp"),
        product_folder.join("imagenes/aprobadas"),
        product_folder.join("imagenes/originales"),
        product_folder.join("imagenes/whatsapp"),
    ];
    for preferred_name in [preferred_final_name, original_name] {
        for folder in &image_folders {
            let path = folder.join(safe_file_name(preferred_name, "imagen"));
            if path.exists() && is_supported_image_file(&path) {
                return path;
            }
        }
    }

    let mut best: Option<(i32, PathBuf)> = None;
    for (folder_index, folder) in image_folders.iter().enumerate() {
        let folder_priority = match folder_index {
            0 => 6,
            1 => 5,
            2 => 4,
            3 => 3,
            _ => 1,
        };
        if let Ok(entries) = fs::read_dir(folder) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() || !is_supported_image_file(&path) {
                    continue;
                }
                let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };
                let matched_score =
                    image_file_match_score(filename, image_number, color_code, device, role);
                let score = if matched_score > 0 { matched_score } else { 1 } + folder_priority;
                if best
                    .as_ref()
                    .map_or(true, |(best_score, _)| score > *best_score)
                {
                    best = Some((score, path));
                }
            }
        }
    }

    best
        .map(|(_, path)| path)
        .or_else(|| best_image_candidate(product_folder, image_number, color_code, device, role))
        .unwrap_or_else(|| {
        product_folder
            .join("imagenes/webp")
            .join(safe_file_name(preferred_final_name, "imagen.webp"))
        })
}

fn ensure_cover_image_path(
    product_folder: &Path,
    model_code: &str,
    source: &Path,
) -> Result<PathBuf, String> {
    if !source.exists() || !is_supported_image_file(source) {
        return Ok(source.to_path_buf());
    }
    let portada_folder = product_folder.join("imagenes/portada");
    fs::create_dir_all(&portada_folder).map_err(|error| error.to_string())?;
    if source.starts_with(&portada_folder) {
        return Ok(source.to_path_buf());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("webp")
        .to_lowercase();
    let target = portada_folder.join(safe_file_name(
        &format!("{model_code}-portada.{extension}"),
        "portada.webp",
    ));
    fs::copy(source, &target).map_err(|error| {
        format!(
            "No pude preparar la imagen de portada '{}': {}",
            source.to_string_lossy(),
            error
        )
    })?;
    Ok(target)
}

fn decode_data_url(value: &str) -> Result<Vec<u8>, String> {
    let encoded = value
        .split_once(',')
        .map(|(_, content)| content)
        .unwrap_or(value);
    BASE64.decode(encoded).map_err(|error| error.to_string())
}

fn open_folder_with_explorer(folder: &Path) -> Result<(), String> {
    if !folder.exists() {
        return Err(format!(
            "La carpeta no existe: {}",
            folder.to_string_lossy()
        ));
    }
    Command::new("explorer.exe")
        .arg(folder)
        .spawn()
        .map_err(|error| {
            format!(
                "No pude abrir la carpeta '{}': {}",
                folder.to_string_lossy(),
                error
            )
        })?;
    Ok(())
}

fn parse_http_endpoint(endpoint: &str) -> Result<(String, u16, String), String> {
    let trimmed = endpoint.trim().trim_end_matches('/');
    let without_scheme = trimmed.strip_prefix("http://").ok_or_else(|| {
        "Ollama local debe usar una direccion http://, por ejemplo http://localhost:11434."
            .to_string()
    })?;
    let (host_port, base_path) = without_scheme
        .split_once('/')
        .map(|(host, path)| (host, format!("/{path}")))
        .unwrap_or((without_scheme, String::new()));
    let (host, port) = if let Some((host, port)) = host_port.rsplit_once(':') {
        let parsed_port = port
            .parse::<u16>()
            .map_err(|_| format!("Puerto de Ollama invalido: {port}"))?;
        (host.to_string(), parsed_port)
    } else {
        (host_port.to_string(), 80)
    };
    if host.trim().is_empty() {
        return Err("Falta el host de Ollama.".to_string());
    }
    let host = if host.eq_ignore_ascii_case("localhost") {
        "127.0.0.1".to_string()
    } else {
        host
    };
    Ok((host, port, base_path))
}

fn combine_http_path(base_path: &str, request_path: &str) -> String {
    let request = if request_path.starts_with('/') {
        request_path.to_string()
    } else {
        format!("/{request_path}")
    };
    if base_path.is_empty() || base_path == "/" {
        request
    } else {
        format!("{}{}", base_path.trim_end_matches('/'), request)
    }
}

fn find_header_end(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn decode_chunked_body(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut index = 0;
    let mut decoded = Vec::new();
    loop {
        let size_end = bytes[index..]
            .windows(2)
            .position(|window| window == b"\r\n")
            .map(|position| index + position)
            .ok_or_else(|| "Respuesta chunked incompleta de Ollama.".to_string())?;
        let size_line = String::from_utf8_lossy(&bytes[index..size_end]);
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_hex, 16)
            .map_err(|_| format!("Tamano chunked invalido de Ollama: {size_hex}"))?;
        index = size_end + 2;
        if size == 0 {
            break;
        }
        if index + size > bytes.len() {
            return Err("Respuesta chunked truncada de Ollama.".to_string());
        }
        decoded.extend_from_slice(&bytes[index..index + size]);
        index += size;
        if bytes.get(index..index + 2) == Some(b"\r\n") {
            index += 2;
        }
    }
    Ok(decoded)
}

fn request_ollama_json(
    endpoint: &str,
    request_path: &str,
    method: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let (host, port, base_path) = parse_http_endpoint(endpoint)?;
    let path = combine_http_path(&base_path, request_path);
    let method = method.trim().to_uppercase();
    if method != "GET" && method != "POST" {
        return Err(format!("Metodo no soportado para Ollama: {method}"));
    }

    let body_bytes = match body {
        Some(value) if !value.is_null() => {
            serde_json::to_vec(&value).map_err(|error| error.to_string())?
        }
        _ => Vec::new(),
    };
    let mut request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {host}:{port}\r\nAccept: application/json\r\nConnection: close\r\n"
    )
    .into_bytes();
    if method == "POST" {
        request.extend_from_slice(
            format!(
                "Content-Type: application/json\r\nContent-Length: {}\r\n",
                body_bytes.len()
            )
            .as_bytes(),
        );
    }
    request.extend_from_slice(b"\r\n");
    request.extend_from_slice(&body_bytes);

    let mut stream = TcpStream::connect((host.as_str(), port))
        .map_err(|error| format!("No pude conectar con Ollama en {host}:{port}: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(180)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| error.to_string())?;
    stream
        .write_all(&request)
        .map_err(|error| error.to_string())?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| error.to_string())?;
    let header_end = find_header_end(&response)
        .ok_or_else(|| "Respuesta HTTP invalida de Ollama.".to_string())?;
    let headers = String::from_utf8_lossy(&response[..header_end]);
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|status| status.parse::<u16>().ok())
        .ok_or_else(|| "No pude leer el estado HTTP de Ollama.".to_string())?;
    let mut body_bytes = response[header_end + 4..].to_vec();
    if headers
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        body_bytes = decode_chunked_body(&body_bytes)?;
    }
    if !(200..300).contains(&status) {
        let text = String::from_utf8_lossy(&body_bytes);
        return Err(format!("Ollama respondio {status}: {}", text.trim()));
    }
    if body_bytes.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(&body_bytes).map_err(|error| {
        format!(
            "Ollama respondio, pero no pude leer JSON: {}. Respuesta: {}",
            error,
            String::from_utf8_lossy(&body_bytes).trim()
        )
    })
}

fn is_existing_dir(path: &Path) -> bool {
    path.exists() && path.is_dir()
}

fn find_google_drive_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let home = PathBuf::from(user_profile);
        candidates.push(home.join("Google Drive"));
        candidates.push(home.join("My Drive"));
        candidates.push(home.join("Mi unidad"));
        candidates.push(home.join("Google Drive").join("My Drive"));
        candidates.push(home.join("Google Drive").join("Mi unidad"));
    }
    if let Ok(home_drive) = std::env::var("HOMEDRIVE") {
        for label in ["My Drive", "Mi unidad", "Google Drive"] {
            candidates.push(PathBuf::from(format!("{home_drive}\\{label}")));
        }
    }
    for letter in b'D'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        for label in ["My Drive", "Mi unidad", "Google Drive"] {
            candidates.push(PathBuf::from(&root).join(label));
        }
    }
    candidates.into_iter().find(|path| is_existing_dir(path))
}

fn resolve_backup_location(
    backup_root: Option<String>,
) -> Result<(Option<PathBuf>, PathBuf), String> {
    if let Some(path) = backup_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let backup_path = PathBuf::from(path);
        return Ok((backup_path.parent().map(Path::to_path_buf), backup_path));
    }
    if let Some(drive_path) = find_google_drive_root() {
        return Ok((
            Some(drive_path.clone()),
            drive_path.join(BACKUP_FOLDER_NAME),
        ));
    }
    Err("No pude detectar Google Drive en esta PC. Abrilo una vez o configura una carpeta de backup.".to_string())
}

fn remove_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
}

fn replace_directory(next: &Path, current: &Path) -> Result<(), String> {
    let previous = current.with_extension("previous");
    remove_path(&previous)?;
    if current.exists() {
        fs::rename(current, &previous).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(next, current) {
        if previous.exists() {
            let _ = fs::rename(&previous, current);
        }
        return Err(error.to_string());
    }
    remove_path(&previous)?;
    Ok(())
}

fn replace_file(next: &Path, current: &Path) -> Result<(), String> {
    let previous = current.with_extension("previous");
    remove_path(&previous)?;
    if current.exists() {
        fs::rename(current, &previous).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(next, current) {
        if previous.exists() {
            let _ = fs::rename(&previous, current);
        }
        return Err(error.to_string());
    }
    remove_path(&previous)?;
    Ok(())
}

fn copy_file_with_summary(
    source: &Path,
    destination: &Path,
    summary: &mut CopySummary,
) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(source, destination).map_err(|error| error.to_string())?;
    summary.file_count += 1;
    summary.total_bytes += fs::metadata(source)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    Ok(())
}

fn copy_dir_all(
    source: &Path,
    destination: &Path,
    summary: &mut CopySummary,
) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    if !source.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let destination_path = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &destination_path, summary)?;
        } else if file_type.is_file() {
            copy_file_with_summary(&entry.path(), &destination_path, summary)?;
        }
    }
    Ok(())
}

fn manifest_path(backup_path: &Path) -> PathBuf {
    backup_path.join("current").join("manifest.json")
}

fn read_backup_manifest(backup_path: &Path) -> Option<BackupManifest> {
    let content = fs::read_to_string(manifest_path(backup_path)).ok()?;
    serde_json::from_str(&content).ok()
}

fn backup_status_for_location(drive_path: Option<PathBuf>, backup_path: PathBuf) -> BackupStatus {
    let manifest = read_backup_manifest(&backup_path);
    BackupStatus {
        available: true,
        backup_exists: manifest.is_some(),
        drive_path: drive_path.map(|path| path.to_string_lossy().to_string()),
        backup_path: Some(backup_path.to_string_lossy().to_string()),
        last_backup_at: manifest.as_ref().map(|item| item.created_at.clone()),
        product_count: manifest
            .as_ref()
            .map(|item| item.product_count)
            .unwrap_or(0),
        file_count: manifest.as_ref().map(|item| item.file_count).unwrap_or(0),
        total_bytes: manifest.as_ref().map(|item| item.total_bytes).unwrap_or(0),
        message: if manifest.is_some() {
            "Backup disponible en Google Drive.".to_string()
        } else {
            "Google Drive detectado, todavia no hay backup de ROXWANA.".to_string()
        },
    }
}

fn sqlite_sidecar_paths(path: &Path) -> Vec<PathBuf> {
    let raw = path.to_string_lossy();
    vec![
        PathBuf::from(format!("{raw}-wal")),
        PathBuf::from(format!("{raw}-shm")),
    ]
}

fn remove_sqlite_sidecars(path: &Path) {
    for sidecar in sqlite_sidecar_paths(path) {
        let _ = remove_path(&sidecar);
    }
}

fn normalize_restored_database_paths(app: &AppHandle) -> Result<(), String> {
    let connection = connection(app)?;
    let products: Vec<(String, String, String)> = {
        let mut statement = connection
            .prepare("SELECT id, model_code, product_json FROM products")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };

    for (id, model_code, product_json) in products {
        let folder = product_folder(app, &model_code)?;
        let mut product: Value =
            serde_json::from_str(&product_json).map_err(|error| error.to_string())?;
        let default_color_code = product
            .get("colors")
            .and_then(Value::as_array)
            .and_then(|colors| colors.first())
            .and_then(Value::as_str)
            .unwrap_or("NEG")
            .to_string();
        let mut image_records: Vec<(String, String, String)> = Vec::new();
        let mut has_display_image = false;
        if let Some(images) = product.get_mut("images").and_then(Value::as_array_mut) {
            for image in images {
                if let Some(object) = image.as_object_mut() {
                    let image_id = object
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let image_number = object.get("imageNumber").and_then(Value::as_i64);
                    let color_code = object
                        .get("colorCode")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    let device = object
                        .get("device")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    let role = object
                        .get("role")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    let original_name = object
                        .get("originalName")
                        .and_then(Value::as_str)
                        .unwrap_or("imagen-original")
                        .to_string();
                    let final_filename = object
                        .get("finalFilename")
                        .and_then(Value::as_str)
                        .unwrap_or("imagen.webp")
                        .to_string();
                    let original_path = resolve_restored_image_path(
                        &folder.join("imagenes/originales"),
                        &original_name,
                        "imagen-original",
                        image_number,
                        color_code.as_deref(),
                        device.as_deref(),
                    );
                    let final_path = resolve_restored_display_image_path(
                        &folder,
                        &final_filename,
                        &original_name,
                        image_number,
                        color_code.as_deref(),
                        device.as_deref(),
                        role.as_deref(),
                    );
                    let is_cover = image_number == Some(1)
                        || role
                            .as_deref()
                            .map(|value| value.eq_ignore_ascii_case("portada"))
                            .unwrap_or(false);
                    let final_path = if is_cover {
                        ensure_cover_image_path(&folder, &model_code, &final_path)?
                    } else {
                        final_path
                    };
                    let original_path_text = original_path.to_string_lossy().to_string();
                    let final_path_text = final_path.to_string_lossy().to_string();
                    if final_path.exists() {
                        has_display_image = true;
                    }
                    if let Some(filename) = final_path.file_name().and_then(|name| name.to_str()) {
                        object.insert(
                            "finalFilename".to_string(),
                            Value::String(filename.to_string()),
                        );
                    }
                    object.insert(
                        "originalPath".to_string(),
                        Value::String(original_path_text.clone()),
                    );
                    object.insert(
                        "finalPath".to_string(),
                        Value::String(final_path_text.clone()),
                    );
                    object.remove("previewUrl");
                    if !image_id.is_empty() {
                        image_records.push((image_id, original_path_text, final_path_text));
                    }
                }
            }
        }
        if !has_display_image {
            if let Some(candidate) =
                best_image_candidate(&folder, Some(1), None, Some("desktop"), Some("portada"))
            {
                let cover_path = ensure_cover_image_path(&folder, &model_code, &candidate)?;
                if cover_path.exists() {
                    let filename = cover_path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("portada.webp")
                        .to_string();
                    let cover_path_text = cover_path.to_string_lossy().to_string();
                    let image_id = format!(
                        "image-{}-portada",
                        safe_file_name(&model_code, "producto").to_lowercase()
                    );
                    let cover_image = serde_json::json!({
                        "id": image_id,
                        "colorCode": default_color_code,
                        "imageNumber": 1,
                        "device": "desktop",
                        "role": "portada",
                        "originalName": filename,
                        "originalPath": cover_path_text,
                        "finalFilename": filename,
                        "finalPath": cover_path_text,
                        "approved": true
                    });
                    let object = product
                        .as_object_mut()
                        .ok_or_else(|| "Producto invalido en la base.".to_string())?;
                    let images = object
                        .entry("images".to_string())
                        .or_insert_with(|| Value::Array(Vec::new()));
                    if !images.is_array() {
                        *images = Value::Array(Vec::new());
                    }
                    if let Some(images) = images.as_array_mut() {
                        images.insert(0, cover_image);
                    }
                }
            }
        }

        connection
            .execute(
                "UPDATE products SET product_folder_path = ?1, product_json = ?2 WHERE id = ?3",
                params![
                    folder.to_string_lossy().to_string(),
                    serde_json::to_string(&product).map_err(|error| error.to_string())?,
                    id,
                ],
            )
            .map_err(|error| error.to_string())?;
        for (image_id, original_path, final_path) in image_records {
            connection
                .execute(
                    "UPDATE product_images SET original_path = ?1, final_path = ?2 WHERE id = ?3",
                    params![original_path, final_path, image_id],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn initialize_database(app: AppHandle) -> Result<DatabaseInfo, String> {
    connection(&app)?;
    let path = database_path(&app)?;
    fs::create_dir_all(
        app.path()
            .document_dir()
            .map_err(|error| error.to_string())?
            .join("ROXWANA Product Manager")
            .join("productos"),
    )
    .map_err(|error| error.to_string())?;
    normalize_restored_database_paths(&app)?;
    Ok(DatabaseInfo {
        database_path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn backup_status(backup_root: Option<String>) -> Result<BackupStatus, String> {
    match resolve_backup_location(backup_root) {
        Ok((drive_path, backup_path)) => Ok(backup_status_for_location(drive_path, backup_path)),
        Err(message) => Ok(BackupStatus {
            available: false,
            backup_exists: false,
            drive_path: None,
            backup_path: None,
            last_backup_at: None,
            product_count: 0,
            file_count: 0,
            total_bytes: 0,
            message,
        }),
    }
}

fn run_backup_operation(
    app: &AppHandle,
    backup_root: Option<String>,
    reason: Option<String>,
) -> Result<BackupOperationResult, String> {
    let (drive_path, backup_path) = resolve_backup_location(backup_root)?;
    fs::create_dir_all(&backup_path).map_err(|error| error.to_string())?;

    let current = backup_path.join("current");
    let next = backup_path.join("current.tmp");
    remove_path(&next)?;
    fs::create_dir_all(next.join("data")).map_err(|error| error.to_string())?;

    let db_path = database_path(app)?;
    let product_root_path = product_root(app)?;
    let db_connection = connection(app)?;
    let product_count = db_connection
        .query_row("SELECT COUNT(*) FROM products", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())?;
    let backup_db_path = next.join("data").join("roxwana.db");
    let backup_db_arg = backup_db_path.to_string_lossy().to_string();
    db_connection
        .execute("VACUUM INTO ?1", params![backup_db_arg])
        .map_err(|error| error.to_string())?;
    drop(db_connection);

    let mut summary = CopySummary::default();
    if let Ok(metadata) = fs::metadata(&backup_db_path) {
        summary.file_count += 1;
        summary.total_bytes += metadata.len();
    }
    copy_dir_all(&product_root_path, &next.join("productos"), &mut summary)?;

    let manifest = BackupManifest {
        app_name: "ROXWANA Product Manager".to_string(),
        backup_version: 1,
        created_at: chrono::Utc::now().to_rfc3339(),
        reason: reason.unwrap_or_else(|| "manual".to_string()),
        source_database_path: db_path.to_string_lossy().to_string(),
        source_product_root: product_root_path.to_string_lossy().to_string(),
        product_count,
        file_count: summary.file_count,
        total_bytes: summary.total_bytes,
    };
    fs::write(
        next.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    replace_directory(&next, &current)?;
    let status = backup_status_for_location(drive_path, backup_path.clone());
    Ok(BackupOperationResult {
        status,
        backed_up: true,
        restored: false,
        backup_path: Some(backup_path.to_string_lossy().to_string()),
        message: "Backup guardado en Google Drive.".to_string(),
    })
}

fn run_required_save_backup(app: &AppHandle, reason: &str) -> Option<String> {
    run_backup_operation(app, None, Some(reason.to_string()))
        .err()
        .map(|error| {
            let message = format!(
                "El cambio se guardo localmente, pero no pude subir el backup automatico a Drive: {error}"
            );
            eprintln!("{message}");
            message
        })
}

#[tauri::command]
fn run_backup(
    app: AppHandle,
    backup_root: Option<String>,
    reason: Option<String>,
) -> Result<BackupOperationResult, String> {
    run_backup_operation(&app, backup_root, reason)
}

#[tauri::command]
fn restore_backup(
    app: AppHandle,
    backup_root: Option<String>,
) -> Result<BackupOperationResult, String> {
    let (drive_path, backup_path) = resolve_backup_location(backup_root)?;
    let current = backup_path.join("current");
    let manifest = read_backup_manifest(&backup_path)
        .ok_or_else(|| "No encontre un backup de ROXWANA en Google Drive.".to_string())?;
    if !manifest_path(&backup_path).exists() {
        return Err("No encontre un backup de ROXWANA en Google Drive.".to_string());
    }

    let backup_db_path = current.join("data").join("roxwana.db");
    if !backup_db_path.exists() {
        return Err("El backup no tiene la base de datos roxwana.db.".to_string());
    }
    let backup_products = current.join("productos");
    if !backup_products.exists() {
        return Err(
            "El backup de Drive todavia no tiene la carpeta productos. Espera a que Google Drive termine de sincronizar."
                .to_string(),
        );
    }

    let db_path = database_path(&app)?;
    let product_root_path = product_root(&app)?;
    let next_db_path = db_path.with_extension("restore.tmp");
    let next_products_path = product_root_path.with_extension("restore.tmp");
    remove_path(&next_db_path)?;
    remove_path(&next_products_path)?;
    fs::copy(&backup_db_path, &next_db_path).map_err(|error| error.to_string())?;

    let mut summary = CopySummary::default();
    copy_dir_all(&backup_products, &next_products_path, &mut summary)?;
    if manifest.product_count > 0 && summary.file_count == 0 {
        remove_path(&next_db_path)?;
        remove_path(&next_products_path)?;
        return Err(
            "Google Drive todavia no termino de descargar las carpetas de productos del backup."
                .to_string(),
        );
    }

    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    remove_sqlite_sidecars(&db_path);
    replace_file(&next_db_path, &db_path)?;
    remove_sqlite_sidecars(&db_path);

    replace_directory(&next_products_path, &product_root_path)?;
    normalize_restored_database_paths(&app)?;

    let status = backup_status_for_location(drive_path, backup_path.clone());
    Ok(BackupOperationResult {
        status,
        backed_up: false,
        restored: true,
        backup_path: Some(backup_path.to_string_lossy().to_string()),
        message: "Backup restaurado desde Google Drive.".to_string(),
    })
}

#[tauri::command]
fn save_product(app: AppHandle, product: Value) -> Result<FolderResult, String> {
    let input: ProductInput =
        serde_json::from_value(product.clone()).map_err(|error| error.to_string())?;
    let folder = product_folder(&app, &input.model_code)?;
    create_folder_structure(&folder)?;
    fs::write(
        folder.join("ficha/product.json"),
        serde_json::to_string_pretty(&product).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    if !input.notes.trim().is_empty() {
        fs::write(folder.join("notas/notas.txt"), &input.notes)
            .map_err(|error| error.to_string())?;
    }
    let connection = connection(&app)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "INSERT INTO products (
                id, model_code, garment_type, model_prefix, model_number, model_raw, name, slug,
                gender, category, collection_drop, price, previous_price, status, highlighted,
                sort_order, technique, material, short_description, long_description, whatsapp_text,
                notes, product_folder_path, product_json, created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26
            )
            ON CONFLICT(id) DO UPDATE SET
                model_code = excluded.model_code,
                garment_type = excluded.garment_type,
                model_prefix = excluded.model_prefix,
                model_number = excluded.model_number,
                model_raw = excluded.model_raw,
                name = excluded.name,
                slug = excluded.slug,
                gender = excluded.gender,
                category = excluded.category,
                collection_drop = excluded.collection_drop,
                price = excluded.price,
                previous_price = excluded.previous_price,
                status = excluded.status,
                highlighted = excluded.highlighted,
                sort_order = excluded.sort_order,
                technique = excluded.technique,
                material = excluded.material,
                short_description = excluded.short_description,
                long_description = excluded.long_description,
                whatsapp_text = excluded.whatsapp_text,
                notes = excluded.notes,
                product_folder_path = excluded.product_folder_path,
                product_json = excluded.product_json,
                updated_at = excluded.updated_at",
            params![
                input.id,
                input.model_code,
                input.garment_type,
                input.model_prefix,
                input.model_number,
                input.model_raw,
                input.name,
                input.slug,
                input.gender,
                input.category,
                input.collection_drop,
                input.price,
                input.previous_price,
                input.status,
                input.highlighted as i64,
                input.sort_order,
                input.technique,
                input.material,
                input.short_description,
                input.long_description,
                input.whatsapp_text,
                input.notes,
                folder.to_string_lossy().to_string(),
                product.to_string(),
                input.created_at,
                input.updated_at,
            ],
        )
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "DELETE FROM variants WHERE product_id = ?1",
            params![input.id],
        )
        .map_err(|error| error.to_string())?;
    for variant in input.variants {
        transaction
            .execute(
                "INSERT INTO variants (
                    id, product_id, sku, color_code, size_code, stock, barcode_value, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                params![
                    variant.id,
                    input.id,
                    variant.sku,
                    variant.color_code,
                    variant.size_code,
                    variant.stock,
                    variant.barcode_value,
                    input.updated_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction
        .execute(
            "DELETE FROM product_images WHERE product_id = ?1",
            params![input.id],
        )
        .map_err(|error| error.to_string())?;
    for image in input.images {
        let original_path = image
            .original_path
            .clone()
            .unwrap_or_else(|| image.original_name.clone());
        let final_path = image.final_path.clone().unwrap_or_default();
        transaction
            .execute(
                "INSERT INTO product_images (
                    id, product_id, color_code, image_number, device, role, original_path,
                    final_filename, final_path, is_approved, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
                params![
                    image.id,
                    input.id,
                    image.color_code,
                    image.image_number,
                    image.device,
                    image.role,
                    original_path,
                    image.final_filename,
                    final_path,
                    image.approved as i64,
                    input.updated_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    let backup_error = run_required_save_backup(&app, &format!("auto-save-product-{}", input.model_code));

    Ok(FolderResult {
        folder_path: folder.to_string_lossy().to_string(),
        backup_error,
        images: None,
    })
}

#[tauri::command]
fn list_products(app: AppHandle) -> Result<Vec<Value>, String> {
    normalize_restored_database_paths(&app)?;
    let connection = connection(&app)?;
    let mut statement = connection
        .prepare("SELECT product_json FROM products ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        let json = row.map_err(|error| error.to_string())?;
        serde_json::from_str(&json).map_err(|error| error.to_string())
    })
    .collect()
}

#[tauri::command]
fn delete_product(app: AppHandle, product_id: String) -> Result<(), String> {
    let connection = connection(&app)?;
    let model_code = connection
        .query_row(
            "SELECT model_code FROM products WHERE id = ?1",
            params![product_id.clone()],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let deleted_model_code = model_code.clone();
    if let Some(model_code) = model_code {
        let root = product_root(&app)?;
        let folder = product_folder(&app, &model_code)?;
        if folder.starts_with(&root) && folder.exists() {
            fs::remove_dir_all(&folder).map_err(|error| {
                format!(
                    "No pude eliminar la carpeta del producto '{}': {}",
                    folder.to_string_lossy(),
                    error
                )
            })?;
        }
    }
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM ai_messages WHERE product_id = ?1",
            params![product_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM product_images WHERE product_id = ?1",
            params![product_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM variants WHERE product_id = ?1",
            params![product_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM products WHERE id = ?1", params![product_id.clone()])
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    let backup_reason = deleted_model_code
        .as_deref()
        .unwrap_or(product_id.as_str());
    let _ = run_required_save_backup(&app, &format!("auto-delete-product-{backup_reason}"));
    Ok(())
}

#[tauri::command]
fn search_products(app: AppHandle, query: String) -> Result<Vec<Value>, String> {
    let connection = connection(&app)?;
    let like = format!("%{}%", query);
    let mut statement = connection
        .prepare(
            "SELECT DISTINCT p.product_json
             FROM products p
             LEFT JOIN variants v ON v.product_id = p.id
             WHERE p.name LIKE ?1
                OR p.model_code LIKE ?1
                OR p.slug LIKE ?1
                OR p.technique LIKE ?1
                OR p.short_description LIKE ?1
                OR v.sku LIKE ?1
                OR v.color_code LIKE ?1
                OR v.size_code LIKE ?1
             ORDER BY p.updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![like], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        let json = row.map_err(|error| error.to_string())?;
        serde_json::from_str(&json).map_err(|error| error.to_string())
    })
    .collect()
}

#[tauri::command]
fn suggest_next_model(app: AppHandle, prefix: String, garment_type: String) -> Result<i64, String> {
    let connection = connection(&app)?;
    let current = connection
        .query_row(
            "SELECT MAX(model_number) FROM products WHERE model_prefix = ?1 AND garment_type = ?2",
            params![prefix, garment_type],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .flatten()
        .unwrap_or(0);
    Ok(current + 1)
}

#[tauri::command]
fn create_product_folder(
    app: AppHandle,
    product: Value,
    product_sheet: String,
) -> Result<FolderResult, String> {
    let input: ProductInput =
        serde_json::from_value(product.clone()).map_err(|error| error.to_string())?;
    let folder = product_folder(&app, &input.model_code)?;
    create_folder_structure(&folder)?;
    fs::write(folder.join("ficha/product-sheet.txt"), product_sheet)
        .map_err(|error| error.to_string())?;
    fs::write(
        folder.join("ficha/product.json"),
        serde_json::to_string_pretty(&product).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(FolderResult {
        folder_path: folder.to_string_lossy().to_string(),
        backup_error: None,
        images: None,
    })
}

#[tauri::command]
fn write_product_files(
    app: AppHandle,
    product: Value,
    product_sheet: String,
) -> Result<SheetResult, String> {
    let input: ProductInput =
        serde_json::from_value(product.clone()).map_err(|error| error.to_string())?;
    let folder = product_folder(&app, &input.model_code)?;
    create_folder_structure(&folder)?;
    let sheet_path = folder.join("ficha/product-sheet.txt");
    fs::write(&sheet_path, product_sheet).map_err(|error| error.to_string())?;
    fs::write(
        folder.join("ficha/product.json"),
        serde_json::to_string_pretty(&product).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    let _ = run_required_save_backup(&app, &format!("auto-save-files-{}", input.model_code));
    Ok(SheetResult {
        sheet_path: sheet_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn save_barcode_files(
    app: AppHandle,
    model_code: String,
    sku: String,
    svg: String,
    png_data_url: String,
) -> Result<BarcodeResult, String> {
    let folder = product_folder(&app, &model_code)?.join("codigos-barra");
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let svg_path = folder.join(format!("{sku}.svg"));
    let png_path = folder.join(format!("{sku}.png"));
    fs::write(&svg_path, svg).map_err(|error| error.to_string())?;
    let encoded = png_data_url
        .split_once(',')
        .map(|(_, value)| value)
        .unwrap_or(&png_data_url);
    let bytes = BASE64.decode(encoded).map_err(|error| error.to_string())?;
    fs::write(&png_path, bytes).map_err(|error| error.to_string())?;
    Ok(BarcodeResult {
        svg_path: svg_path.to_string_lossy().to_string(),
        png_path: png_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn save_product_image(
    app: AppHandle,
    model_code: String,
    original_name: String,
    final_filename: String,
    original_bytes: Vec<u8>,
    webp_bytes: Vec<u8>,
) -> Result<ImageFileResult, String> {
    let folder = product_folder(&app, &model_code)?;
    create_folder_structure(&folder)?;
    let safe_original = Path::new(&original_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("imagen-original")
        .to_string();
    let safe_final = Path::new(&final_filename)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("imagen.webp")
        .to_string();
    let original_path = folder.join("imagenes/originales").join(safe_original);
    let final_path = folder.join("imagenes/webp").join(safe_final);
    fs::write(&original_path, original_bytes).map_err(|error| error.to_string())?;
    fs::write(&final_path, webp_bytes).map_err(|error| error.to_string())?;
    Ok(ImageFileResult {
        original_path: original_path.to_string_lossy().to_string(),
        final_path: final_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn product_package_folder(app: AppHandle, model_code: String) -> Result<FolderResult, String> {
    let folder = product_folder(&app, &model_code)?;
    Ok(FolderResult {
        folder_path: folder.to_string_lossy().to_string(),
        backup_error: None,
        images: None,
    })
}

#[tauri::command]
fn open_product_package_folder(app: AppHandle, model_code: String) -> Result<FolderResult, String> {
    let folder = product_folder(&app, &model_code)?;
    create_folder_structure(&folder)?;
    open_folder_with_explorer(&folder)?;
    Ok(FolderResult {
        folder_path: folder.to_string_lossy().to_string(),
        backup_error: None,
        images: None,
    })
}

#[tauri::command]
fn open_folder_path(folder_path: String) -> Result<(), String> {
    open_folder_with_explorer(&PathBuf::from(folder_path))
}

#[tauri::command]
fn ollama_request(
    endpoint: String,
    path: String,
    method: Option<String>,
    body: Option<Value>,
) -> Result<Value, String> {
    request_ollama_json(&endpoint, &path, method.as_deref().unwrap_or("GET"), body)
}

#[tauri::command]
fn restart_app(app: AppHandle) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    Command::new(executable)
        .spawn()
        .map_err(|error| format!("No pude reiniciar ROXWANA: {error}"))?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn save_product_package(
    app: AppHandle,
    payload: ProductPackageInput,
) -> Result<FolderResult, String> {
    let input: ProductInput =
        serde_json::from_value(payload.product.clone()).map_err(|error| error.to_string())?;
    let folder = product_folder(&app, &input.model_code)?;
    create_folder_structure(&folder)?;

    fs::write(
        folder.join("ficha/product-sheet.txt"),
        payload.product_sheet,
    )
    .map_err(|error| error.to_string())?;
    if let Some(web_info) = payload.web_info {
        fs::write(folder.join("ficha/info-web.txt"), web_info)
            .map_err(|error| error.to_string())?;
    }
    fs::write(
        folder.join("ficha/product.json"),
        serde_json::to_string_pretty(&payload.product).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    if !input.notes.trim().is_empty() {
        fs::write(folder.join("notas/notas.txt"), input.notes)
            .map_err(|error| error.to_string())?;
    }

    let mut saved_images: Vec<PackageImageFileResult> = Vec::new();
    for image in payload.images {
        let original_name = safe_file_name(&image.original_name, &format!("{}-original", image.id));
        let final_name = safe_file_name(&image.final_filename, &format!("{}.webp", image.id));
        let original_path = folder.join("imagenes/originales").join(original_name);
        let webp_path = folder.join("imagenes/webp").join(&final_name);

        if let Some(data_url) = image.original_data_url {
            fs::write(&original_path, decode_data_url(&data_url)?)
                .map_err(|error| error.to_string())?;
        } else if let Some(source_path) = image.original_path {
            let source = PathBuf::from(source_path);
            if source.exists() {
                fs::copy(source, &original_path).map_err(|error| error.to_string())?;
            }
        }

        if let Some(data_url) = image.webp_data_url {
            fs::write(&webp_path, decode_data_url(&data_url)?)
                .map_err(|error| error.to_string())?;
        } else if let Some(source_path) = image.final_path {
            let source = PathBuf::from(source_path);
            if source.exists() {
                fs::copy(source, &webp_path).map_err(|error| error.to_string())?;
            }
        }

        if webp_path.exists() {
            saved_images.push(PackageImageFileResult {
                id: image.id.clone(),
                original_path: original_path.to_string_lossy().to_string(),
                final_path: webp_path.to_string_lossy().to_string(),
            });
        }

        if image.approved && webp_path.exists() {
            fs::copy(
                &webp_path,
                folder.join("imagenes/aprobadas").join(&final_name),
            )
            .map_err(|error| error.to_string())?;
        }
    }

    if let Some(image) = payload.whatsapp_image {
        let name = safe_file_name(
            &image.original_name,
            &format!("{}-whatsapp.jpg", input.model_code),
        );
        fs::write(
            folder.join("imagenes").join("whatsapp").join(name),
            decode_data_url(&image.data_url)?,
        )
        .map_err(|error| error.to_string())?;
    }

    for barcode in payload.barcodes {
        let sku = safe_file_name(&barcode.sku, "sku");
        fs::write(
            folder.join("codigos-barra").join(format!("{sku}.svg")),
            barcode.svg,
        )
        .map_err(|error| error.to_string())?;
        let png_bytes = decode_data_url(&barcode.png_data_url)?;
        fs::write(
            folder.join("codigos-barra").join(format!("{sku}.png")),
            &png_bytes,
        )
        .map_err(|error| error.to_string())?;
        fs::write(
            folder.join("impresion").join(format!("{sku}.png")),
            png_bytes,
        )
        .map_err(|error| error.to_string())?;
    }

    save_print_files_to_folder(&folder, payload.print_files)?;

    Ok(FolderResult {
        folder_path: folder.to_string_lossy().to_string(),
        backup_error: None,
        images: Some(saved_images),
    })
}

fn save_print_files_to_folder(
    product_folder: &Path,
    print_files: Vec<PackagePrintFileInput>,
) -> Result<(), String> {
    if print_files.is_empty() {
        return Ok(());
    }
    let folder = product_folder
        .join("impresion")
        .join("trabajos-para-impresion");
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    for file in print_files {
        if let Some(data_url) = file.data_url {
            let fallback = format!("{}-archivo", file.id);
            let name = safe_file_name(&file.original_name, &fallback);
            fs::write(folder.join(name), decode_data_url(&data_url)?)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn save_print_files(
    app: AppHandle,
    model_code: String,
    print_files: Vec<PackagePrintFileInput>,
) -> Result<FolderResult, String> {
    let folder = product_folder(&app, &model_code)?;
    create_folder_structure(&folder)?;
    save_print_files_to_folder(&folder, print_files)?;
    Ok(FolderResult {
        folder_path: folder
            .join("impresion")
            .join("trabajos-para-impresion")
            .to_string_lossy()
            .to_string(),
        backup_error: None,
        images: None,
    })
}

#[tauri::command]
fn transcribe_audio(
    app: AppHandle,
    audio_bytes: Vec<u8>,
    context: String,
    language: String,
) -> Result<TranscriptionResult, String> {
    let average_energy = audio_bytes
        .get(44..)
        .unwrap_or_default()
        .chunks_exact(2)
        .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]).unsigned_abs() as u64)
        .sum::<u64>();
    let sample_count = audio_bytes.get(44..).unwrap_or_default().len() / 2;
    if sample_count == 0 || average_energy / sample_count as u64 <= 180 {
        return Ok(TranscriptionResult {
            text: String::new(),
            language: if language.trim().is_empty() {
                "auto"
            } else {
                &language
            }
            .to_string(),
        });
    }
    let audio_path = std::env::temp_dir().join(format!(
        "roxwana-voice-{}.wav",
        chrono::Utc::now().timestamp_millis()
    ));
    let output_base = std::env::temp_dir().join(format!(
        "roxwana-transcript-{}",
        chrono::Utc::now().timestamp_millis()
    ));
    fs::write(&audio_path, audio_bytes).map_err(|error| error.to_string())?;

    let dev_root = data_root(&app)?
        .join("src-tauri")
        .join("resources")
        .join("whisper")
        .join("windows-x64");
    let whisper_root = if dev_root.exists() {
        dev_root
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("whisper")
    };
    let release_dir = whisper_root.join("Release");
    let executable = release_dir.join("whisper-cli.exe");
    let model = whisper_root.join("ggml-base-q5_1.bin");
    if !executable.exists() || !model.exists() {
        let _ = fs::remove_file(&audio_path);
        return Err("No se encontró el motor Whisper incluido con ROXWANA.".to_string());
    }

    let prompt: String = context
        .chars()
        .rev()
        .take(500)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let selected_language = if language.trim().is_empty() {
        "auto"
    } else {
        language.as_str()
    };
    let output = Command::new(executable)
        .current_dir(&release_dir)
        .arg("-m")
        .arg(&model)
        .arg("-f")
        .arg(&audio_path)
        .arg("-l")
        .arg(selected_language)
        .args(["-otxt", "-nt", "-of"])
        .arg(&output_base)
        .arg("--prompt")
        .arg(prompt)
        .output()
        .map_err(|error| error.to_string());
    let _ = fs::remove_file(&audio_path);
    let output = output?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Whisper no pudo transcribir el audio: {}",
            stderr.trim()
        ));
    }

    let transcript_path = output_base.with_extension("txt");
    let text = fs::read_to_string(&transcript_path).map_err(|error| error.to_string())?;
    let _ = fs::remove_file(transcript_path);
    Ok(TranscriptionResult {
        text: text.trim().to_string(),
        language: selected_language.to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let app = window.app_handle().clone();
                let _ = run_backup_operation(&app, None, Some("auto-exit".to_string()));
            }
        })
        .invoke_handler(tauri::generate_handler![
            initialize_database,
            backup_status,
            run_backup,
            restore_backup,
            save_product,
            list_products,
            delete_product,
            search_products,
            suggest_next_model,
            create_product_folder,
            write_product_files,
            save_product_image,
            save_barcode_files,
            save_print_files,
            product_package_folder,
            open_product_package_folder,
            open_folder_path,
            save_product_package,
            ollama_request,
            restart_app,
            transcribe_audio
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            initialize_database(handle).map_err(std::io::Error::other)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ROXWANA Product Manager");
}
