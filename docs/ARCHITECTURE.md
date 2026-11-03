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

| Cambio                                | Archivos principales                                        | Dependencias que puede ser necesario consultar                                                   |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Login, registro, cookies              | `src/Auth.php`                                              | `public/index.php`, `database/schema.sql`                                                        |
| Rutas HTTP                            | `public/index.php`                                          | `src/Http/common.php`                                                                            |
| Uploads y entrega de imágenes         | `src/Http/assets.php`                                       | `public/index.php`, tablas `assets`                                                              |
| Consultas y homebrew del Codex        | `src/Http/codex.php`                                        | tablas Codex de `database/schema.sql`, `public/assets/js/codex.js`                               |
| Protocolo y difusión WebSocket        | `src/WebSocketServer.php`                                   | `bin/websocket.php`, métodos públicos de `GameService`                                           |
| Reglas de mapa, movimiento o combate  | `src/GameService.php`                                       | `database/schema.sql`                                                                            |
| Estado compartido del frontend        | `public/assets/js/state.js`                                 | módulos que consuman la propiedad modificada                                                     |
| HTTP, selectores y escape frontend    | `public/assets/js/core.js`                                  | ninguno normalmente                                                                              |
| Formularios genéricos                 | `public/assets/js/dialogs.js`                               | `public/app.html`, `public/assets/styles.css`                                                    |
| Interfaz del Codex                    | `public/assets/js/codex.js`                                 | `src/Http/codex.php`                                                                             |
| Canvas, escenario, tokens y encounter | `public/assets/app.js`                                      | `state.js`, `core.js`, `dialogs.js`                                                              |
| Renderizado y efectos de dados        | `public/assets/js/dice.js`                                  | `dice-geometry.js`, `dice-models.js`, `dice-motion.js`, eventos de dados en `app.js`, `dice.css` |
| Trayectorias físicas de dados         | `bin/generate-dice-trajectories.mjs`                        | `cannon-es`, `dice-geometry.js`, `dice-models.js`, `dice-trajectories.js`                        |
| Estructura visual y navegación Brasa  | `public/app.html`, `public/assets/js/interface.js`          | `public/assets/styles.css`, `state.js`, callbacks de `app.js`                                    |
| Estilos                               | `public/assets/styles.css`                                  | `public/app.html` y el módulo que genere la clase afectada                                       |
| Esquema nuevo                         | nueva migración y `database/schema.sql`                     | código que use la tabla o columna                                                                |
| Datos privados/SRD                    | `bin/init-database-data.sh`, `bin/import-private-media.php` | servicios `codex-data-init`, `media-init` y `codex-media-init`                                   |
| Despliegue                            | `Dockerfile`, `docker-compose.yml`, `.env.example`          | `README.md`                                                                                      |

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
- `interface.js`: navegación Mapa/Mundos/Personajes/Codex/Chat, lateral no modal de Encuentro, alojamiento único del Inspector, foco, iconos y anclaje de Solicitudes. No decide reglas de juego.
- `styles.css`: diseño Brasa vino/cobre y adaptación responsive. Inter y Cinzel se sirven localmente desde `assets/fonts/`, con sus licencias.
- `dice.css`: estilos de los dados físicos, conservando la presentación del d20 anterior y añadiendo los dos d10 del porcentil, sin adoptar el dado del prototipo.
- `dice.js`: texturas, iluminación y reproducción de dados; WebGL con alternativa Canvas 2D. Recibe el resultado del servidor, nunca decide la tirada. Conserva la configuración visual y física del d20.
- `dice-coin.js`: grabado monocromo de `assets/ui/Logo.jpg`, cara NO, grietas y acabados de la moneda. La carga del logo es diferida y no reinicia la tirada.
- `dice-models.js`: geometrías d2 (moneda)/d4/d6/d8/d10/d12, etiquetas de los d10 porcentiles y descomposición de d100. Se comparte con el generador físico.
- `dice-geometry.js`: geometría y simetrías compartidas por el renderizado y el collider.
- `dice-motion.js`: interpolación de trayectorias físicas, cámara y adaptación al resultado autoritativo.
- `dice-trajectories.js`: recurso generado con ocho simulaciones de `cannon-es` por geometría (56 en total); las ocho del d20 original se conservan. No editar a mano. El motor físico es una dependencia de desarrollo, no se carga en el navegador.

### Interfaz Brasa y preparación local

El Canvas permanece montado al cambiar de sección. Abrir Encuentro reserva una columna en escritorio o muestra un lateral parcial en móvil; no crea un modal ni modifica el combate. Un único nodo de Inspector se mueve entre su alojamiento flotante y la pestaña del lateral. Los snapshots conservan cámara, pestaña, foco de listas y campos que se están editando. El redimensionado conserva el centro tanto para DM como para jugador.

