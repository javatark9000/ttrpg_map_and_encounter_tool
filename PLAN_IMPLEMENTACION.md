# Plan de implementación — TTRPG Manager

## 1. Alcance y principios

Aplicación web privada para un único grupo de Dungeons & Dragons. Mantendrá campañas, escenarios y encuentros entre sesiones. Habrá dos roles (`DM` y `PLAYER`), varios jugadores conectados y como máximo un DM conectado/controlando la partida a la vez.

Principios técnicos:

- El servidor es la autoridad: permisos, posiciones, vida, turnos y aprobaciones se validan en backend.
- MariaDB conserva todo el estado necesario para reanudar una campaña.
- REST se usa para autenticación, cargas y CRUD; WebSocket para cambios de partida en tiempo real.
- Canvas HTML5 dibuja únicamente el mapa. Paneles, formularios y diálogos se implementan con HTML/CSS accesible.
- Diseño responsive y mobile-first; pinch-to-zoom y paneo no modifican el tamaño del resto de la interfaz.
- Cada escenario mantiene estado, encounter e iniciativas independientes.

## 2. Decisiones y supuestos por confirmar

Antes de desarrollar deben cerrarse estas reglas:

1. **Creación de cuentas:** decidir si cualquiera con la URL puede registrarse o si se requiere código de invitación. Se recomienda código del grupo.
2. **Rol DM:** aunque el registro permite elegir rol, se recomienda limitar la creación de cuentas DM con una clave de administración. La conexión activa se protege además con un lease exclusivo.
3. **Personajes del jugador:** se asume que una cuenta puede crear varios, pero solo controla un personaje colocado en un escenario a la vez. Debe confirmarse si podrá controlar varios simultáneamente.
4. **Campañas:** se modelarán campañas desde el inicio, aunque inicialmente solo exista una activa.
5. **Reglas de movimiento:** aclarar si atravesar una casilla bloqueada/ocupada solo requiere aprobación o si ciertos casos deben ser imposibles; también si hay límite de distancia o velocidad de animación.
6. **Ocupación:** confirmar si el destino puede contener varios personajes vivos. El diseño lo permite.
7. **Vida de jugadores a 0:** confirmar si el token del jugador se oculta igual que un NPC; el requisito solo detalla por completo el comportamiento de personajes del DM.
8. **Turno retrasado:** precisar si, tras dispararse el evento, los vinculados actúan antes o después del objetivo. Propuesta: objetivo, luego vinculados en el orden fijado por el DM.
9. **Fondos:** definir tamaño/peso y formatos permitidos. Propuesta: JPEG, PNG o WebP, máximo 15 MB y dimensiones máximas configurables.
10. **Cookies “sin expiración”:** HTTP no ofrece una cookie literalmente eterna. Se implementará una cookie con duración muy larga y un token persistente en base de datos, revocable al hacer logout o cambiar credenciales.

## 3. Arquitectura propuesta

### Backend

- PHP 8.3+.
- Aplicación HTTP con controladores, servicios, repositorios, validación y middleware de autorización.
- Servidor WebSocket PHP de proceso persistente (Ratchet/ReactPHP) ejecutado como servicio separado.
- MariaDB 10.11+ con InnoDB, claves foráneas, transacciones e índices.
- Almacenamiento de imágenes fuera del directorio ejecutable, con nombres aleatorios; la base guarda metadatos y rutas.
- Un reverse proxy (Nginx o Apache compatible con upgrade WebSocket) sobre HTTPS.

Se recomienda usar un framework PHP mantenido (Laravel o Symfony) para autenticación, migraciones, validación, pruebas y colas. Si se exige PHP sin framework, deben conservarse las mismas capas y no construir SQL ni autenticación de forma improvisada.

### Frontend

- HTML semántico, CSS responsive y JavaScript modular.
- Canvas 2D con `requestAnimationFrame`.
- Pointer Events para mouse, stylus y táctil.
- Transformación de cámara independiente: `screen = world * zoom + offset`.
- `devicePixelRatio` para evitar canvas borroso.
- UI HTML superpuesta para formularios, lista de tokens, menú contextual, confirmaciones, estado de conexión y controles de encounter.

