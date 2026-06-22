# Apertura del servidor local

Este documento registra los problemas encontrados al abrir ROXWANA Product Manager y el
procedimiento que debe seguir Codex en conversaciones nuevas.

## Contexto

La interfaz es una aplicación React servida por Vite durante el desarrollo. La configuración está
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

## Procedimiento recomendado

1. Comprobar si el puerto `1420` ya está escuchando.
2. Si ya responde, reutilizar el servidor existente y no iniciar otro.
3. Si no responde, iniciar Vite como proceso persistente con:

   `node node_modules\vite\bin\vite.js --configLoader runner --host 0.0.0.0`

4. Verificar desde una llamada separada que `http://127.0.0.1:1420/` devuelve HTTP 200.
5. Obtener la IPv4 local actual; no reutilizar ciegamente una IP de una sesión anterior.
6. Abrir `http://<IP-LOCAL>:1420/` en el navegador integrado.
7. Confirmar visualmente que el título sea `ROXWANA Product Manager`.
8. Informar al usuario, en términos sencillos, que la web local quedó abierta y proporcionar la URL.

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

