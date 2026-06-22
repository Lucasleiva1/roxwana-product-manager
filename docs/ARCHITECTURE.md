# Arquitectura

## Capas

```text
React / TypeScript
  ├─ Estudio conversacional y edición manual
  ├─ Zustand: borrador activo, mensajes y ajustes
  ├─ Zod: validaciones de producto
  ├─ JsBarcode: Code 128
  └─ Servicios
       ├─ Ollama HTTP
       └─ Tauri invoke / fallback web

Tauri / Rust
  ├─ SQLite con rusqlite
  ├─ CRUD de productos y variantes
  ├─ creación de carpetas
  ├─ escritura de Product Sheet y JSON
  ├─ guardado de imágenes originales/WebP
  └─ guardado de códigos SVG/PNG
```

## Persistencia

En desarrollo Tauri desde la raíz del proyecto:

```text
data/roxwana.db
product-files/RXW-.../
```

En una aplicación instalada, Tauri usa la carpeta de datos de la aplicación para evitar depender
del directorio de ejecución.

La vista web usa `localStorage`. Es una degradación para demo; SQLite sigue siendo la fuente real
de la aplicación de escritorio.

## Regla de autoridad

- La IA interpreta y redacta.
- La lógica TypeScript normaliza.
- SQLite define números usados y duplicados.
- El sistema genera el SKU final.
- El usuario aprueba antes de exportar.