### Comunicación

- **HTTP/REST:** login, registro, logout, bootstrap, CRUD de campañas/escenarios/personajes, cargas de imágenes y recuperación inicial.
- **WebSocket:** activación de escenarios, posiciones, trayectorias, aprobaciones, vida, iniciativas, turnos, visibilidad y presencia.
- Todo comando WebSocket incluye `requestId`, `scenarioId`, tipo, payload y versión conocida.
- Toda respuesta/evento incluye versión nueva y datos mínimos necesarios.
- Al reconectar, el cliente solicita snapshot o eventos desde su última versión. Para la primera versión es suficiente devolver un snapshot completo del escenario (máximo 60×60).

## 4. Modelo de datos inicial

Todas las tablas incluyen `id`, fechas de creación/actualización donde aplique e índices para sus relaciones.

### Identidad y campañas

- `users`: nombre, login/email normalizado, hash de contraseña, rol, estado.
- `auth_tokens`: usuario, hash del selector/validador, fecha de creación, último uso, revocado. Nunca guardar el token crudo.
- `campaigns`: nombre, descripción, estado.
- `campaign_members`: campaña, usuario.
- `player_characters`: propietario, campaña, nombre, avatar, vida actual/máxima y datos básicos.
- `dm_player_notes`: campaña, usuario o personaje del jugador, texto privado.
- `assets`: propietario, tipo MIME, tamaño, dimensiones, ruta y hash.

### Mapas

- `scenarios`: campaña, nombre, ancho, alto, fondo, activo, versión.
- `blocked_cells`: escenario, x, y. Solo se guardan bloqueadas porque lo predeterminado es transitable. Restricción única `(scenario_id, x, y)`.
- `cell_notes`: escenario, x, y, texto privado del DM.
- `map_objects`: escenario, x, y, offset dentro de casilla, notas privadas, imagen, visible para jugadores.
- `npc_characters`: escenario, nombre, x, y, notas privadas, imagen, vida, iniciativa nullable, visible, estado.
- `scenario_players`: escenario, usuario, personaje elegido, x, y, vida, iniciativa nullable, último camino y estado. Restricción para que un usuario solo esté colocado en un escenario activo.

Las coordenadas se almacenan como enteros de celda. Los objetos pueden añadir `offset_x/offset_y` normalizados para representar varios dentro de una casilla.

### Encounter

- `encounters`: escenario, estado (`OFF`, `PREPARING`, `RUNNING`, `PAUSED`, `FINISHED`), ronda, participante actual y secuencia.
- `encounter_participants`: encounter, tipo (`PLAYER`/`NPC`), referencia, iniciativa, desempate/orden, estado (`ACTIVE`, `WAITING`, `DEAD`, `REMOVED`).
- `turn_delays`: encounter, participante que espera, participante objetivo, ronda, orden fijado por DM, estado de disparo.
- `movement_requests`: escenario, actor, camino JSON, estado (`PENDING`, `APPROVED`, `REJECTED`, `APPLIED`), motivo, revisor.
- `scenario_events`: escenario, versión, tipo, actor, payload JSON y fecha. Útil para auditoría, diagnóstico y resincronización; se puede compactar periódicamente.

### Restricciones importantes

- Cuadrícula entre 5×5 y 60×60.
- Coordenadas siempre dentro de límites.
- Vida e iniciativa son enteros; iniciativa admite `NULL` para excluir del ciclo.
- Cambios críticos se realizan en transacciones con bloqueo/versionado optimista.
- Una restricción/servicio garantiza que un jugador no figure colocado en dos escenarios a la vez.
- El lease del DM garantiza una única conexión controladora; heartbeats liberan conexiones caídas y existe una acción explícita de toma de control.

## 5. Seguridad y permisos

