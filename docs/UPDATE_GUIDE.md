# Guia de actualizaciones de ROXWANA Product Manager

Esta app usa el updater oficial de Tauri con GitHub Releases y un `latest.json` estatico.
La app pregunta antes de instalar. Si el usuario acepta, descarga una build completa, verifica la
firma, instala encima y reinicia.

El procedimiento operativo exacto para publicar cada version esta en
[`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md). Usar ese documento cada vez que haya que guardar
una version en GitHub y dejarla disponible para actualizacion.

## Como funciona el updater

La app instalada no revisa todo GitHub ni interpreta los archivos del repositorio. Solo consulta este
endpoint:

```txt
https://github.com/Lucasleiva1/roxwana-product-manager/releases/latest/download/latest.json
```

Ese archivo `latest.json` dice cual es la version nueva, donde esta el instalador y cual es la firma
que debe verificar Tauri antes de instalar. Si `latest.json` apunta mal, si la firma no coincide o si
el instalador no es publico, la app no puede actualizarse.

El flujo correcto es:

1. La app instalada lee su version actual.
2. Consulta `latest.json` en el ultimo Release de GitHub.
3. Si la version remota es mayor, muestra el aviso dentro de la app.
4. Si el usuario acepta, descarga el instalador indicado en `url`.
5. Verifica esa descarga con el texto de `signature`.
6. Instala encima de la app actual y reinicia.

La actualizacion no debe ser silenciosa. `installMode: "passive"` solo hace que el instalador moleste
menos durante la instalacion, pero la confirmacion propia de la app sigue siendo obligatoria.

## Archivos que intervienen

- `src-tauri/tauri.conf.json`: define la version instalada, la clave publica, el endpoint de update y
  `createUpdaterArtifacts`.
- `package.json`: version de la app para frontend y scripts.
- `src-tauri/Cargo.toml`: version del paquete Rust/Tauri.
- `docs/updater/latest.json`: metadata real que se sube al Release.
- `docs/updater/latest.example.json`: plantilla para preparar el proximo `latest.json`.
- `docs/updater/latest.X.Y.Z.json`: copia historica de lo publicado para una version.
- `src-tauri/target/release/bundle/nsis/*.exe`: instalador Windows generado por Tauri.
- `src-tauri/target/release/bundle/nsis/*.exe.sig`: firma generada para ese instalador.

## Punto importante para la primera version

Las versiones que no tienen updater no pueden actualizarse solas. Primero hay que instalar
manualmente una version que ya incluya updater, por ejemplo `0.2.3`. Desde esa version, las
siguientes actualizaciones pueden llegar desde la app.

## Clave de firma

La clave privada queda fuera del repositorio:

```powershell
C:\Users\jaell\.tauri\roxwana-updater.key
```

No subir esa clave a GitHub. La clave publica ya queda en `src-tauri/tauri.conf.json`.

Si alguna vez hay que regenerar la clave:

```powershell
npm.cmd run tauri signer generate -- --ci -w C:\Users\jaell\.tauri\roxwana-updater.key
```

Si se pierde la clave privada, las instalaciones existentes no podran verificar updates nuevos.

## Publicar una nueva version

Resumen corto. Para el paso a paso completo, usar `docs/RELEASE_PROCESS.md`.

1. Confirmar que el usuario pidio publicar. Si solo pidio cambios, no crear Release todavia.
2. Cambiar la version en `package.json`.
3. Cambiar la version en `src-tauri/tauri.conf.json`.
4. Cambiar la version en `src-tauri/Cargo.toml`.
5. Compilar con la clave privada:

```powershell
$env:CI = "true"
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "C:\Users\jaell\.tauri\roxwana-updater.key"
npm.cmd run tauri -- build --ci
Remove-Item Env:\CI -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
```

6. Revisar los archivos reales generados en:

```powershell
src-tauri\target\release\bundle
```

7. Crear un GitHub Release, por ejemplo `v0.2.4`.
8. Subir el instalador Windows generado por Tauri, por ejemplo
   `ROXWANA Product Manager_0.2.4_x64-setup.exe`.
9. Subir el archivo `.sig` generado por Tauri, por ejemplo
   `ROXWANA Product Manager_0.2.4_x64-setup.exe.sig`.
10. Crear `latest.json` usando `docs/updater/latest.example.json`.
11. En `latest.json`, el campo `signature` debe contener el texto real del `.sig`.

Correcto:

```json
"signature": "CONTENIDO_REAL_DEL_ARCHIVO_SIG"
```

Incorrecto:

```json
"signature": "./archivo.exe.sig"
```

Incorrecto:

```json
"signature": "https://github.com/.../archivo.exe.sig"
```

12. Subir `latest.json` al mismo release.
13. Confirmar que esta URL descarga el JSON sin pedir login:

```txt
https://github.com/Lucasleiva1/roxwana-product-manager/releases/latest/download/latest.json
```

Validacion minima antes de avisar al usuario:

```txt
latest.json status: 200
version: X.Y.Z
signature length: 440
installer status: 200
sig asset status: 200
```

Si esa validacion no pasa, la app instalada todavia no puede encontrar la version nueva.

## Guardado local y backup a Drive

Desde `0.2.10`, el guardado local y el backup a Drive quedan separados.

- Guardar producto, carpeta, imagenes, codigos y base local no debe depender de Google Drive.
- Si Drive falla, la app debe guardar igual y dejar el estado `Drive pendiente`.
- El usuario puede reintentar con el boton `Subir a Drive` cuando Drive vuelva a estar disponible.
- Una falla de Drive puede pasar por sincronizacion en curso, archivos bloqueados, Drive pausado,
  falta de red, carpeta no montada o demora de Windows/Drive para liberar archivos recien escritos.

No volver a cambiar esto para que el backup automatico tire abajo el guardado principal.

## Nombre real de los assets en GitHub

GitHub puede mostrar o servir assets con espacios reemplazados por puntos. Por eso, aunque el archivo
local se llame:

```txt
ROXWANA Product Manager_0.2.7_x64-setup.exe
```

en `latest.json` conviene usar la URL publica comprobada:

```txt
ROXWANA.Product.Manager_0.2.7_x64-setup.exe
```

Siempre validar la URL final con una peticion `HEAD` o descargando el archivo antes de dar por
publicada la version.

## Prueba real obligatoria

1. Instalar una version vieja con updater, por ejemplo `0.2.3`.
2. Publicar una version nueva, por ejemplo `0.2.4`.
3. Abrir la version vieja.
4. Confirmar que aparece el aviso de nueva version.
5. Aceptar la actualizacion.
6. Confirmar descarga, firma, instalacion y reinicio.
7. Confirmar que abre como version nueva.
8. Confirmar que productos, imagenes, carpetas locales, base y backups siguen intactos.

## Datos de usuario

El updater reemplaza la app instalada, no los datos de trabajo. No guardar datos importantes en
`dist`, `src-tauri`, el bundle interno, el instalador ni carpetas que Tauri reemplace al actualizar.

Los datos de ROXWANA deben seguir en ubicaciones estables como `Documentos\ROXWANA Product Manager`,
la base local, carpetas de producto y Google Drive.
