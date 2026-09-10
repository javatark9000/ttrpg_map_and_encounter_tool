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
- Colocación simultánea y control independiente de varios personajes por jugador, con caminos diagonales celda a celda y aprobación del DM al cruzar bloqueos/actores vivos.
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

Esto inicia la aplicación en el puerto 8080, WebSocket en 8081 y MariaDB en 3306. La primera creación del volumen ejecuta `database/schema.sql`, carga los datasets adicionales de `database/private/` y enlaza las imágenes de `storage/media/`. El servicio `db-migrate` queda disponible únicamente para migraciones futuras y registra su ejecución en `schema_migrations`.

Para reconstruir exclusivamente el entorno de pruebas desde cero:

```bash
docker compose down -v
docker compose up -d --build
```

El primer comando elimina los volúmenes y sus datos; no debe ejecutarse sobre producción. Cambiar obligatoriamente `DM_INVITE_CODE` en `.env`.

## Datos privados y media

Los datos locales no se incorporan a la imagen: Docker los monta en modo lectura desde `database/` y `storage/media/`. Durante el arranque:

1. `codex-data-init` ejecuta cada seed junto a su transformación y aplica `database/post_import_normalization.sql`.
2. `media-init` copia los WebP de `storage/media/codex/tokens/webp/` al volumen `uploads`.
3. `codex-media-init` registra y enlaza las imágenes mediante `rules_revision` y `srd_index`, sin depender de IDs autoincrementales.

La tabla `data_imports` evita volver a cargar el mismo dataset en cada arranque. Si cambia el contenido de los seeds, incrementa `IMPORT_NAME` en `docker-compose.yml`. `./bin/load-private-data.sh` queda como acceso directo para construir e iniciar todo el conjunto de servicios.

Los PNG de origen no se duplican porque la aplicación usa las rutas WebP registradas en `media_assets`. Para forzar una recarga completa de imágenes, elimina del volumen el archivo `codex/tokens/webp/.seed-complete` y recrea `media-init` y `codex-media-init`.

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

- `public/index.php`: punto de entrada y tabla de rutas HTTP.
- `public/assets/app.js`: sesión, escenarios, Canvas y encuentros.
- `public/assets/js/`: estado y módulos enfocados de interfaz.
- `src/Http/`: implementaciones HTTP de Codex, assets y utilidades comunes.
- `src/Auth.php`: sesiones persistentes.
- `src/GameService.php`: reglas y transacciones autoritativas.
- `src/WebSocketServer.php`: autenticación, comandos y difusión.
- `database/schema.sql`: esquema MariaDB.
- `bin/websocket.php`: proceso WebSocket Workerman.
- `docs/ARCHITECTURE.md`: mapa para localizar cada tipo de cambio.
- `PLAN_IMPLEMENTACION.md`: planificación y decisiones del proyecto.

## Desarrollo y validación

Instalar las herramientas de formato una vez con `npm ci`. Prettier mantiene legibles los archivos PHP, JavaScript, HTML y CSS.

```bash
npm run format:check
composer test
composer audit
find src public bin tests -name '*.php' -print0 | xargs -0 -n1 php -l
node --check public/assets/app.js
find public/assets/js -name '*.js' -print0 | xargs -0 -n1 node --check
```