- Contraseñas con `password_hash()` usando Argon2id (o bcrypt si el entorno no lo soporta).
- Cookie persistente `HttpOnly`, `Secure`, `SameSite=Lax`, ruta `/`, con `Max-Age` largo. Logout revoca el token y elimina la cookie.
- Rotación del validador persistente y protección contra robo/reutilización del token.
- CSRF en operaciones HTTP mutables; WebSocket autenticado durante el handshake y validación de origen.
- Consultas preparadas/ORM, escape de salida, CSP y bloqueo de SVG/HTML ejecutable en uploads.
- Verificación real del MIME y dimensiones de imágenes; nombres generados, nunca el nombre aportado por el usuario.
- Autorización por comando, no solo ocultamiento de botones.
- El jugador solo modifica su avatar/personaje y solicita movimientos propios. No puede cambiar vida, iniciativa, notas, visibilidad ni posición ajena.
- Las notas del DM nunca se incluyen en snapshots/eventos enviados a jugadores.
- Rate limiting para login, registro, uploads y comandos repetidos.

## 6. Diseño del motor de mapa

### Capas de renderizado

1. Fondo opcional, escalado exactamente al área completa del mapa.
2. Celdas bloqueadas y cuadrícula.
3. Notas/marcadores solo visibles para DM.
4. Objetos visibles según rol.
5. NPC y jugadores.
6. Camino seleccionado, último movimiento y highlights de turno.
7. Selección, menús y feedback de aprobación.

El tamaño visual base de una casilla es configurable en cliente (por ejemplo, 64 px en coordenadas de mundo). El zoom cambia la transformación del mapa y del fondo, no la UI HTML.

### Interacción

- Escritorio: rueda para zoom centrado en el cursor, arrastre para paneo, clic para seleccionar.
- Móvil: dos dedos para pinch-to-zoom; arrastre para paneo; tap para seleccionar casillas. Debe evitarse que un paneo accidental agregue una celda al camino.
- Edición DM: modo pintar bloqueado/transitable con arrastre, operaciones agrupadas para evitar un evento por píxel.
- Los jugadores construyen un camino tocando celdas contiguas, incluida diagonal; pueden deshacer y luego aplicar.
- El servidor valida continuidad, límites, turno y colisiones. Si cruza bloqueo o actor vivo, queda pendiente de aprobación del DM; de lo contrario se aplica.
- La animación recorre el camino recibido, pero la posición lógica final ya está validada por el servidor.
- El DM mueve mediante selección de destino (teleport), sin camino obligatorio.

### Varios elementos en una casilla

- 1–3 elementos: distribución automática y reducción proporcional dentro de la casilla.
- 4 o más: pila compacta con contador.
- Tap/clic abre lista flotante HTML con elementos que el usuario puede conocer y las acciones autorizadas.
- Objetos se representan como cuadrados de hasta 1/4 de casilla; personajes como círculos de hasta 1/2 casilla, ajustando temporalmente el layout si comparten celda.

## 7. Máquina de estados del encounter

1. `OFF`: movimiento normal; no hay ciclo de turnos.
2. `PREPARING`: el DM activó encounter. Puede asignar iniciativas y agregar participantes, pero aún no hay turno.
3. `RUNNING`: al pulsar **Iniciar combate**, se ordenan iniciativas descendentes. Empates usan el orden manual del DM.
4. Solo el DM avanza al siguiente turno.
5. En cada cambio se emite un evento. El highlight de un jugador es público; el de un NPC solo se envía/muestra al DM.
6. Un jugador solo puede mover en `RUNNING` si es su turno; en los demás estados se aplica la regla normal definida por el DM.
7. Un participante añadido durante combate entra al ciclo al recibir iniciativa; se requiere definir si entra en la ronda actual o la siguiente. Propuesta: siguiente posición válida aún no recorrida; si ya pasó, siguiente ronda.
8. Retrasar turno crea una relación participante→objetivo para una ronda. Al resolverse, morir o salir el objetivo, se activa la cola vinculada en orden del DM.
9. Vida 0: se oculta el NPC a jugadores. El DM lo sigue viendo con X roja y decide si lo retira del ciclo o lo hace desaparecer.
10. Sin iniciativa: fuera del ciclo, pero manipulable por el DM.

