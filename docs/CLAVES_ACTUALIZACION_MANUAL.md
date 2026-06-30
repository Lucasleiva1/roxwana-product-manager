# ROXWANA - claves para actualizar manualmente

Este archivo resume lo que hay que hacer si alguna vez la publicacion automatica o Codex fallan.
No contiene claves privadas. La clave privada de firma existe fuera del repo y nunca debe pegarse en
un chat, documento ni commit.

## Idea central

La app instalada solo encuentra una version nueva si esta URL publica devuelve una version mayor:

```txt
https://github.com/Lucasleiva1/roxwana-product-manager/releases/latest/download/latest.json
```

No alcanza con compilar. No alcanza con hacer commit. No alcanza con crear tag. Tiene que existir un
Release publico en GitHub con tres assets:

```txt
ROXWANA Product Manager_X.Y.Z_x64-setup.exe
ROXWANA Product Manager_X.Y.Z_x64-setup.exe.sig
latest.json
```

## Pasos manuales correctos

Trabajar desde:

```powershell
cd "C:\Users\jaell\Desktop\PAGINAS WEB Y APP\roxwana-product-manager"
```

1. Revisar el estado:

```powershell
git status --short
```

2. Subir la version en estos archivos:

```txt
package.json
package-lock.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
```

`src-tauri/Cargo.lock` se actualiza al compilar o al correr `cargo check`.

3. Probar:

```powershell
npm.cmd run build
cargo check
npm.cmd test
```

`cargo check` se corre desde:

```powershell
cd "C:\Users\jaell\Desktop\PAGINAS WEB Y APP\roxwana-product-manager\src-tauri"
cargo check
```

4. Compilar instalador firmado:

```powershell
cd "C:\Users\jaell\Desktop\PAGINAS WEB Y APP\roxwana-product-manager"
$ErrorActionPreference = "Stop"
$env:CI = "true"
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath "C:\Users\jaell\.tauri\roxwana-updater.key"
npm.cmd run tauri -- build --ci
Remove-Item Env:\CI -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
```

No imprimir el contenido de `TAURI_SIGNING_PRIVATE_KEY`.

5. Confirmar que existen:

```powershell
Get-ChildItem -LiteralPath "src-tauri\target\release\bundle\nsis" -Filter "*X.Y.Z*"
```

6. Leer la firma real del `.sig`:

```powershell
Get-Content -Raw -LiteralPath "src-tauri\target\release\bundle\nsis\ROXWANA Product Manager_X.Y.Z_x64-setup.exe.sig"
```

Ese texto completo va en `signature` dentro de `docs/updater/latest.json`.

7. En `docs/updater/latest.json`, usar URL publica con puntos:

```txt
https://github.com/Lucasleiva1/roxwana-product-manager/releases/download/vX.Y.Z/ROXWANA.Product.Manager_X.Y.Z_x64-setup.exe
```

GitHub puede servir el asset con puntos aunque localmente el archivo tenga espacios.

8. Crear tambien la copia historica:

```txt
docs/updater/latest.X.Y.Z.json
```

9. Commit, tag y push:

```powershell
git add docs/updater/latest.json docs/updater/latest.X.Y.Z.json package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "Release X.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Agregar tambien los archivos de codigo que correspondan a la correccion real.

10. Publicar GitHub Release `vX.Y.Z`.

Subir exactamente:

```txt
ROXWANA Product Manager_X.Y.Z_x64-setup.exe
ROXWANA Product Manager_X.Y.Z_x64-setup.exe.sig
latest.json
```

El Release no debe ser draft ni prerelease.

## Validacion obligatoria

Antes de avisar que la app ya puede actualizar, correr:

```powershell
$latestUrl = "https://github.com/Lucasleiva1/roxwana-product-manager/releases/latest/download/latest.json"
$latestResponse = Invoke-WebRequest -Uri $latestUrl -UseBasicParsing
if ($latestResponse.Content -is [byte[]]) {
  $latestContent = [System.Text.Encoding]::UTF8.GetString($latestResponse.Content)
} else {
  $latestContent = [string]$latestResponse.Content
}
$latestJson = $latestContent | ConvertFrom-Json
$installerUrl = $latestJson.platforms."windows-x86_64".url
$sig = $latestJson.platforms."windows-x86_64".signature
$installerHead = Invoke-WebRequest -Method Head -Uri $installerUrl -UseBasicParsing
$sigUrl = $installerUrl + ".sig"
$sigHead = Invoke-WebRequest -Method Head -Uri $sigUrl -UseBasicParsing
"latest.json status: $($latestResponse.StatusCode)"
"version: $($latestJson.version)"
"signature length: $($sig.Length)"
"installer status: $($installerHead.StatusCode)"
"sig asset status: $($sigHead.StatusCode)"
"installer url: $installerUrl"
```

Tiene que dar:

```txt
latest.json status: 200
version: X.Y.Z
signature length: 440
installer status: 200
sig asset status: 200
```

Si `latest.json` sigue mostrando una version vieja, la app no va a encontrar nada.

## Si GitHub CLI no esta logueado

`gh release ...` puede fallar si `gh auth status` no tiene sesion.

Opciones correctas:

- Usar la API de GitHub con un token autorizado, sin imprimirlo.
- Loguear `gh` y crear el Release.
- Como emergencia, crear un workflow temporal versionado que use `GITHUB_TOKEN` de Actions y suba
  assets desde `release-assets/vX.Y.Z/`.

Si se usa workflow temporal, despues de publicar la version siguiente borrar el workflow viejo para
que no vuelva a tocar releases anteriores.

## Problema de Drive al guardar

Google Drive puede fallar por:

- Sin conexion o Drive pausado.
- Drive sincronizando carpetas.
- Archivos bloqueados por Windows, Google Drive o SQLite.
- Carpeta de Drive no montada o no detectada.
- Archivos grandes que tardan en liberarse.

Regla desde `0.2.10`:

- El producto se guarda localmente igual.
- Si Drive falla, queda `Drive pendiente`.
- El boton `Subir a Drive` reintenta despues.
- El backup automatico no debe bloquear guardar productos.

## Que no hacer

- No poner una ruta local en `signature`.
- No poner una URL en `signature`.
- No subir solo el `.exe`.
- No subir solo `latest.json`.
- No decir que la actualizacion esta lista sin validar la URL publica.
- No commitear `C:\Users\jaell\.tauri\roxwana-updater.key`.
- No hacer depender el guardado local de Google Drive.
