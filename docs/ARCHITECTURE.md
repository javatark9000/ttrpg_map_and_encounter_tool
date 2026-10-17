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

| Cambio                                | Archivos principales                                        | Dependencias que puede ser necesario consultar                                   |
| ------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Login, registro, cookies              | `src/Auth.php`                                              | `public/index.php`, `database/schema.sql`                                        |
| Rutas HTTP                            | `public/index.php`                                          | `src/Http/common.php`                                                            |
| Uploads y entrega de imágenes         | `src/Http/assets.php`                                       | `public/index.php`, tablas `assets`                                              |
| Consultas y homebrew del Codex        | `src/Http/codex.php`                                        | tablas Codex de `database/schema.sql`, `public/assets/js/codex.js`               |
| Protocolo y difusión WebSocket        | `src/WebSocketServer.php`                                   | `bin/websocket.php`, métodos públicos de `GameService`                           |
| Reglas de mapa, movimiento o combate  | `src/GameService.php`                                       | `database/schema.sql`                                                            |
| Estado compartido del frontend        | `public/assets/js/state.js`                                 | módulos que consuman la propiedad modificada                                     |
| HTTP, selectores y escape frontend    | `public/assets/js/core.js`                                  | ninguno normalmente                                                              |
| Formularios genéricos                 | `public/assets/js/dialogs.js`                               | `public/app.html`, `public/assets/styles.css`                                    |
| Interfaz del Codex                    | `public/assets/js/codex.js`                                 | `src/Http/codex.php`                                                             |
| Canvas, escenario, tokens y encounter | `public/assets/app.js`                                      | `state.js`, `core.js`, `dialogs.js`                                              |
| Renderizado y efectos del d20         | `public/assets/js/dice.js`                                  | `dice-geometry.js`, `dice-motion.js`, eventos de dados en `app.js`, `styles.css` |
| Trayectorias físicas del d20          | `bin/generate-dice-trajectories.mjs`                        | `cannon-es`, `dice-geometry.js`, `dice-trajectories.js`                          |
| Estructura visual                     | `public/app.html`                                           | `public/assets/styles.css`                                                       |
| Estilos                               | `public/assets/styles.css`                                  | `public/app.html` y el módulo que genere la clase afectada                       |
| Esquema nuevo                         | nueva migración y `database/schema.sql`                     | código que use la tabla o columna                                                |
| Datos privados/SRD                    | `bin/init-database-data.sh`, `bin/import-private-media.php` | servicios `codex-data-init`, `media-init` y `codex-media-init`                   |
| Despliegue                            | `Dockerfile`, `docker-compose.yml`, `.env.example`          | `README.md`                                                                      |

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

Cada comando de partida incluye un `requestId`. `GameService` lo registra en `command_receipts`, incrementa `scenarios.version` y escribe `scenario_events` dentro de una transacción. Después, WebSocket pide a los clientes afectados que recarguen su snapshot. El jugador conserva el centro y zoom actuales al aplicar estas actualizaciones; el autoencuadre del área visible solo ocurre al cargar inicialmente un escenario. Los invitados continúan siguiendo la cámara compartida por el DM.

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

`npm run dice:generate` simula gravedad, fricción y colisiones a 480 Hz y guarda muestras a 60 Hz. La altura inicial es de 4,2–4,95 unidades (un 50 % más que la original) y la restitución es 0,528 (un 10 % más que 0,48). Las trayectorias terminan cuando el cuerpo queda dormido sobre una cara, no mediante un giro forzado.

El servidor persiste el resultado y envía `dice.roll.started` seguido de `dice.roll.revealed` en la misma llamada, sin temporizador ni espera artificial. El cliente inicia inmediatamente una trayectoria seleccionada por `rollId`; el estado de preparación solo cubre el tránsito de mensajes. Una simetría del icosaedro aplicada a **todos** los fotogramas sitúa la cara autoritativa arriba sin cambiar numeración ni contactos. Los clientes reproducen la misma trayectoria independientemente de sus FPS. Los efectos y el tiempo de lectura comienzan al alcanzar el reposo. Con movimiento reducido se muestra directamente ese estado final.

No vuelvas a concentrar funcionalidad del Codex o utilidades compartidas en `app.js`. Si otra sección independiente crece de forma similar, extráela solo cuando tenga un límite funcional claro y pocas dependencias.

