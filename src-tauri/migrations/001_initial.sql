CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  model_code TEXT NOT NULL UNIQUE,
  garment_type TEXT NOT NULL,
  model_prefix TEXT NOT NULL,
  model_number INTEGER NOT NULL,
  model_raw TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  gender TEXT,
  category TEXT,
  collection_drop TEXT,
  price INTEGER,
  previous_price INTEGER,
  status TEXT DEFAULT 'draft',
  highlighted INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  technique TEXT,
  material TEXT,
  short_description TEXT,
  long_description TEXT,
  whatsapp_text TEXT,
  notes TEXT,
  product_folder_path TEXT,
  product_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  color_code TEXT NOT NULL,
  size_code TEXT NOT NULL,
  stock INTEGER DEFAULT 0,
  barcode_value TEXT NOT NULL,
  barcode_svg_path TEXT,
  barcode_png_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  color_code TEXT,
  image_number INTEGER NOT NULL,
  device TEXT DEFAULT 'desktop',
  role TEXT NOT NULL,
  original_path TEXT,
  final_filename TEXT,
  final_path TEXT,
  is_approved INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  structured_json TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  command TEXT,
  args_json TEXT,
  env_json TEXT,
  enabled INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_model_prefix ON products(model_prefix, garment_type, model_number);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_search ON variants(sku, color_code, size_code);