La preparación de participantes usa `encounterDraft`, separada de la selección administrativa. Cancelarla no envía comandos. Confirmar envía `encounter.start` con `prepare: true`; `GameService` prepara e inicia dentro de la transacción existente, con permisos DM, versión e idempotencia. Si la selección no es válida, el combate, historial y log anteriores se recuperan mediante rollback. El snapshot incluye `canRollbackTurn` para habilitar Devolver únicamente cuando existe historial autorizado.

Las funciones que no aparecen en la composición del prototipo siguen disponibles: **Mi sesión → Herramientas de mesa** permite revelar todo, descargar el CSV de salud y consultar/eliminar tiradas. La curación está reservada al DM: el jugador no muestra el botón Curar y el servidor también restringe `player.health.set` al DM. Mundos ofrece la administración de escenarios, y Personajes la colocación y personalización. Solicitudes está separada de Chat y se resuelve sobre el mapa.

### Selector y movimiento de dados

El botón **Dados** abre un menú ascendente con d2 (moneda), d4, d6, d8, d10, d12, d20 y d100; abrirlo no lanza nada. `interface.js` gestiona foco, teclado, Escape, cierre exterior y posición. `app.js` envía `dice.roll` con `sides`. PHP valida el tipo, rol, pertenencia y actividad del escenario antes de generar el resultado. La migración `007_polyhedral_dice.sql` añade `scenario_dice_rolls.sides`, con 20 como valor por defecto para preservar registros y clientes anteriores.

El d100 genera dos dígitos independientes en el servidor y guarda un resultado entre 1 y 100. Se reproducen dos d10, uno con 00–90 y otro con 0–9; `00 + 0 = 100`. La lectura del resultado empieza cuando ambos están en reposo. El d4 se lee en la punta superior: cada vértice tiene el mismo número en sus tres caras adyacentes. Los efectos de crítico y pifia corresponden al d20; la moneda reutiliza sus variantes visuales positiva y negativa, sin convertirlas en reglas de combate.

La moneda usa `sides=2`: PHP elige uniformemente 1 (NO) o 2 (Cara, con el logo) y los registra en las columnas existentes, sin otra migración. Es un cuerpo convexo con dos caras y un canto de 40 segmentos; las trayectorias solo se aceptan si termina apoyado en una cara. Solo la moneda se simula con velocidad angular inicial triple y se reproduce a media velocidad: da más vueltas y su animación dura aproximadamente el doble, sin alargar la lectura del resultado ni cambiar los demás dados. Durante el vuelo es plateada. Al reposar, NO cambia a cobre y revela grietas finas; Cara cambia a oro con un destello suave. La textura de Logo.jpg se convierte en grabado monocromo sin alterar el archivo original. WebGL y Canvas comparten imagen, fracturas y resultado; con movimiento reducido se muestra directamente el acabado final.

`npm run dice:generate` simula gravedad, fricción y colisiones a 480 Hz y guarda muestras a 60 Hz. La altura inicial es de 4,2–4,95 unidades (un 50 % más que la original) y la restitución es 0,528 (un 10 % más que 0,48). Las trayectorias terminan cuando el cuerpo queda dormido sobre una cara, no mediante un giro forzado.

El servidor persiste el resultado y envía `dice.roll.started` seguido de `dice.roll.revealed` en la misma llamada, sin temporizador ni espera artificial. El cliente inicia inmediatamente una trayectoria seleccionada por `rollId`; el estado de preparación solo cubre el tránsito de mensajes. Una simetría del poliedro correspondiente aplicada a **todos** los fotogramas sitúa el resultado autoritativo arriba sin cambiar numeración ni contactos; en el d4 se selecciona la cara de apoyo para orientar su vértice opuesto. Los clientes reproducen la misma trayectoria independientemente de sus FPS. Los efectos y el tiempo de lectura comienzan al alcanzar el reposo. Con movimiento reducido se muestra directamente ese estado final.

No vuelvas a concentrar funcionalidad del Codex o utilidades compartidas en `app.js`. Si otra sección independiente crece de forma similar, extráela solo cuando tenga un límite funcional claro y pocas dependencias.

### Vida y rotación de personajes

La vida actual de un personaje jugador es global dentro de `player_characters.current_health`; no pertenece a su colocación en un escenario. `scenario_players` conserva posición, rotación e iniciativa por mapa. Al colocar el mismo personaje en otro escenario mantiene sus últimos PV, y los cambios de vida y curaciones aplicados por el DM actualizan el valor global. Los jugadores solo consultan sus PV; no pueden curarse ni modificar su vida.

