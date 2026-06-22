# ROXWANA Product Manager

Aplicación local de escritorio para crear productos ROXWANA con un flujo rápido:

`brief natural → datos estructurados → modelo/SKU validados → imágenes → ficha exportable`

La V1 no usa Supabase. Tauri guarda los productos en SQLite y crea carpetas reales en
`product-files/`. En el navegador, la app usa `localStorage` para permitir desarrollo y demo.

## Funciones incluidas

- Asistente conversacional con Ollama y analizador local de respaldo.
- Instrucciones del asistente editables desde Ajustes.
- Código de modelo `RXW-{PRENDA}-{MODELO}`.
- SKU `RXW-{PRENDA}-{MODELO}-{COLOR}-{TALLE}`.
- Matriz de variantes y stock.
- Validación con Zod y validación de duplicados en SQLite.
- Descripciones corta, larga y WhatsApp.
- Imágenes numeradas, conversión WebP y nombres normalizados.
- Código de barras Code 128 con exportación SVG/PNG.
- Búsqueda por producto, modelo, SKU, color, talle y técnica.
- Ficha `ROXWANA Product Sheet v1`.
- Carpetas locales, JSON del producto e historial.
- Estructura futura para MCP y escáner Android.

## Desarrollo

Este proyecto ya incluye Git, Node LTS y Rust portables dentro de `.tools/`. En esta computadora se
puede usar:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 dev
```

O, con herramientas instaladas globalmente:

```powershell
npm install
npm run dev
```

Compilación web y pruebas:

```powershell
npm run build
npm test
```

Aplicación de escritorio:

```powershell
npm run tauri dev
npm run tauri build
```

Antes de compilar Tauri en Windows, completar [docs/SETUP.md](docs/SETUP.md).

## Documentación

- [Instalación](docs/SETUP.md)
- [Lógica de producto](docs/PRODUCT_LOGIC.md)
- [Asistente IA](docs/AI_ASSISTANT.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Plan MCP](docs/MCP_PLAN.md)
- [Plan del escáner Android](docs/ANDROID_SCANNER_PLAN.md)
