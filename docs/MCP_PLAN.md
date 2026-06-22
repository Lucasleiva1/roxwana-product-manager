# Plan MCP

La carpeta `mcp-server/` contiene el contrato inicial. MCP no bloquea la V1.

Herramientas previstas:

- `list_products`
- `get_product_by_sku`
- `search_products`
- `get_product_sheet`
- `validate_product`
- `suggest_next_model_code`
- `list_missing_product_fields`
- `open_product_folder`

La primera implementación debe abrir SQLite en modo lectura por defecto. Cualquier herramienta que
modifique datos o abra rutas debe requerir una acción explícita.