Tanto `PLAYER` como `DM` pueden poseer, crear, colocar y controlar personajes de jugador. El DM mantiene simultáneamente sus permisos administrativos; las operaciones de jugador validan siempre que `player_characters.owner_id` y `scenario_players.user_id` correspondan a su cuenta. Para el DM, la colocación inicial está en la biblioteca **Personajes** y el movimiento posterior usa **Mover aquí…** del Inspector; las herramientas del mapa no muestran el camino del jugador. **Esperar turno** se ofrece en Personajes o junto al personaje propio inspeccionado y solo aparece cuando el personaje seleccionado es el participante del turno actual.

Los botones de rotación envían incrementos de `±45°`; el servidor bloquea la ficha, acumula el giro sobre el valor persistido y normaliza el resultado. Los NPC nuevos comienzan a `0°` salvo que un cliente solicite explícitamente otra orientación, y sus clones conservan la rotación del original.

### Copia de grupos de NPCs

La selección múltiple del DM habilita **Copiar** cuando contiene al menos dos NPCs. El cliente conserva únicamente el escenario de origen y sus identificadores, por lo que el portapapeles puede utilizarse tras abrir otro mapa. **Pegar** solo aparece mientras exista contenido y envía `tokens.paste` con una casilla de anclaje; se deshabilita durante la solicitud y el portapapeles se limpia únicamente cuando el servidor confirma el pegado. Si la operación falla, permanece disponible para reintentar. `GameService` vuelve a consultar los NPCs, verifica acceso a ambos escenarios, calcula sus posiciones respecto de la esquina superior izquierda del grupo y valida que todos quepan antes de insertar alguno. La operación es atómica y conserva nombre, notas, imagen, criatura del Codex, vida, CA, rotación, iniciativa y visibilidad. Las fichas de jugador no se duplican porque representan personajes globales únicos.

### Fondos de mapa

Los fondos admiten JPEG, PNG, WebP y GIF con un máximo de 15 MB. El servidor valida el contenido real mediante `getimagesize()` y no confía únicamente en la extensión o el MIME enviado por el navegador. Los GIF se muestran como una imagen animada nativa debajo del Canvas, porque algunos navegadores conservan únicamente el primer fotograma al copiar un GIF a Canvas. Esa capa sigue la misma posición y escala de la cámara; para jugadores e invitados aplica una máscara de casillas visibles generada en memoria, por lo que la niebla no revela la animación. JPEG, PNG y WebP continúan dibujándose en Canvas. Ningún fondo recibe filtros decorativos de brillo o saturación ni sombra degradada; la niebla y los bloqueos mantienen sus superposiciones funcionales.

### Transitabilidad de casillas

La herramienta **Transitabilidad** unifica bloquear y desbloquear con los mismos gestos que la niebla: botón izquierdo para hacer transitable, derecho para bloquear y `Ctrl` + arrastre para aplicar la acción a un rectángulo. En táctil, toca o arrastra para habilitar el paso y mantén pulsado para bloquear. El botón central desplaza el mapa sin pintar y el pellizco cancela el trazo pendiente.

Ambas herramientas comparten la gestión de pincel y selección rectangular del Canvas. La transitabilidad sigue enviando `map.cells.paint` con `cells` y `blocked`; `GameService` exige rol DM y valida límites y coordenadas antes de persistir en `blocked_cells`. No se modifica el esquema ni se mezclan los bloqueos de movimiento con la niebla visual.

### Niebla de guerra

La niebla se guarda por casilla en `scenario_fog_cells`. Una casilla presente está oculta para jugadores e invitados; si el escenario no tiene filas, el mapa entero está revelado. En la herramienta de niebla, el DM revela con el botón izquierdo y oculta con el derecho; al mantener `Ctrl`, el arrastre aplica la acción a todo el rectángulo seleccionado. En pantallas táctiles, toca o arrastra para revelar y mantén pulsado para ocultar. El cliente envía `map.fog.paint`, y `map.fog.clear` revela todo. `GameService` valida permisos, escenario y coordenadas; WebSocket provoca una resincronización por snapshot. El Canvas recorta todo el contenido del mapa a las casillas visibles y muestra al DM una superposición translúcida sobre las casillas ocultas.

Al trazar caminos, el jugador no puede seleccionar casillas ocultas ni calcular rutas que pasen por ellas. Si un snapshot oculta parte del recorrido pendiente, el cliente lo descarta. `GameService::submitMovement()` valida todas las casillas contra la niebla vigente y rechaza el recorrido completo antes de crear una solicitud o mover la ficha. Los movimientos administrativos y las aprobaciones explícitas del DM conservan sus permisos.

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
