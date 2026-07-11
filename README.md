# D&D Manager

Aplicación web responsive para administrar mapas, jugadores y encounters de una mesa de Dungeons & Dragons. Usa PHP, MariaDB, JavaScript, Canvas HTML5 y WebSocket.

## Funcionalidad implementada

- Registro, autologin, login, logout y sesión persistente revocable.
- Roles DM/jugador y lease que admite un único DM conectado.
- Varios personajes por jugador y avatar por personaje.
- Escenarios persistentes de 5×5 a 60×60, activación simultánea y confirmación al desactivar.
- Fondo de mapa, celdas bloqueadas, notas de celda, objetos y NPC visibles/ocultos.
- Canvas con pan, zoom, rueda, Pointer Events y pinch-to-zoom.
- Agrupación de tokens y pila con contador cuando hay cuatro o más.
- Colocación en un único escenario, caminos diagonales celda a celda y aprobación del DM al cruzar bloqueos/actores vivos.
- Teleport del DM, vida, iniciativa, preparación/inicio/fin de combate y cambio de turno.
- Desempate manual soportado por el backend y turnos retrasados vinculados.
- Ocultamiento de NPC con vida 0 para jugadores y X roja para el DM.
- Estado independiente por escenario, eventos versionados, comandos idempotentes y resincronización por snapshot.

## Requisitos

- PHP 8.0+ con PDO MySQL, mbstring, fileinfo y GD.
- Composer.
- MariaDB 10.11+ (se incluye Docker Compose).

## Instalación

```bash
cp .env.example .env
docker compose up -d --build
```

Esto inicia la aplicación en el puerto 8080, WebSocket en 8081 y MariaDB en 3306. La primera creación del volumen ejecuta `database/schema.sql`. Si se cambia el esquema durante desarrollo, recrear la base:

```bash
docker compose down -v
docker compose up -d mariadb
```

Cambiar obligatoriamente `DM_INVITE_CODE` en `.env`.

## Ejecutar

Con Docker Compose:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app websocket
```

Abrir <http://localhost:8080>. Para detener los servicios: `docker compose down`. Los datos se conservan en volúmenes Docker.

Para desarrollo sin contenerizar PHP, se puede usar `composer install`, `composer serve` y `composer websocket start`, manteniendo MariaDB activa.

Si se sirve con otro host/puerto, actualizar `APP_ORIGIN`. Para producción, modificar la etiqueta `meta[name=ws-url]` en `public/app.html` o publicar el puerto 8081 detrás del reverse proxy.

## Producción

- Usar HTTPS y WSS detrás de Nginx/Apache.
- No usar el servidor integrado de PHP.
- Mantener `storage/uploads` fuera de ejecución y con permisos mínimos.
- Ejecutar `php bin/websocket.php start` mediante un supervisor.
- Programar backups de la base y `storage/uploads` y verificar su restauración.
- Establecer cookies `Secure` mediante HTTPS y una política CSP en el reverse proxy.

## Estructura

- `public/`: router HTTP, interfaz y Canvas.
- `src/Auth.php`: sesiones persistentes.
- `src/GameService.php`: reglas y transacciones autoritativas.
- `src/WebSocketServer.php`: autenticación, comandos y difusión.
- `database/schema.sql`: esquema MariaDB.
- `bin/websocket.php`: proceso WebSocket Workerman.
- `PLAN_IMPLEMENTACION.md`: planificación y decisiones del proyecto.

## Validación

```bash
composer test
composer audit
find src public bin tests -name '*.php' -print0 | xargs -0 -n1 php -l
node --check public/assets/app.js
```
