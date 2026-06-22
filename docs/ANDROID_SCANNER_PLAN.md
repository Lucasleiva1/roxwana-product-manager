# Escáner Android — etapa futura

## Objetivo

Escanear un Code 128, recuperar el SKU y mostrar:

- producto e imagen;
- color y talle;
- stock;
- estado;
- acceso a carpeta;
- historial de lecturas.

## Puente local propuesto

```text
Tauri Desktop + SQLite
        │
        ├─ GET /api/products/by-sku/:sku
        ├─ GET /api/products/search?q=
        └─ GET /api/products/:id/images
        │
Android en la misma red Wi‑Fi
```

El servidor LAN debe estar apagado por defecto, mostrar la IP local y usar un token rotativo.
No se usa Supabase en esta etapa.