El cálculo de siguiente turno debe ser una función de dominio probada de forma aislada, no lógica repartida en la interfaz.

## 8. Protocolo WebSocket mínimo

### Comandos del cliente

- `scenario.subscribe` / `scenario.unsubscribe`
- `scenario.activate` / `scenario.deactivate`
- `map.cells.paint`
- `token.create`, `token.update`, `token.move_dm`, `token.visibility`
- `player.place`
- `movement.submit`, `movement.approve`, `movement.reject`
- `encounter.prepare`, `encounter.start`, `encounter.stop`
- `initiative.set`, `initiative.reorder_tie`
- `turn.next`, `turn.delay`, `turn.delay_order`
- `health.set`
- `presence.heartbeat`

### Eventos del servidor

- `snapshot`
- `scenario.activated`, `scenario.deactivated`
- `map.cells.changed`
- `token.created`, `token.updated`, `token.moved`, `token.hidden`
- `movement.pending`, `movement.rejected`
- `encounter.changed`, `initiative.changed`, `turn.changed`
- `presence.changed`
- `command.accepted` / `command.error`

Los payloads se filtran por rol antes de enviarse. Las acciones deben ser idempotentes mediante `requestId` para que una reconexión no duplique movimientos o cambios de turno.

## 9. Fases de implementación

### Fase 0 — Especificación y prototipo (1 semana)

- Resolver las preguntas de la sección 2.
- Wireframes de móvil y escritorio.
- Prototipo de Canvas: mapa 60×60, fondo, zoom, paneo, hit testing y agrupación de tokens.
- Definir contratos REST/WS y reglas exactas del encounter.
- Resultado: especificación funcional cerrada y prueba de viabilidad táctil/rendimiento.

### Fase 1 — Base técnica y cuentas (1–2 semanas)

- Estructura de backend/frontend, configuración por entorno y migraciones.
- Registro con selección autorizada de rol, autologin, login, sesión persistente y logout.
- Middleware de roles, protección CSRF, validación y auditoría básica.
- Campaña inicial, membresías, personajes del jugador y avatar.
- Pruebas de autenticación y autorización.

### Fase 2 — CRUD y editor de escenarios (2–3 semanas)

- Crear/listar/renombrar escenarios de 5×5 a 60×60.
- Carga de fondo.
- Canvas responsive y controles de cámara.
- Pintar celdas bloqueadas/transitables.
- Notas por casilla, objetos, NPC, imágenes, vida, iniciativa y visibilidad.
- Distribución/pila de varios elementos y selector contextual.
- Guardado automático y manejo de errores.

### Fase 3 — Tiempo real y escenarios activos (2 semanas)

- Servicio WebSocket autenticado, heartbeat, reconexión y snapshots.
- Lease de DM único.
- Activar/desactivar varios escenarios con confirmación y persistencia total.
- Suscripción de jugadores a escenarios activos.
- Colocación de personaje y restricción de un escenario por jugador.
- Vistas filtradas por rol y pruebas con varias pestañas/dispositivos.

### Fase 4 — Movimiento y aprobación (2 semanas)

- Selección de camino celda por celda, diagonal y deshacer.
- Validación autoritativa de camino, bloqueos y ocupación viva.
- Flujo de aprobación/rechazo del DM.
- Animación sincronizada y persistencia del último camino.
- Teleport del DM y movimiento de jugadores por el DM.
- Sombreado del último movimiento al seleccionar jugador.

### Fase 5 — Encounter e iniciativas (2–3 semanas)

