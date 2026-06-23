# Apertura de la app de Windows

Este procedimiento debe usarse cuando el usuario pida abrir la aplicación para trabajar como
programa de Windows, no como pestaña del navegador.

## Objetivo

Abrir ROXWANA Product Manager como ventana de escritorio real usando el ejecutable Tauri ya
compilado, mientras Vite entrega la interfaz local en el puerto fijo `1420`.

Vite es el servidor local de desarrollo. No es Internet y no publica la app. La ventana importante
para probar funciones reales de escritorio es `roxwana-product-manager.exe`.

## Procedimiento rápido

1. Verificar que Vite responda en la URL local:

   ```powershell
   try {
     $response = Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:1420/ -TimeoutSec 3
     "VITE_HTTP $($response.StatusCode)"
   } catch {
     "VITE_NO_RESPONSE: $($_.Exception.Message)"
   }
   ```

2. Si Vite no responde, iniciar el servidor local como proceso persistente, no en una terminal
   temporal:

   ```powershell
   $cwd = (Resolve-Path '.').Path
   $cmd = "cmd.exe /c cd /d `"$cwd`" && npm.cmd run dev -- --host 0.0.0.0 > .vite-server.log 2> .vite-server.err.log"
   Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
     CommandLine = $cmd
     CurrentDirectory = $cwd
   }
   ```

   Si Windows devuelve `Acceso denegado`, repetir este comando con permiso elevado.

3. Confirmar de nuevo que `http://127.0.0.1:1420/` devuelve HTTP 200.

4. Abrir la app de escritorio desde el ejecutable ya compilado:

   ```powershell
   $exe = (Resolve-Path 'src-tauri\target\debug\roxwana-product-manager.exe').Path
   Start-Process -FilePath $exe -WorkingDirectory (Resolve-Path '.').Path
   ```

5. Verificar que el proceso de Windows exista:

   ```powershell
   Get-Process |
     Where-Object { $_.MainWindowTitle -match 'ROXWANA|Product Manager' -or $_.ProcessName -match 'roxwana' } |
     Select-Object ProcessName,Id,MainWindowTitle,Path
   ```

## Qué no hacer primero

- No usar sólo el navegador para probar funciones de carpetas reales.
- No asumir que `npm run dev` ejecutado en una llamada temporal seguirá abierto.
- No intentar `npm run tauri -- dev` como primera opción si `cargo` no está disponible.
- No usar `npm` en PowerShell si lo bloquea la política de scripts; usar `npm.cmd`.

## Si falta el ejecutable

Si no existe `src-tauri\target\debug\roxwana-product-manager.exe`, buscar otro build disponible:

```powershell
Get-ChildItem -Path src-tauri -Recurse -Filter roxwana-product-manager.exe |
  Select-Object FullName,LastWriteTime,Length
```

Si no hay ningún ejecutable, recién ahí intentar compilar/abrir con Tauri dev. Para eso debe existir
Rust/Cargo en la máquina:

```powershell
where.exe cargo
```

Si `cargo` no existe, no se puede compilar Tauri en esa sesión hasta instalar Rust o usar un
ejecutable ya construido.

## Mensaje al usuario

Al terminar, explicar en lenguaje simple:

- La app quedó abierta como programa de Windows.
- Vite sigue funcionando en segundo plano para entregar la interfaz local.
- La URL interna usada por la app es `http://127.0.0.1:1420/`.
- Esto no publica la aplicación en Internet.
