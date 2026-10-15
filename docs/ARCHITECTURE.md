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

| Cambio                                | Archivos principales                                        | Dependencias que puede ser necesario consultar                     |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Login, registro, cookies              | `src/Auth.php`                                              | `public/index.php`, `database/schema.sql`                          |
| Rutas HTTP                            | `public/index.php`                                          | `src/Http/common.php`                                              |
| Uploads y entrega de imágenes         | `src/Http/assets.php`                                       | `public/index.php`, tablas `assets`                                |
| Consultas y homebrew del Codex        | `src/Http/codex.php`                                        | tablas Codex de `database/schema.sql`, `public/assets/js/codex.js` |
| Protocolo y difusión WebSocket        | `src/WebSocketServer.php`                                   | `bin/websocket.php`, métodos públicos de `GameService`             |
| Reglas de mapa, movimiento o combate  | `src/GameService.php`                                       | `database/schema.sql`, `tests/run.php`                             |
| Estado compartido del frontend        | `public/assets/js/state.js`                                 | módulos que consuman la propiedad modificada                       |
| HTTP, selectores y escape frontend    | `public/assets/js/core.js`                                  | ninguno normalmente                                                |
| Formularios genéricos                 | `public/assets/js/dialogs.js`                               | `public/app.html`, `public/assets/styles.css`                      |
| Interfaz del Codex                    | `public/assets/js/codex.js`                                 | `src/Http/codex.php`                                               |
| Canvas, escenario, tokens y encounter | `public/assets/app.js`                                      | `state.js`, `core.js`, `dialogs.js`                                |
| Renderizado y efectos del d20          | `public/assets/js/dice.js`                                  | `dice-geometry.js`, `dice-motion.js`, eventos de dados en `app.js`, `styles.css` |
| Trayectorias físicas del d20            | `bin/generate-dice-trajectories.mjs`                          | `cannon-es`, `dice-geometry.js`, `dice-trajectories.js`             |
| Estructura visual                     | `public/app.html`                                           | `public/assets/styles.css`                                         |
| Estilos                               | `public/assets/styles.css`                                  | `public/app.html` y el módulo que genere la clase afectada         |
| Esquema nuevo                         | nueva migración y `database/schema.sql`                     | código que use la tabla o columna                                  |
| Datos privados/SRD                    | `bin/init-database-data.sh`, `bin/import-private-media.php` | servicios `codex-data-init`, `media-init` y `codex-media-init`     |
| Despliegue                            | `Dockerfile`, `docker-compose.yml`, `.env.example`          | `README.md`                                                        |

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

`src/WebSocketServer.php` autentica, despacha y difunde. Las reglas de negocio de `command` pertenecen a `GameService::command()` y sus métodos asociados. Para el ciclo de turnos, esperas, historial y actualización del esquema, consulta [TURNOS.md](TURNOS.md).

Cada comando de partida incluye un `requestId`. `GameService` lo registra en `command_receipts`, incrementa `scenarios.version` y escribe `scenario_events` dentro de una transacción. Después, WebSocket pide a los clientes afectados que recarguen su snapshot.

## Frontend

Los módulos tienen estas responsabilidades:

- `core.js`: utilidades pequeñas sin estado de dominio.
- `state.js`: único objeto de estado mutable compartido.
- `dialogs.js`: formulario modal genérico y ciclo de vida del diálogo.
- `codex.js`: navegación, búsqueda y edición del Codex.
- `app.js`: sesión, escenarios, tiempo real, Canvas y encuentros.
- `dice.js`: texturas, iluminación y reproducción del d20; WebGL con alternativa Canvas 2D. Recibe el resultado del servidor, nunca decide la tirada.
- `dice-geometry.js`: geometría y simetrías compartidas por el renderizado y el collider.
- `dice-motion.js`: interpolación de trayectorias físicas, cámara y adaptación al resultado autoritativo.
- `dice-trajectories.js`: recurso generado con ocho simulaciones de `cannon-es`, no editar a mano. El motor físico es una dependencia de desarrollo, no se carga en el navegador.

### Movimiento del d20

`npm run dice:generate` simula gravedad, fricción y colisiones a 480 Hz y guarda muestras a 60 Hz. La altura inicial es de 4,2–4,95 unidades (un 50 % más que la original) y la restitución es 0,528 (un 10 % más que 0,48). `npm run dice:check` comprueba que el recurso generado es reproducible. Las trayectorias terminan cuando el cuerpo queda dormido sobre una cara, no mediante un giro forzado.

El servidor persiste el resultado y envía `dice.roll.started` seguido de `dice.roll.revealed` en la misma llamada, sin temporizador ni espera artificial. El cliente inicia inmediatamente una trayectoria seleccionada por `rollId`; el estado de preparación solo cubre el tránsito de mensajes. Una simetría del icosaedro aplicada a **todos** los fotogramas sitúa la cara autoritativa arriba sin cambiar numeración ni contactos. Los clientes reproducen la misma trayectoria independientemente de sus FPS. Los efectos y el tiempo de lectura comienzan al alcanzar el reposo. Con movimiento reducido se muestra directamente ese estado final.

Pruebas: `node tests/dice-physics.mjs` valida las ocho trayectorias y sus veinte resultados; `node tests/dice-renderer.mjs` valida renderizado alternativo, ciclo de animación y mensajes. `composer test` incluye `tests/dice-websocket.php`, que comprueba la entrega inmediata, el orden de mensajes, la persistencia y los permisos.

No vuelvas a concentrar funcionalidad del Codex o utilidades compartidas en `app.js`. Si otra sección independiente crece de forma similar, extráela solo cuando tenga un límite funcional claro y pocas dependencias.

## Persistencia

- `database/schema.sql` contiene el esquema consolidado completo para instalaciones nuevas.
- `database/migrations/` solo admite migraciones posteriores a esta consolidación para instalaciones existentes.
- `database/post_import_normalization.sql` corrige datos después de importar el Codex privado.
- `database/private/` y `database/res/` son datasets, no código de aplicación.
- `storage/media/` contiene binarios y no debe escanearse para tareas normales.

Al añadir una columna o tabla, crea una migración nueva e incorpora también el resultado final a `schema.sql`. No restaures las migraciones históricas consolidadas.

## Pruebas y formato

- `tests/run.php` prueba integración del dominio contra MariaDB.
- Prettier mantiene legibles PHP, JavaScript, HTML y CSS.
- `composer test` necesita una base inicializada.
- Los chequeos de sintaxis no necesitan servicios activos.
