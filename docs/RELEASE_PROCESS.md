# Proceso de publicacion de versiones

Este documento explica como guardar una version en GitHub y dejarla disponible para que la app
instalada pueda actualizarse desde el updater oficial de Tauri.

Usarlo cada vez que haya que publicar una nueva version.

## Regla principal

No publicar una actualizacion solo porque se hicieron cambios. Primero confirmar que el usuario pidio
publicar o subir la version. A veces se hacen varios cambios seguidos y conviene probar antes de
generar un Release.

Antes de decir que una version esta lista, distinguir tres estados:

1. El codigo esta corregido localmente.
2. El instalador firmado esta generado.
3. La app instalada ya puede ver la version nueva en GitHub.

Solo el punto 3 significa que el usuario puede actualizar desde la app. Si
`https://github.com/Lucasleiva1/roxwana-product-manager/releases/latest/download/latest.json`
sigue devolviendo la version anterior, la app instalada no va a encontrar la actualizacion aunque el
codigo, el tag o el instalador existan localmente.

Cuando el usuario pide publicar, el resultado esperado es:

1. Commit en `main`.
2. Tag de version, por ejemplo `v0.2.7`.
3. Release publico en GitHub.
4. Instalador `.exe` subido al Release.
5. Firma `.exe.sig` subida al Release.
6. `latest.json` subido al Release.
7. Endpoint publico validado:

```txt
https://github.com/Lucasleiva1/roxwana-product-manager/releases/latest/download/latest.json
```

## Archivos de version

Actualizar siempre los tres archivos principales:

```txt
package.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
```

Despues de compilar o verificar, tambien puede cambiar:

```txt
package-lock.json
src-tauri/Cargo.lock
```

Si se publica una version `0.2.7`, preparar tambien:

```txt
docs/updater/latest.json
docs/updater/latest.0.2.7.json
```

`latest.json` es el archivo real que se sube a GitHub Releases. La copia con numero de version queda
como historial interno.

## Compilar el instalador firmado

La clave privada esta fuera del repo:

```txt
C:\Users\jaell\.tauri\roxwana-updater.key
```

No imprimirla, no commitearla y no subirla a GitHub.

Comando:

```powershell
$ErrorActionPreference = "Stop"
$env:CI = "true"
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath "C:\Users\jaell\.tauri\roxwana-updater.key"
npm.cmd run tauri -- build --ci
Remove-Item Env:\CI -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
```

Archivos esperados para `0.2.7`:

```txt
src-tauri\target\release\bundle\nsis\ROXWANA Product Manager_0.2.7_x64-setup.exe
src-tauri\target\release\bundle\nsis\ROXWANA Product Manager_0.2.7_x64-setup.exe.sig
```

Verificar que existan:

```powershell
Get-ChildItem -LiteralPath "src-tauri\target\release\bundle\nsis" -Filter "*0.2.7*" |
  Select-Object Name,Length,LastWriteTime
```

## Preparar latest.json

Leer la firma real:

```powershell
Get-Content -Raw -LiteralPath "src-tauri\target\release\bundle\nsis\ROXWANA Product Manager_0.2.7_x64-setup.exe.sig"
```

Pegar ese contenido completo en `signature`. No pegar una ruta local ni una URL al `.sig`.

Ejemplo:

```json
{
  "version": "0.2.7",
  "notes": "Agrega pantalla de carga, filtros de publicacion y sincronizacion automatica con Drive.",
  "pub_date": "2026-06-29T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENIDO_REAL_DEL_ARCHIVO_SIG",
      "url": "https://github.com/Lucasleiva1/roxwana-product-manager/releases/download/v0.2.7/ROXWANA.Product.Manager_0.2.7_x64-setup.exe"
    }
  }
}
```

Importante: GitHub puede servir los assets con espacios reemplazados por puntos. Por eso la URL usa:

```txt
ROXWANA.Product.Manager_0.2.7_x64-setup.exe
```

aunque el archivo local tenga espacios:

```txt
ROXWANA Product Manager_0.2.7_x64-setup.exe
```

## Verificaciones antes de publicar

Ejecutar:

```powershell
npm.cmd run build
```

Y:

```powershell
cargo check
```

El `cargo check` se corre desde:

```txt
src-tauri
```

Si ambos pasan y el instalador firmado existe, se puede commitear.

## Commit, tag y push

Ejemplo para `0.2.7`:

```powershell
git add docs/updater/latest.example.json docs/updater/latest.json docs/updater/latest.0.2.7.json package-lock.json package.json src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/tauri.conf.json src/app/App.tsx src/features/views/AppViews.tsx src/styles/globals.css
git commit -m "Release 0.2.7 with startup sync flow"
git tag -a v0.2.7 -m "ROXWANA Product Manager 0.2.7"
git push origin main --tags
```

Ajustar la lista de archivos segun los cambios reales. Antes del commit, revisar:

```powershell
git status --short
git diff --stat
```

## Publicar Release con API de GitHub

La forma que funciono fue usar la API de GitHub y tomar el token desde `git credential fill`. No
imprimir el token.

Puntos importantes:

- `gh` puede fallar si no esta autenticado como corresponde.
- La API directa funciono usando las credenciales ya guardadas por Git.
- El Release debe quedar como ultimo Release, no draft y no prerelease.
- Se deben subir exactamente tres assets: `.exe`, `.exe.sig` y `latest.json`.
- Despues de publicar, validar siempre la URL publica del updater. No alcanza con ver que el tag
  exista o que `main` haya sido empujado.

Detalle critico que resolvio el problema:

