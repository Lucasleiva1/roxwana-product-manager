# Guia de actualizaciones de ROXWANA Product Manager

Esta app usa el updater oficial de Tauri con GitHub Releases y un `latest.json` estatico.
La app pregunta antes de instalar. Si el usuario acepta, descarga una build completa, verifica la
firma, instala encima y reinicia.

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

1. Cambiar la version en `package.json`.
2. Cambiar la version en `src-tauri/tauri.conf.json`.
3. Cambiar la version en `src-tauri/Cargo.toml`.
4. Compilar con la clave privada:

```powershell
$env:CI = "true"
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "C:\Users\jaell\.tauri\roxwana-updater.key"
npm.cmd run tauri -- build --ci
Remove-Item Env:\CI -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
```

5. Revisar los archivos reales generados en:

```powershell
src-tauri\target\release\bundle
```

6. Crear un GitHub Release, por ejemplo `v0.2.4`.
7. Subir el instalador Windows generado por Tauri, por ejemplo
   `ROXWANA Product Manager_0.2.4_x64-setup.exe`.
8. Subir el archivo `.sig` generado por Tauri, por ejemplo
   `ROXWANA Product Manager_0.2.4_x64-setup.exe.sig`.
9. Crear `latest.json` usando `docs/updater/latest.example.json`.
10. En `latest.json`, el campo `signature` debe contener el texto real del `.sig`.

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

11. Subir `latest.json` al mismo release.
12. Confirmar que esta URL descarga el JSON sin pedir login:

```txt
https://github.com/Lucasleiva1/roxwana-product-manager/releases/latest/download/latest.json
```

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
