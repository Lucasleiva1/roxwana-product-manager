# Asistente IA

## Comportamiento

El asistente:

1. Extrae únicamente datos dichos o inferibles con alta confianza.
2. No inventa material, stock, proveedor, colección ni técnica.
3. Pregunta solamente los datos que faltan.
4. Sugiere nombre y prefijo de diseño.
5. No decide el SKU definitivo.
6. Permite editar todos los resultados manualmente.

Las instrucciones se guardan localmente y se editan en **Ajustes**.

## Ollama

Servicio: `src/services/ollamaService.ts`.

Funciones:

- `checkOllamaStatus`
- `listLocalModels`
- `extractProductFieldsFromNaturalInput`
- `generateProductDescription`
- `reviseSingleField`
- `askMissingQuestions`

Endpoint predeterminado:

```text
http://localhost:11434
```

Modelos configurados en la aplicación:

- `qwen3.5:4b` — principal, local.
- `gemma3:4b` — alternativa local.
- `minimax-m3:cloud` — alternativa mediante la cuenta de Ollama Cloud.

El selector está disponible directamente en el encabezado del Asistente IA y también en Ajustes.

Cuando Ollama está desconectado, `parseNaturalBrief` mantiene el flujo operativo con reglas
deterministas para prenda, colores, talles, precio, stock, técnica y estilo.
