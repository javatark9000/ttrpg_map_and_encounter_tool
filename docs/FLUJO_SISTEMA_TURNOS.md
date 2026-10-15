# Flujo del sistema de turnos

Este diagrama representa el comportamiento actual del sistema una vez que el encounter ya está en estado `RUNNING`.

```mermaid
flowchart TD
    START[Encounter iniciado] --> INIT[Ronda N = 1<br/>Secuencia S = 1]
    INIT --> CURRENT[Turno del participante actual]
    CURRENT --> ACTION{¿Qué ocurre durante el turno?}

    ACTION -->|Acciones o movimiento| MOVE{¿La acción está autorizada?}
    MOVE -->|Sí| APPLY[Aplicar acción o dejar<br/>solicitud de movimiento]
    MOVE -->|No| REJECT[Rechazar acción]
    APPLY --> CURRENT
    REJECT --> CURRENT

    ACTION -->|Retrasar turno| DELAY{¿Usuario y objetivo válidos?}
    DELAY -->|No| REJECT
    DELAY -->|Sí| WAIT[Actual pasa a WAITING<br/>y se registra objetivo y ronda]
    WAIT --> NORMAL

    ACTION -->|DM: Siguiente turno| HISTORY[Guardar N, S y participante<br/>actual en el historial]
    HISTORY --> PENDING{¿Hay un retrasado pendiente<br/>vinculado al turno finalizado?}
    PENDING -->|Sí| ACTIVATE[Retrasado vuelve a ACTIVE<br/>y pasa a ser el actual]
    ACTIVATE --> SAME_ROUND[N no cambia]
    SAME_ROUND --> INCSEQ[S ← S + 1]
    INCSEQ --> CURRENT
    PENDING -->|No| NORMAL[Recorrer el orden de iniciativa]

    subgraph CYCLE[Avance normal y ciclo de rondas]
        NORMAL --> ORDER[Iniciativa DESC<br/>tie_order ASC · ID ASC]
        ORDER --> NEXT[Buscar siguiente ACTIVE<br/>y omitir WAITING, DEAD y REMOVED]
        NEXT --> WRAP{¿El siguiente está al inicio<br/>o antes que el anterior?}
        WRAP -->|No| KEEP[N se mantiene]
        WRAP -->|Sí| ROUND[N ← N + 1<br/>Comienza una ronda nueva]
        KEEP --> ASSIGN[Asignar nuevo participante actual]
        ROUND --> ASSIGN
        ASSIGN --> SEQUENCE[S ← S + 1]
    end

    SEQUENCE --> CURRENT

    ACTION -->|DM: Reiniciar ronda| RESTART_HISTORY[Guardar estado en historial]
    RESTART_HISTORY --> FIRST[Elegir el primer ACTIVE]
    FIRST --> RESTART_COUNT[N no cambia<br/>S ← S + 1]
    RESTART_COUNT --> CURRENT

    ACTION -->|DM: Devolver turno| ROLLBACK{¿Existe historial?}
    ROLLBACK -->|No| REJECT
    ROLLBACK -->|Sí| RESTORE[Restaurar N, S y participante<br/>del último registro]
    RESTORE --> CURRENT

    ACTION -->|DM: Terminar encounter| OFF[Estado OFF<br/>sin participante actual]
```

## Reglas del ciclo

- El orden normal es iniciativa descendente, seguido de `tie_order` e ID ascendentes.
- Solo los participantes con estado `ACTIVE` reciben un turno normal.
- El DM es quien ejecuta `turn.next`, `turn.rollback` y `encounter.restart_round`.
- Un jugador puede ejecutar `turn.delay` únicamente durante el turno de uno de sus personajes.
- Si el objetivo del retraso aparece antes o en la misma posición que el participante actual, el retraso se agenda para la ronda siguiente.
- `turn_sequence` aumenta con cada avance y sirve como contador absoluto; `round_no` solo aumenta al volver al inicio del orden.
- Durante `RUNNING`, el servidor rechaza el movimiento de un personaje que no tenga el turno actual.

## Persistencia y sincronización

Cada comando se procesa dentro de una transacción en `GameService`. Tras aceptarlo:

1. Se actualiza el estado del encounter en MariaDB.
2. Se incrementa `scenarios.version`.
3. Se registra el evento y el recibo idempotente del `requestId`.
4. WebSocket envía `refresh` a los clientes del escenario.
5. Cada cliente solicita un snapshot nuevo y vuelve a renderizar el turno actual.

> Nota: el diagrama documenta la implementación actual. Devolver un turno restaura participante, ronda y secuencia, pero actualmente no revierte los cambios realizados en `turn_delays` ni los estados `WAITING`/`ACTIVE` asociados.
