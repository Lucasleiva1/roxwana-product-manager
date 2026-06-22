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
    Ok(data_root(app)?.join("product-files").join(model_code))
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
        "notas",
    ] {
        fs::create_dir_all(folder.join(relative)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn initialize_database(app: AppHandle) -> Result<DatabaseInfo, String> {
    connection(&app)?;
    let path = database_path(&app)?;
    fs::create_dir_all(data_root(&app)?.join("product-files")).map_err(|error| error.to_string())?;
    Ok(DatabaseInfo {
        database_path: path.to_string_lossy().to_string(),
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
fn transcribe_audio(
    app: AppHandle,
    audio_bytes: Vec<u8>,
    mime_type: String,
    context: String,
    python_path: String,
    model: String,
    language: String,
) -> Result<TranscriptionResult, String> {
    let extension = if mime_type.contains("ogg") {
        "ogg"
    } else if mime_type.contains("wav") {
        "wav"
    } else if mime_type.contains("mp4") {
        "m4a"
    } else {
        "webm"
    };
    let audio_path = std::env::temp_dir().join(format!(
        "roxwana-voice-{}.{}",
        chrono::Utc::now().timestamp_millis(),
        extension
    ));
    fs::write(&audio_path, audio_bytes).map_err(|error| error.to_string())?;

    let script_path = data_root(&app)?.join("whisper-service").join("transcribe.py");
    if !script_path.exists() {
        let _ = fs::remove_file(&audio_path);
        return Err("No se encontró el servicio local de Whisper.".to_string());
    }

    let python = if python_path.trim().is_empty() {
        "python".to_string()
    } else {
        python_path
    };
    let output = Command::new(python)
        .arg(script_path)
        .arg("--audio")
        .arg(&audio_path)
        .arg("--model")
        .arg(model)
        .arg("--language")
        .arg(language)
        .arg("--prompt")
        .arg(context)
        .output()
        .map_err(|error| error.to_string());
    let _ = fs::remove_file(&audio_path);
    let output = output?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let payload: Value = serde_json::from_str(stdout.trim()).map_err(|_| {
        let stderr = String::from_utf8_lossy(&output.stderr);
        format!("Whisper no devolvió una respuesta válida: {}", stderr.trim())
    })?;
    if !output.status.success() {
        return Err(payload
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Whisper no pudo transcribir el audio.")
            .to_string());
    }
    Ok(TranscriptionResult {
        text: payload
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        language: payload
            .get("language")
            .and_then(Value::as_str)
            .unwrap_or("es")
            .to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            initialize_database,
            save_product,
            list_products,
            search_products,
            suggest_next_model,
            create_product_folder,
            write_product_files,
            save_product_image,
            save_barcode_files,
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