```powershell
$uploadBase = $release.upload_url.Split("{")[0]
$uploadUri = "${uploadBase}?name=$([uri]::EscapeDataString($asset.Name))"
```

Usar `${uploadBase}` es importante. Sin llaves, PowerShell puede interpretar mal la variable cuando
la URL sigue con `?name=`, y termina armando una URI invalida.

## Problema que aparecio al publicar 0.2.7

Durante la publicacion de `0.2.7`, el Release se creo correctamente, pero la primera subida de assets
fallo con:

```txt
URI no valido: no se puede analizar el nombre de host.
```

La causa fue la construccion de la URL de subida para GitHub Releases. El endpoint real de GitHub
viene asi:

```txt
https://uploads.github.com/repos/Lucasleiva1/roxwana-product-manager/releases/ID/assets{?name,label}
```

Hay que cortar todo desde `{` y despues agregar `?name=...`. La forma correcta es:

```powershell
$uploadBase = $release.upload_url.Split("{")[0]
$uploadUri = "${uploadBase}?name=$([uri]::EscapeDataString($asset.Name))"
```

Despues de eso, los assets se subieron correctamente:

```txt
ROXWANA Product Manager_0.2.7_x64-setup.exe
ROXWANA Product Manager_0.2.7_x64-setup.exe.sig
latest.json
```

Tambien aparecio un error menor al intentar listar assets con `Select-Object -ExpandProperty name`.
Eso no afecto la publicacion: los archivos ya estaban subidos. La validacion real debe hacerse con
las URLs publicas, no solo con ese listado final.

## Validacion publica obligatoria

Despues de publicar, comprobar:

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
"version: $($latestJson.version)"
"signature length: $($sig.Length)"
"installer status: $($installerHead.StatusCode)"
"installer url: $installerUrl"
```

Para `0.2.7`, la validacion correcta dio:

```txt
latest.json status: 200
version: 0.2.7
signature length: 440
installer status: 200
sig asset status: 200
```

Si `latest.json` responde `200`, la version es la esperada, la firma tiene contenido y el instalador
responde `200`, la app instalada ya puede detectar la actualizacion.

## Problemas reales encontrados en 0.2.9 y 0.2.10

### La app no encontraba la version nueva

Sintoma: la app instalada decia que no habia actualizacion aunque localmente ya existia el
instalador firmado.

Causa: el endpoint publico `releases/latest/download/latest.json` seguia devolviendo `0.2.8`. Se
habian creado commit, tag e instalador, pero faltaba publicar el Release con los tres assets
obligatorios.

Correccion: publicar el Release y validar:

```txt
latest.json status: 200
version: 0.2.9 o superior
signature length: 440
installer status: 200
sig asset status: 200
```

### GitHub CLI no estaba autenticado

Sintoma: `gh release ...` fallaba con mensaje de login.

Correccion preferida: usar el metodo API documentado o iniciar `gh auth login` solo si el usuario lo
autoriza. Como alternativa de emergencia, se puede subir un workflow versionado de GitHub Actions
que publique el Release con `GITHUB_TOKEN`, pero ese workflow debe ser especifico de esa version y
no debe quedar apuntando a versiones viejas.

Si se usa el workflow de emergencia:

1. Copiar el instalador firmado y su `.sig` a `release-assets/vX.Y.Z/`.
2. Crear `.github/workflows/publish-vX.Y.Z.yml`.
3. Hacer commit y push.
4. Esperar que Actions termine en `success`.
5. Validar `latest.json` publico.
6. En una version posterior, borrar el workflow viejo para que no vuelva a tocar un Release anterior.

### Guardar producto fallaba por Drive

Sintoma: al guardar una ficha con imagenes y variantes, la UI mostraba "No pude guardar el producto".

Causa: el guardado local terminaba, pero despues se ejecutaba backup automatico a Google Drive. Si
Drive estaba pausado, sincronizando, no disponible o con archivos bloqueados, ese error subia como si
hubiera fallado el guardado del producto.

Regla corregida desde `0.2.10`: el backup automatico no puede bloquear el guardado local. El producto
queda guardado en la base y carpeta local; si Drive falla, la app debe mostrar "Drive pendiente" y
ofrecer un boton para subir el backup despues.

### Perdida de trabajo durante una falla

Sintoma: si el flujo fallaba, el usuario podia perder una ficha en carga.

Correccion desde `0.2.10`: el borrador actual se persiste en `localStorage` mientras se trabaja. El
borrador se limpia solo cuando se descarta o se guarda correctamente.

## Reglas reforzadas para guardar y backup

- Guardar producto local, imagenes, codigos y base debe ser prioridad absoluta.
- Drive es una copia secundaria; no debe impedir que el usuario guarde.
- Si Drive falla, mostrar estado pendiente y permitir reintento manual.
- No resetear el borrador si el guardado real falla.
- No mostrar mensajes genericos cuando Tauri devuelve un error concreto.
- Nunca decir "actualizacion publicada" hasta validar `latest.json`, instalador y firma por HTTP.

## Que no hacer

- No subir solo el `.exe`: sin `latest.json` la app no detecta nada.
- No subir solo `latest.json`: sin instalador publico no puede descargar.
- No poner en `signature` una ruta local.
- No poner en `signature` una URL.
- No publicar una version sin compilar con la clave privada real.
- No regenerar la clave privada salvo emergencia: las apps instaladas con la clave publica actual no
  podrian verificar firmas hechas con otra clave.
- No guardar datos de usuario dentro del bundle de la app. El updater reemplaza la app, no debe tocar
  la base local, imagenes, carpetas de productos ni backups.
