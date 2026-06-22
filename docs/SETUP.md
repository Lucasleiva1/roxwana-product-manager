# Instalación en Windows

## Estado detectado en esta computadora

Al iniciar el proyecto no estaban disponibles en el `PATH`:

- Git
- Node.js / npm
- Rust / Cargo
- Ollama
- Visual Studio Build Tools

Durante la creación se instalaron versiones portables dentro de `.tools/`:

- Git 2.54.0
- Node.js LTS 24.17.0
- Rust 1.96.0

La aplicación web ya puede compilarse sin instalaciones globales:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 build
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 test
```

Para compilar el `.exe` todavía hacen falta Visual Studio Build Tools y WebView2. Para usar IA
local real también falta Ollama.

## Requisitos

1. Git for Windows.
2. Node.js LTS.
3. Rust mediante `rustup`.
4. Visual Studio Build Tools 2022:
   - Desarrollo para el escritorio con C++.
   - MSVC v143.
   - Windows 10/11 SDK.
5. Microsoft Edge WebView2 Runtime.
6. Ollama.

Con `winget` disponible:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Rustlang.Rustup -e
winget install --id Ollama.Ollama -e
```

Visual Studio Build Tools:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e
```

En el instalador visual, marcar **Desarrollo para el escritorio con C++**.

Reiniciá la terminal y verificá:

```powershell
git --version
node --version
npm --version
rustc --version
cargo --version
ollama --version
```

## Proyecto

```powershell
npm install
npm run build
npm test
npm run tauri dev
```

Con las herramientas portables:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 dev
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 tauri-dev
```

Para generar el instalador:

```powershell
npm run tauri build
```

## Ollama

Iniciar Ollama y descargar un modelo pequeño:

```powershell
ollama serve
ollama pull llama3.2:3b
```

Después, en **Ajustes → Ollama local**, probar `http://localhost:11434` y seleccionar el modelo.

Si Ollama no está activo, la aplicación sigue funcionando con extracción local por reglas.
