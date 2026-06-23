# Lógica de producto

## Modelo padre

```text
RXW-{PRENDA}-{MODELO}
```

Ejemplo:

```text
RXW-REM-SRK004
```

El modelo no contiene color ni talle.

## Variante vendible

```text
RXW-{PRENDA}-{MODELO}-{COLOR}-{TALLE}
```

Ejemplo:

```text
RXW-REM-SRK004-NEG-M
```

En la ficha, el orden es siempre:

```text
SKU | TALLE | COLOR | STOCK
```

## Imágenes

| Número | Rol |
|---|---|
| 01 | portada |
| 02 | espalda remera |
| 03 | hover |
| 04 | costado (opcional) |
| 05 | espalda modelo |
| 06+ | detalle |

Nombre final:

```text
{color}-{numero}-{device}.webp
```

Ejemplo:

```text
neg-03-desktop.webp
```

## Exportación

El producto final exige nombre, precio, color, talle, stock y SKU sin duplicados. La falta de
portada es una advertencia: permite generar un borrador, pero debe resolverse antes de publicar.

## Creación progresiva y unicidad

- Una ficha nueva comienza sin tipo, género, técnica, precio, colores, talles ni SKU.
- Al elegir el tipo de producto, la aplicación consulta la base y toma el siguiente número de
  modelo libre para ese tipo y prefijo.
- No se crea ninguna variante hasta tener código de modelo, color y talle.
- Quitar un color o talle elimina inmediatamente del borrador los SKU derivados.
- Eliminar un producto guardado borra sus variantes de la base y libera esos SKU.
- SQLite conserva restricciones `UNIQUE` para `model_code` y `sku` como última barrera.