### Vida y rotación de personajes

La vida actual de un personaje jugador es global dentro de `player_characters.current_health`; no pertenece a su colocación en un escenario. `scenario_players` conserva posición, rotación e iniciativa por mapa. Al colocar el mismo personaje en otro escenario mantiene sus últimos PV, y tanto los cambios del DM como la curación del jugador actualizan el valor global.

Tanto `PLAYER` como `DM` pueden poseer, crear, colocar y controlar personajes de jugador. El DM mantiene simultáneamente sus permisos administrativos; las operaciones de jugador validan siempre que `player_characters.owner_id` y `scenario_players.user_id` correspondan a su cuenta. Para el DM, la colocación inicial está en el panel **Personajes propios** y el movimiento posterior usa **Mover aquí…** del Inspector; la barra superior no muestra las herramientas de camino del jugador. **Esperar turno** también vive en ese panel lateral y solo aparece cuando el personaje propio seleccionado es el participante del turno actual.

Los botones de rotación envían incrementos de `±45°`; el servidor bloquea la ficha, acumula el giro sobre el valor persistido y normaliza el resultado. Los NPC nuevos comienzan a `0°` salvo que un cliente solicite explícitamente otra orientación, y sus clones conservan la rotación del original.

### Copia de grupos de NPCs

La selección múltiple del DM habilita **Copiar** cuando contiene al menos dos NPCs. El cliente conserva únicamente el escenario de origen y sus identificadores, por lo que el portapapeles puede utilizarse tras abrir otro mapa. **Pegar** solo aparece mientras exista contenido y envía `tokens.paste` con una casilla de anclaje; se deshabilita durante la solicitud y el portapapeles se limpia únicamente cuando el servidor confirma el pegado. Si la operación falla, permanece disponible para reintentar. `GameService` vuelve a consultar los NPCs, verifica acceso a ambos escenarios, calcula sus posiciones respecto de la esquina superior izquierda del grupo y valida que todos quepan antes de insertar alguno. La operación es atómica y conserva nombre, notas, imagen, criatura del Codex, vida, CA, rotación, iniciativa y visibilidad. Las fichas de jugador no se duplican porque representan personajes globales únicos.

### Fondos de mapa

Los fondos admiten JPEG, PNG, WebP y GIF con un máximo de 15 MB. El servidor valida el contenido real mediante `getimagesize()` y no confía únicamente en la extensión o el MIME enviado por el navegador. Cuando el fondo es GIF, el Canvas se repinta periódicamente para mostrar su animación.

### Niebla de guerra

La niebla se guarda por casilla en `scenario_fog_cells`. Una casilla presente está oculta para jugadores e invitados; si el escenario no tiene filas, el mapa entero está revelado. En la herramienta de niebla, el DM revela con el botón izquierdo y oculta con el derecho; al mantener `Ctrl`, el arrastre aplica la acción a todo el rectángulo seleccionado. En pantallas táctiles, toca o arrastra para revelar y mantén pulsado para ocultar. El cliente envía `map.fog.paint`, y `map.fog.clear` revela todo. `GameService` valida permisos, escenario y coordenadas; WebSocket provoca una resincronización por snapshot. El Canvas recorta todo el contenido del mapa a las casillas visibles y muestra al DM una superposición translúcida sobre las casillas ocultas.

La migración `004_cell_based_fog_of_war.sql` convierte los antiguos rectángulos visibles a su conjunto complementario de casillas ocultas antes de eliminar `scenario_map_focus`.

## Persistencia

- `database/schema.sql` contiene el esquema consolidado completo para instalaciones nuevas.
- `database/migrations/` solo admite migraciones posteriores a esta consolidación para instalaciones existentes.
- `database/post_import_normalization.sql` corrige datos después de importar el Codex privado.
- `database/private/` y `database/res/` son datasets, no código de aplicación.
- `storage/media/` contiene binarios y no debe escanearse para tareas normales.

Al añadir una columna o tabla, crea una migración nueva e incorpora también el resultado final a `schema.sql`. No restaures las migraciones históricas consolidadas.

## Formato

Prettier mantiene legibles PHP, JavaScript, HTML y CSS. Los chequeos de sintaxis no necesitan servicios activos.
