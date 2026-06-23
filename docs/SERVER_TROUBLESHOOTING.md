# Apertura del servidor local

Este documento registra los problemas encontrados al abrir ROXWANA Product Manager y el
procedimiento que debe seguir Codex en conversaciones nuevas.

## Contexto

La interfaz es una aplicación React servida por Vite durante el desarrollo. `npm run dev` inicia
Vite y también el servicio local Whisper usado por el micrófono. La configuración está
en `vite.config.ts`:

- Puerto fijo: `1420`.
- Dirección predeterminada: `127.0.0.1`.
- URL local habitual: `http://127.0.0.1:1420/`.

Esto no publica la aplicación en Internet. Vite solamente entrega los archivos de la aplicación
desde la computadora local.

## Problemas observados

### 1. El proceso desaparece al finalizar una llamada de terminal

Un servidor iniciado directamente dentro de una llamada temporal puede responder mientras esa
llamada está activa y cerrarse cuando termina. El síntoma es que primero devuelve estado HTTP 200 y
luego el navegador muestra `ERR_CONNECTION_REFUSED`.

Solución: iniciar Vite como un proceso independiente y persistente. Después de iniciarlo, hacer una
segunda comprobación HTTP desde otra llamada.

### 2. PowerShell contiene `Path` y `PATH`

En este entorno pueden existir simultáneamente las variables `Path` y `PATH`. PowerShell las trata
sin distinguir mayúsculas y minúsculas, por lo que `Start-Process` puede fallar con un error similar
a:

`Ya se ha agregado el elemento. Clave en el diccionario: 'Path'. Clave agregada: 'PATH'.`

Solución: no insistir con el mismo `Start-Process`. Iniciar el proceso mediante un mecanismo
persistente que no reconstruya ese diccionario de variables. En la sesión donde se documentó el
problema funcionó crear el proceso con `Win32_Process.Create`; esta operación puede requerir permiso
elevado.

### 3. El navegador integrado no alcanza `127.0.0.1`

El navegador integrado puede ejecutarse en un entorno de red separado. Para ese navegador,
`127.0.0.1` puede apuntar al propio entorno aislado y no a la computadora donde corre Vite.

Solución:

1. Iniciar Vite escuchando en `0.0.0.0`, manteniendo el puerto `1420`.
2. Obtener la IPv4 local de la computadora, por ejemplo con `ipconfig`.
3. Abrir en el navegador integrado `http://<IP-LOCAL>:1420/`.

En la sesión del 22 de junio de 2026 la IP era `192.168.100.6`, pero no debe quedar codificada como
valor permanente porque puede cambiar al reconectar la red.

### 4. La interfaz abre, pero la inteligencia parece desconectada

Ollama corre en la computadora en el puerto `11434`. Cuando la aplicación se abre mediante una IP
de red, una conexión directa del navegador a `http://localhost:11434` puede fallar por aislamiento
de red o permisos del origen. El resultado es engañoso: el chat sigue respondiendo con el analizador
local, pero no utiliza realmente el modelo configurado.

Solución: la aplicación web debe llamar a `/ollama` y Vite debe reenviar esa ruta a
`http://127.0.0.1:11434`. Antes de revisar el comportamiento del asistente, comprobar que:

1. Ollama esté ejecutándose y tenga disponible el modelo seleccionado.
2. `http://127.0.0.1:1420/ollama/api/tags` devuelva HTTP 200.
3. Cada mensaje reciba el borrador actual para interpretar correcciones incrementales.
4. La extracción local no genere nuevamente nombre o prefijo cuando el usuario solamente cambia
   talles, colores, precio u otro campo.
5. El stock indicado se aplique también a variantes que ya existían.

Si `/api/tags` responde pero `/api/generate` devuelve HTTP 403 desde la IP local, el proxy debe
reemplazar el encabezado `Origin` por `http://localhost:11434`. Sin ese ajuste la interfaz puede
detectar los modelos, pero Ollama rechaza los mensajes reales.

## Procedimiento recomendado

Si el usuario pide abrir la aplicación como programa de Windows, usar primero
[WINDOWS_APP_STARTUP.md](WINDOWS_APP_STARTUP.md). Ese documento registra el camino rápido con el
ejecutable Tauri ya compilado.

1. Comprobar si el puerto `1420` ya está escuchando.
2. Si ya responde, reutilizar el servidor existente y no iniciar otro.
3. Si no responde, iniciar el entorno completo como proceso persistente con:

   `npm.cmd run dev -- --host 0.0.0.0`

4. Verificar desde una llamada separada que `http://127.0.0.1:1420/` devuelve HTTP 200.
5. Verificar que `http://127.0.0.1:8765/health` devuelve HTTP 200 para habilitar el micrófono.
6. Obtener la IPv4 local actual; no reutilizar ciegamente una IP de una sesión anterior.
7. Abrir `http://<IP-LOCAL>:1420/` en el navegador integrado.
8. Confirmar visualmente que el título sea `ROXWANA Product Manager`.
9. Informar al usuario, en términos sencillos, que la web local quedó abierta y proporcionar la URL.

## Qué significa “en segundo plano”

Vite es un pequeño programa que permanece ejecutándose para que el navegador pueda solicitar los
archivos de la aplicación. “En segundo plano” sólo significa que sigue activo sin mostrar una
ventana de terminal. Si Vite se detiene, la pestaña permanece abierta pero ya no podrá recargar la
aplicación.

## Seguridad y alcance de red

Escuchar en `0.0.0.0` permite acceder al servidor desde las interfaces de red de la computadora.
Normalmente esto lo hace visible para otros dispositivos de la misma red local, sujeto al firewall.
No equivale a desplegarlo públicamente en Internet. Cuando sólo se necesite el navegador normal de
la propia computadora, `127.0.0.1` es más restrictivo.
