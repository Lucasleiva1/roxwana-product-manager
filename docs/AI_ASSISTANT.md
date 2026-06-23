# Asistente IA

## Comportamiento

El asistente:

1. Recibe la ficha activa, la conversación reciente y todos los productos guardados con sus
   variantes, SKU, stock, textos e imágenes registradas.
2. Su respuesta visible viene del modelo de Ollama, no de una confirmación prefabricada.
3. Puede responder consultas sobre catálogo y también devolver cambios estructurados para la ficha.
4. Extrae únicamente datos dichos o inferibles con alta confianza.
5. No inventa material, stock, proveedor, colección ni técnica.
6. No decide el SKU definitivo: el sistema consulta la base y genera el código único.
7. Permite editar manualmente todos los resultados.

Las instrucciones se guardan localmente y se editan en **Ajustes**.

Cada mensaje del asistente indica si provino de Ollama o de las reglas locales. Las reglas locales
se usan solamente cuando Ollama no responde y la interfaz lo informa explícitamente; nunca deben
presentarse como una respuesta de IA.

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
deterministas para prenda, colores, talles, precio, stock, técnica y estilo. Esta ruta no se mezcla
con una respuesta exitosa del modelo, para evitar que una palabra dentro de un nombre cambie otro
campo por accidente.

En la web local, Vite reenvía `/ollama` a `127.0.0.1:11434` y reemplaza el encabezado `Origin`.
Esto evita que Ollama rechace con HTTP 403 las solicitudes abiertas desde la IP de la red local.
