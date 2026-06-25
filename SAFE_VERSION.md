# Version segura pre-final

Version: v0.2.1-prefinal.1
Fecha: 2026-06-25
Rama: main

Motivo:
- Estado seguro antes de generar el ejecutable para uso local en PC.
- Incluye la imagen automatica para WhatsApp: al guardar un producto, la app crea una copia de la portada con el codigo del modelo escrito abajo.

Archivos clave incluidos:
- src/features/studio/Studio.tsx
- src/services/desktopService.ts
- vite.config.ts
- src-tauri/src/lib.rs

Nota:
- Esta version queda marcada para poder volver atras si una version posterior rompe el flujo de guardado o generacion de imagenes.
