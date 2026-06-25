use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};

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
struct ProductPackageInput {
    product: Value,
    product_sheet: String,
    web_info: Option<String>,
    images: Vec<PackageImageInput>,
    barcodes: Vec<PackageBarcodeInput>,
    #[serde(default)]
    print_files: Vec<PackagePrintFileInput>,
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
    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
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
        "imagenes/aprobadas",
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

fn decode_data_url(value: &str) -> Result<Vec<u8>, String> {
    let encoded = value
        .split_once(',')
        .map(|(_, content)| content)
        .unwrap_or(value);
    BASE64.decode(encoded).map_err(|error| error.to_string())
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

fn resolve_backup_location(backup_root: Option<String>) -> Result<(Option<PathBuf>, PathBuf), String> {
    if let Some(path) = backup_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let backup_path = PathBuf::from(path);
        return Ok((backup_path.parent().map(Path::to_path_buf), backup_path));
    }
    if let Some(drive_path) = find_google_drive_root() {
        return Ok((Some(drive_path.clone()), drive_path.join(BACKUP_FOLDER_NAME)));
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

fn copy_file_with_summary(source: &Path, destination: &Path, summary: &mut CopySummary) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(source, destination).map_err(|error| error.to_string())?;
    summary.file_count += 1;
    summary.total_bytes += fs::metadata(source).map(|metadata| metadata.len()).unwrap_or(0);
    Ok(())
}

fn copy_dir_all(source: &Path, destination: &Path, summary: &mut CopySummary) -> Result<(), String> {
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
        product_count: manifest.as_ref().map(|item| item.product_count).unwrap_or(0),
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
        let mut product: Value = serde_json::from_str(&product_json).map_err(|error| error.to_string())?;
        if let Some(images) = product.get_mut("images").and_then(Value::as_array_mut) {
            for image in images {
                if let Some(object) = image.as_object_mut() {
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
                    object.insert(
                        "originalPath".to_string(),
                        Value::String(
                            folder
                                .join("imagenes/originales")
                                .join(safe_file_name(&original_name, "imagen-original"))
                                .to_string_lossy()
                                .to_string(),
                        ),
                    );
                    object.insert(
                        "finalPath".to_string(),
                        Value::String(
                            folder
                                .join("imagenes/webp")
                                .join(safe_file_name(&final_filename, "imagen.webp"))
                                .to_string_lossy()
                                .to_string(),
                        ),
                    );
                    object.remove("previewUrl");
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

#[tauri::command]
fn run_backup(
    app: AppHandle,
    backup_root: Option<String>,
    reason: Option<String>,
) -> Result<BackupOperationResult, String> {
    let (drive_path, backup_path) = resolve_backup_location(backup_root)?;
    fs::create_dir_all(&backup_path).map_err(|error| error.to_string())?;

    let current = backup_path.join("current");
    let next = backup_path.join("current.tmp");
    remove_path(&next)?;
    fs::create_dir_all(next.join("data")).map_err(|error| error.to_string())?;

    let db_path = database_path(&app)?;
    let product_root_path = product_root(&app)?;
    let db_connection = connection(&app)?;
    let product_count = db_connection
        .query_row("SELECT COUNT(*) FROM products", [], |row| row.get::<_, i64>(0))
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

#[tauri::command]
fn restore_backup(app: AppHandle, backup_root: Option<String>) -> Result<BackupOperationResult, String> {
    let (drive_path, backup_path) = resolve_backup_location(backup_root)?;
    let current = backup_path.join("current");
    if !manifest_path(&backup_path).exists() {
        return Err("No encontre un backup de ROXWANA en Google Drive.".to_string());
    }

    let backup_db_path = current.join("data").join("roxwana.db");
    if !backup_db_path.exists() {
        return Err("El backup no tiene la base de datos roxwana.db.".to_string());
    }

    let db_path = database_path(&app)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    remove_sqlite_sidecars(&db_path);
    let next_db_path = db_path.with_extension("restore.tmp");
    remove_path(&next_db_path)?;
    fs::copy(&backup_db_path, &next_db_path).map_err(|error| error.to_string())?;
    replace_file(&next_db_path, &db_path)?;
    remove_sqlite_sidecars(&db_path);

    let backup_products = current.join("productos");
    let product_root_path = product_root(&app)?;
    let next_products_path = product_root_path.with_extension("restore.tmp");
    remove_path(&next_products_path)?;
    let mut summary = CopySummary::default();
    copy_dir_all(&backup_products, &next_products_path, &mut summary)?;
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
    let input: ProductInput = serde_json::from_value(product.clone()).map_err(|error| error.to_string())?;
    let folder = product_folder(&app, &input.model_code)?;
    let connection = connection(&app)?;
    let transaction = connection.unchecked_transaction().map_err(|error| error.to_string())?;

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
        .execute("DELETE FROM variants WHERE product_id = ?1", params![input.id])
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
        .execute("DELETE FROM product_images WHERE product_id = ?1", params![input.id])
        .map_err(|error| error.to_string())?;
    for image in input.images {
        transaction
            .execute(
                "INSERT INTO product_images (
                    id, product_id, color_code, image_number, device, role, original_path,
                    final_filename, final_path, is_approved, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', ?9, ?10, ?10)",
                params![
                    image.id,
                    input.id,
                    image.color_code,
                    image.image_number,
                    image.device,
                    image.role,
                    image.original_name,
                    image.final_filename,
                    image.approved as i64,
                    input.updated_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;

    Ok(FolderResult {
        folder_path: folder.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn list_products(app: AppHandle) -> Result<Vec<Value>, String> {
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
    let transaction = connection.unchecked_transaction().map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM ai_messages WHERE product_id = ?1", params![product_id])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM product_images WHERE product_id = ?1", params![product_id])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM variants WHERE product_id = ?1", params![product_id])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM products WHERE id = ?1", params![product_id])
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
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
    let input: ProductInput = serde_json::from_value(product.clone()).map_err(|error| error.to_string())?;
    let folder = product_folder(&app, &input.model_code)?;
    create_folder_structure(&folder)?;
    fs::write(folder.join("ficha/product-sheet.txt"), product_sheet).map_err(|error| error.to_string())?;
    fs::write(
        folder.join("ficha/product.json"),
        serde_json::to_string_pretty(&product).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(FolderResult {
        folder_path: folder.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn write_product_files(
    app: AppHandle,
    product: Value,
    product_sheet: String,
) -> Result<SheetResult, String> {
    let input: ProductInput = serde_json::from_value(product.clone()).map_err(|error| error.to_string())?;
    let folder = product_folder(&app, &input.model_code)?;
    create_folder_structure(&folder)?;
    let sheet_path = folder.join("ficha/product-sheet.txt");
    fs::write(&sheet_path, product_sheet).map_err(|error| error.to_string())?;
    fs::write(
        folder.join("ficha/product.json"),
        serde_json::to_string_pretty(&product).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
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
    })
}

#[tauri::command]
fn save_product_package(app: AppHandle, payload: ProductPackageInput) -> Result<FolderResult, String> {
    let input: ProductInput =
        serde_json::from_value(payload.product.clone()).map_err(|error| error.to_string())?;
    let folder = product_folder(&app, &input.model_code)?;
    create_folder_structure(&folder)?;

    fs::write(folder.join("ficha/product-sheet.txt"), payload.product_sheet)
        .map_err(|error| error.to_string())?;
    if let Some(web_info) = payload.web_info {
        fs::write(folder.join("ficha/info-web.txt"), web_info).map_err(|error| error.to_string())?;
    }
    fs::write(
        folder.join("ficha/product.json"),
        serde_json::to_string_pretty(&payload.product).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    if !input.notes.trim().is_empty() {
        fs::write(folder.join("notas/notas.txt"), input.notes).map_err(|error| error.to_string())?;
    }

    for image in payload.images {
        let original_name = safe_file_name(&image.original_name, &format!("{}-original", image.id));
        let final_name = safe_file_name(&image.final_filename, &format!("{}.webp", image.id));
        let original_path = folder.join("imagenes/originales").join(original_name);
        let webp_path = folder.join("imagenes/webp").join(&final_name);

        if let Some(data_url) = image.original_data_url {
            fs::write(&original_path, decode_data_url(&data_url)?).map_err(|error| error.to_string())?;
        } else if let Some(source_path) = image.original_path {
            let source = PathBuf::from(source_path);
            if source.exists() {
                fs::copy(source, &original_path).map_err(|error| error.to_string())?;
            }
        }

        if let Some(data_url) = image.webp_data_url {
            fs::write(&webp_path, decode_data_url(&data_url)?).map_err(|error| error.to_string())?;
        } else if let Some(source_path) = image.final_path {
            let source = PathBuf::from(source_path);
            if source.exists() {
                fs::copy(source, &webp_path).map_err(|error| error.to_string())?;
            }
        }

        if image.approved && webp_path.exists() {
            fs::copy(&webp_path, folder.join("imagenes/aprobadas").join(final_name))
                .map_err(|error| error.to_string())?;
        }
    }

    for barcode in payload.barcodes {
        let sku = safe_file_name(&barcode.sku, "sku");
        fs::write(folder.join("codigos-barra").join(format!("{sku}.svg")), barcode.svg)
            .map_err(|error| error.to_string())?;
        let png_bytes = decode_data_url(&barcode.png_data_url)?;
        fs::write(folder.join("codigos-barra").join(format!("{sku}.png")), &png_bytes)
            .map_err(|error| error.to_string())?;
        fs::write(folder.join("impresion").join(format!("{sku}.png")), png_bytes)
            .map_err(|error| error.to_string())?;
    }

    save_print_files_to_folder(&folder, payload.print_files)?;

    Ok(FolderResult {
        folder_path: folder.to_string_lossy().to_string(),
    })
}

fn save_print_files_to_folder(
    product_folder: &Path,
    print_files: Vec<PackagePrintFileInput>,
) -> Result<(), String> {
    if print_files.is_empty() {
        return Ok(());
    }
    let folder = product_folder.join("impresion").join("trabajos-para-impresion");
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
fn save_print_files(app: AppHandle, model_code: String, print_files: Vec<PackagePrintFileInput>) -> Result<FolderResult, String> {
    let folder = product_folder(&app, &model_code)?;
    create_folder_structure(&folder)?;
    save_print_files_to_folder(&folder, print_files)?;
    Ok(FolderResult {
        folder_path: folder.join("impresion").join("trabajos-para-impresion").to_string_lossy().to_string(),
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
            language: if language.trim().is_empty() { "auto" } else { &language }.to_string(),
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
        return Err(format!("Whisper no pudo transcribir el audio: {}", stderr.trim()));
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
            save_product_package,
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
