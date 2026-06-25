# Backup con Google Drive

ROXWANA Product Manager usa Google Drive como puente entre tres copias:

- Copia local de la PC actual.
- Copia sincronizada en la nube de Google Drive.
- Copia local de otra PC con la misma cuenta de Google Drive.

GitHub guarda el codigo de la app. Google Drive guarda los datos reales: base SQLite, productos,
imagenes, fichas, codigos de barra y archivos de impresion.

## Flujo por turnos

El uso esperado no es simultaneo. Una sola persona trabaja por turnos:

1. En la PC donde se hicieron cambios, usar **Subir a Drive**.
2. Esperar que Google Drive termine de sincronizar.
3. En la otra PC, usar **Bajar de Drive**.
4. Trabajar en esa PC.
5. Repetir el proceso en sentido contrario cuando haga falta.

## Arranque en una PC nueva

Si la app se abre en una PC sin productos locales y encuentra un backup de ROXWANA en Google Drive,
restaura automaticamente la base y las carpetas locales dentro de Documentos.

## Proteccion contra sobrescritura vieja

El backup automatico solo sube si la copia local tiene cambios mas nuevos que el ultimo backup de
Drive. Si una PC esta atrasada, no debe subir sola encima de una copia mas nueva: primero hay que usar
**Bajar de Drive**.

## Carpeta esperada

La app busca Google Drive instalado en Windows y guarda el backup en:

`ROXWANA Product Manager Backup/current`

Dentro de esa carpeta mantiene:

- `data/roxwana.db`
- `productos/`
- `manifest.json`
