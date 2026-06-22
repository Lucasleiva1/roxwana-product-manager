# Instrucciones persistentes para Codex

Estas instrucciones deben revisarse al comenzar cada conversación dentro de este proyecto.

## Antes de abrir la aplicación

Leer primero [docs/SERVER_TROUBLESHOOTING.md](docs/SERVER_TROUBLESHOOTING.md).

No asumir que `npm run dev` ejecutado en una terminal temporal seguirá activo después de que termine
la llamada de terminal. El servidor debe iniciarse como un proceso persistente y luego verificarse
con una petición HTTP.

La aplicación web usa Vite en el puerto fijo `1420`.

## Comunicación con el usuario

Explicar el resultado en lenguaje sencillo:

- “Vite” es el servidor local de desarrollo, no “Bit”.
- La aplicación se abre como una web local; no se publica automáticamente en Internet.
- “En segundo plano” significa que el pequeño programa que entrega la web sigue funcionando aunque
  no haya una ventana de terminal visible.
- Indicar siempre la URL exacta que se abrió.

