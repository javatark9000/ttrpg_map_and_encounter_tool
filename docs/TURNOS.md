# Motor de turnos: reglas y actualización

La autoridad sigue en `src/GameService.php`. Los cambios de encuentro se serializan con el bloqueo del escenario y se persisten en una transacción.

## Ciclo

- `current_participant_id`: quien tiene el turno, normal o retrasado.
- `turn_cursor_id`: posición del ciclo normal. No cambia mientras se atiende una cola de retrasados.
- `last_turn_round`: última ronda en que se asignó un turno al participante. Evita volver a asignarle su posición normal tras un turno retrasado en esa misma ronda.
- El orden es iniciativa descendente, desempate manual ascendente e ID ascendente.
- Al volver al principio del orden se incrementa `round_no`. Cada asignación incrementa `turn_sequence`.
- Solo `ACTIVE` con iniciativa recibe un turno normal. Sin participantes elegibles ni retrasados listos, el encuentro termina en `OFF`.

## Muerte, eliminación y visibilidad

- Un NPC con vida <= 0 queda `DEAD`. Curarlo lo devuelve a `ACTIVE`, sin conceder un turno normal adicional si ya actuó en esa ronda.
- Un jugador caído conserva su turno: esta actualización no cambia la regla de juego existente.
- Eliminar un NPC retira su ficha, pero conserva su participante como `REMOVED` hasta preparar otro encuentro. Así no se pierde la posición del ciclo ni las referencias del historial.
- Ocultar una ficha no equivale a retirarla del combate. La lista del DM sigue mostrándola con la indicación «Oculto»; también distingue «Esperando» y «Muerto».

## Esperas y devolución de turnos

- Un retrasado pasa a `WAITING` hasta que termina su objetivo o este deja de estar disponible por muerte, retirada o falta de iniciativa.
- La cola se procesa al avanzar; bajar vida o eliminar una ficha no termina por sí solo el turno actual.
- Los retrasados listos se atienden por `sort_order` e ID. Después se continúa desde el cursor normal, no desde la iniciativa del retrasado.
- Un retrasado muerto o retirado no se reactiva.
- Preparar/iniciar/terminar un encuentro limpia las esperas anteriores. Reiniciar ronda también limpia las esperas y las marcas de turnos asignados, conservando el número de ronda.
- El historial guarda cursor, marcas de ronda y cola de esperas. Devolver turno restaura esa planificación, no la vida, movimientos, eliminaciones ni cambios de iniciativa posteriores.

## Edición y sincronización

- Guardar la ficha solo envía iniciativa si cambió. El servidor actualiza únicamente ese participante, sin reincorporar NPC excluidos ni reactivar otras esperas.
- Quitar iniciativa excluye del avance normal. Para cambiar la iniciativa del cursor en curso hay que avanzar antes; el servidor rechaza el cambio en lugar de perder la posición.
- El navegador bloquea nuevos comandos de turno desde el envío hasta recibir el snapshot confirmado. Envía `expectedVersion` para que el servidor rechace cambios basados en un estado antiguo. Los clientes que no envían este campo conservan compatibilidad, pero no tienen esa protección contra comandos obsoletos.
- Los reintentos con el mismo `requestId` son idempotentes, también bajo el bloqueo del escenario.

## Instalaciones existentes

Aplicar **una vez**, con la aplicación y WebSocket detenidos:

`database/migrations/001_encounter_turn_cursor.sql`

El servicio `db-migrate` del proyecto registra su aplicación. La migración también admite un esquema nuevo que ya contenga las columnas, por lo que no falla después de una instalación desde `database/schema.sql`.

Con Docker Compose, para una instalación ya inicializada:

```bash
docker compose stop app websocket
docker compose run --rm db-migrate
docker compose up -d --build --no-deps app websocket
```

No continuar con el arranque si falla la migración. No borrar el volumen de MariaDB.

Después de actualizar, volver a preparar/iniciar los encuentros que estuvieran en curso y recargar los navegadores. El historial anterior no contiene la planificación completa; no puede reconstruirse de forma fiable. La actualización no ejecuta la migración sobre los datos de partida automáticamente desde PHP.
