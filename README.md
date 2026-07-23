# TTRPG Manager

Aplicación web responsive para administrar mapas, jugadores y encuentros de juegos de rol de mesa. Usa PHP, MariaDB, JavaScript, Canvas HTML5 y WebSocket.

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

Esto inicia la aplicación en el puerto 8080, WebSocket en 8081 y MariaDB en 3306. La primera creación del volumen ejecuta `database/schema.sql`; el servicio `db-migrate` aplica una sola vez todos los archivos de `database/migrations/` y registra el resultado en `schema_migrations`.

Cambiar obligatoriamente `DM_INVITE_CODE` en `.env`.

## Datos privados y media

Los datos generados locales de `database/private/` y las imágenes de `storage/media/` no se incorporan a la imagen Docker. Para cargarlos en una base inicializada:

```bash
./bin/load-private-data.sh
```

El cargador ejecuta cada seed junto a su transformación, vuelve a aplicar las normalizaciones dependientes de datos y enlaza las imágenes mediante `rules_revision` y `srd_index`, sin depender de IDs autoincrementales. Los SQL privados se transmiten directamente a MariaDB y no quedan dentro de los contenedores.

El servicio de una sola ejecución `media-init` copia los WebP usados por el códice desde `storage/media/codex/tokens/webp/` al volumen `uploads`, bajo `/app/storage/uploads/codex/tokens/webp/`. Los PNG de origen no se duplican porque la aplicación sirve las rutas WebP registradas en `media_assets`. Para forzar una recarga completa de media, eliminar del volumen el archivo `codex/tokens/webp/.seed-complete` y volver a ejecutar `docker compose up -d`.

## Ejecutar

Con Docker Compose:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app websocket
```

Abrir <http://localhost:8080>. Desde otro dispositivo de la red local, usar la IP del equipo, por ejemplo `http://192.168.100.71:8080`; los puertos TCP 8080 y 8081 deben estar permitidos por el firewall. El WebSocket acepta el mismo hostname con el que se abrió la aplicación. Para detener los servicios: `docker compose down`. Los datos se conservan en volúmenes Docker.

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