- Estados OFF/PREPARING/RUNNING.
- Iniciativas, empates ordenados por DM, inicio y avance de turnos.
- Restricción de movimiento al turno propio.
- Participantes añadidos durante combate.
- Turnos retrasados, objetivos, disparadores por muerte/salida y orden manual.
- Vida 0, X roja, ocultamiento y retiro opcional.
- Encuentros simultáneos e independientes en varios escenarios.

### Fase 6 — Endurecimiento y lanzamiento (1–2 semanas)

- Pruebas completas mobile/desktop y navegadores objetivo.
- Accesibilidad básica, feedback offline/reconectando y prevención de acciones duplicadas.
- Optimización de dibujo, imágenes y consultas.
- Backups automáticos y prueba de restauración.
- HTTPS, logs, rotación, monitorización y servicio WebSocket supervisado.
- Prueba piloto de una partida completa y corrección de incidencias.

Estimación inicial: **10–15 semanas** para una persona con dedicación completa, sujeta al cierre de reglas y nivel visual esperado. Puede reducirse priorizando el MVP y dejando turnos retrasados avanzados para una segunda entrega.

## 10. Estrategia de pruebas

### Unitarias

- Permisos por rol.
- Validación de cuadrícula/coordenadas.
- Caminos contiguos, diagonales, bloqueos y ocupación.
- Orden de iniciativa, empates, cambio de ronda y retrasos.
- Reglas de vida 0 y visibilidad.
- Tokens persistentes, revocación y rotación.

### Integración

- Transacciones de activación/desactivación y guardado del estado.
- Restricción de jugador en un solo escenario.
- Dos escenarios con encounters simultáneos sin contaminación de estado.
- Autorización y filtrado de notas/eventos.
- Reconexión WebSocket y deduplicación por `requestId`.
- Caída del DM y recuperación del lease.

### End-to-end

- Registro/autologin, cierre y reingreso persistente.
- DM crea un mapa, pinta, carga fondo y agrega elementos.
- Jugador móvil coloca personaje, hace zoom/pan y solicita movimiento.
- Movimiento que no requiere y otro que sí requiere aprobación.
- Preparar/iniciar encuentro, empatar iniciativas, avanzar y retrasar turno.
- Llevar NPC a 0, ocultarlo al jugador y conservarlo con X para DM.
- Desactivar durante encounter, recargar servidor y reanudar exactamente el estado.

### Rendimiento

- Mapa 60×60 con fondo grande y al menos 200 elementos.
- Varias conexiones de jugadores y cambios frecuentes.
- Objetivo visual de 60 FPS en equipos normales y degradación aceptable en móviles; no redibujar si no cambió la escena.

## 11. Operación y persistencia

- Migraciones versionadas y datos semilla solo para desarrollo.
- Backups diarios de MariaDB y assets, con retención y restauración ensayada.
- Logs estructurados de HTTP, WebSocket, errores y acciones administrativas.
- Supervisor/systemd para reiniciar el proceso WebSocket.
- Al desplegar: drenar o cerrar conexiones con aviso, migrar, reiniciar y forzar resincronización.
- Guardado transaccional inmediato de cada acción relevante; no depender de que el navegador siga abierto.

## 12. Entregables y criterio de MVP

El MVP estará listo cuando:

- DM y jugadores pueden crear cuenta, mantener sesión y cerrar sesión.
- El DM crea y edita mapas, celdas, fondos, objetos, NPC y notas.
- El DM activa varios escenarios y los jugadores ven actualizaciones en tiempo real.
- Cada jugador elige personaje, se coloca en un único escenario y se mueve mediante caminos.
- Aprobaciones, teleports y visibilidad funcionan y respetan roles.
- Encuounter básico soporta preparación, iniciativa, desempate, turnos, vida 0 y persistencia.
- Una recarga, desconexión o reinicio no pierde el estado confirmado.
- La experiencia principal funciona con mouse y pantalla táctil.

Para una segunda iteración pueden quedar: replay de eventos, herramientas avanzadas de dibujo, importación/exportación de campañas, niebla de guerra, medición de distancias y optimizaciones para cantidades extraordinarias de tokens.
