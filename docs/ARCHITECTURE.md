# Arquitectura del proyecto

Esta guía indica dónde buscar y cambiar código sin recorrer todo el repositorio.

## Flujo principal

```text
Navegador
  ├── HTTP /api/* -> public/index.php -> Auth / GameService / funciones HTTP
  └── WebSocket   -> bin/websocket.php -> WebSocketServer -> GameService
                                                        -> MariaDB
```

MariaDB y `GameService` son autoritativos. El navegador nunca debe decidir por sí solo permisos, posiciones, vida o turnos.

## Mapa de cambios

| Cambio | Archivos principales | Dependencias que puede ser necesario consultar |
| --- | --- | --- |
| Login, registro, cookies | `src/Auth.php` | `public/index.php`, `database/schema.sql` |
| Rutas HTTP | `public/index.php` | `src/Http/common.php` |
| Uploads y entrega de imágenes | `src/Http/assets.php` | `public/index.php`, tablas `assets` |
| Consultas y homebrew del Codex | `src/Http/codex.php` | migraciones `004`–`035`, `public/assets/js/codex.js` |
| Protocolo y difusión WebSocket | `src/WebSocketServer.php` | `bin/websocket.php`, métodos públicos de `GameService` |
| Reglas de mapa, movimiento o combate | `src/GameService.php` | `database/schema.sql`, `tests/run.php` |
| Estado compartido del frontend | `public/assets/js/state.js` | módulos que consuman la propiedad modificada |
| HTTP, selectores y escape frontend | `public/assets/js/core.js` | ninguno normalmente |
| Formularios genéricos | `public/assets/js/dialogs.js` | `public/app.html`, `public/assets/styles.css` |
| Interfaz del Codex | `public/assets/js/codex.js` | `src/Http/codex.php` |
| Canvas, escenario, tokens y encounter | `public/assets/app.js` | `state.js`, `core.js`, `dialogs.js` |
| Estructura visual | `public/app.html` | `public/assets/styles.css` |
| Estilos | `public/assets/styles.css` | `public/app.html` y el módulo que genere la clase afectada |
| Esquema nuevo | nueva migración y `database/schema.sql` | código que use la tabla o columna |
| Datos privados/SRD | `bin/load-private-data.sh`, `bin/import-private-media.php` | solo cuando la tarea lo requiera |
| Despliegue | `Dockerfile`, `docker-compose.yml`, `.env.example` | `README.md` |

## HTTP

`public/index.php` es únicamente el punto de entrada y la tabla visible de rutas. Las implementaciones extensas viven en archivos enfocados:

- `src/Http/common.php`: respuesta JSON, CSRF, autorización y errores HTTP.
- `src/Http/assets.php`: uploads normales y autorización para servir assets.
- `src/Http/codex.php`: catálogo, detalles, personalización y media del Codex.

Mantén el router corto. Una funcionalidad HTTP grande debe vivir junto a su dominio, no añadirse como otro bloque extenso al final del router.

## WebSocket y comandos

El cliente envía una de estas acciones de transporte:

- `subscribe`
- `command`
- `chat.send`
- `draw`
- `dm.view`
- `guest.view.get`
- `heartbeat`

`src/WebSocketServer.php` autentica, despacha y difunde. Las reglas de negocio de `command` pertenecen a `GameService::command()` y sus métodos asociados.

Cada comando de partida incluye un `requestId`. `GameService` lo registra en `command_receipts`, incrementa `scenarios.version` y escribe `scenario_events` dentro de una transacción. Después, WebSocket pide a los clientes afectados que recarguen su snapshot.

## Frontend

Los módulos tienen estas responsabilidades:

- `core.js`: utilidades pequeñas sin estado de dominio.
- `state.js`: único objeto de estado mutable compartido.
- `dialogs.js`: formulario modal genérico y ciclo de vida del diálogo.
- `codex.js`: navegación, búsqueda y edición del Codex.
- `app.js`: sesión, escenarios, tiempo real, Canvas y encuentros.

No vuelvas a concentrar funcionalidad del Codex o utilidades compartidas en `app.js`. Si otra sección independiente crece de forma similar, extráela solo cuando tenga un límite funcional claro y pocas dependencias.

## Persistencia

- `database/schema.sql` representa una instalación nueva.
- `database/migrations/` actualiza instalaciones existentes.
- `database/private/` y `database/res/` son datasets, no código de aplicación.
- `storage/media/` contiene binarios y no debe escanearse para tareas normales.

Al añadir una columna o tabla, crea una migración nueva e incorpora el resultado final a `schema.sql`.

## Pruebas y formato

- `tests/run.php` prueba integración del dominio contra MariaDB.
- Prettier mantiene legibles PHP, JavaScript, HTML y CSS.
- `composer test` necesita una base inicializada.
- Los chequeos de sintaxis no necesitan servicios activos.
