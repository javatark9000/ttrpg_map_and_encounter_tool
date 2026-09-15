<?php
declare(strict_types=1);

use Ttrpg\GameService;

/** Integration regressions: only disposable scenarios and characters created here are changed. */
function testTurnRegressions(
    PDO $db,
    GameService $game,
    array $dm,
    array $player,
    int $campaign,
): void {
    $scenarios = [];
    $characters = [];
    $send = function (
        array $f,
        string $type,
        array $payload = [],
        ?array $user = null,
        ?string $requestId = null,
    ) use ($game, $dm): array {
        return $game->command(
            $user ?? $dm,
            $type,
            ['scenarioId' => $f['sid']] + $payload,
            $requestId ?? req(),
        );
    };
    $fixture = function (?int $playerPosition = null) use (
        $db,
        $campaign,
        $player,
        $send,
        &$scenarios,
        &$characters,
    ): array {
        $db->prepare(
            'INSERT INTO scenarios(campaign_id,name,width,height,active) VALUES (?, ?,20,20,1)',
        )->execute([$campaign, 'Regresión de turnos']);
        $f = ['sid' => (int) $db->lastInsertId(), 'actors' => [], 'parts' => []];
        $scenarios[] = $f['sid'];
        for ($i = 1; $i <= 10; $i++) {
            if ($i === $playerPosition) {
                $db->prepare(
                    'INSERT INTO player_characters(owner_id,campaign_id,name,max_health) VALUES (?,?,?,10)',
                )->execute([$player['id'], $campaign, "Actor $i"]);
                $character = (int) $db->lastInsertId();
                $characters[] = $character;
                $db->prepare(
                    'INSERT INTO scenario_players(scenario_id,user_id,character_id,x,y,health,initiative) VALUES (?,?,?,?,1,10,?)',
                )->execute([$f['sid'], $player['id'], $character, $i, 100 - $i]);
                $kind = 'PLAYER';
            } else {
                $db->prepare(
                    'INSERT INTO npc_characters(scenario_id,name,x,y,health,max_health,initiative) VALUES (?,?,?,1,10,10,?)',
                )->execute([$f['sid'], "Actor $i", $i, 100 - $i]);
                $kind = 'NPC';
            }
            $f['actors'][$i] = ['kind' => $kind, 'id' => (int) $db->lastInsertId()];
        }
        $send($f, 'encounter.prepare');
        $send($f, 'encounter.start');
        $q = $db->prepare('SELECT id FROM encounters WHERE scenario_id=?');
        $q->execute([$f['sid']]);
        $f['eid'] = (int) $q->fetchColumn();
        $q = $db->prepare('SELECT * FROM encounter_participants WHERE encounter_id=?');
        $q->execute([$f['eid']]);
        foreach ($q->fetchAll() as $p) {
            foreach ($f['actors'] as $i => $a) {
                if ($p['actor_type'] === $a['kind'] && (int) $p['actor_id'] === $a['id']) {
                    $f['parts'][$i] = (int) $p['id'];
                }
            }
        }
        return $f;
    };
    $encounter = function (array $f) use ($db): array {
        $q = $db->prepare('SELECT * FROM encounters WHERE id=?');
        $q->execute([$f['eid']]);
        return $q->fetch();
    };
    $part = function (array $f, int $i) use ($db): array {
        $q = $db->prepare('SELECT * FROM encounter_participants WHERE id=?');
        $q->execute([$f['parts'][$i]]);
        return $q->fetch();
    };
    $assertTurn = function (array $f, int $actor, int $round, string $message) use (
        $encounter,
    ): void {
        $e = $encounter($f);
        ok(
            (int) $e['current_participant_id'] === $f['parts'][$actor] &&
                (int) $e['round_no'] === $round,
            $message,
        );
    };
    $kill = fn(array $f, int $i) => $send($f, 'health.set', $f['actors'][$i] + ['health' => 0]);
    $reject = function (callable $action, string $message): void {
        $rejected = false;
        try {
            $action();
        } catch (RuntimeException $e) {
            $rejected = true;
        }
        ok($rejected, $message);
    };

    try {
        $f = $fixture();
        $send($f, 'turn.next');
        $kill($f, 3);
        $send($f, 'turn.next');
        $assertTurn($f, 4, 1, 'muerte del siguiente NPC: 2 → 4, sin reiniciar ronda');

        foreach (['token.delete', 'tokens.delete'] as $delete) {
            $f = $fixture();
            $send($f, 'turn.next');
            $kill($f, 2);
            $send(
                $f,
                $delete,
                $delete === 'token.delete' ? $f['actors'][2] : ['items' => [$f['actors'][2]]],
            );
            $send($f, 'turn.next');
            $assertTurn($f, 3, 1, "$delete conserva la posición del NPC actual eliminado");
        }
        $f = $fixture();
        for ($i = 1; $i < 10; $i++) {
            $send($f, 'turn.next');
        }
        $send($f, 'token.delete', $f['actors'][10]);
        $send($f, 'turn.next');
        $assertTurn($f, 1, 2, 'eliminar al último actual incrementa exactamente una ronda');

        $f = $fixture(3);
        $send($f, 'turn.next');
        $kill($f, 3);
        $send($f, 'turn.next');
        $assertTurn($f, 3, 1, 'jugador caído conserva su turno: no se cambia la regla de juego');

        foreach (['health.set', 'token.delete', 'initiative.set'] as $remove) {
            $f = $fixture();
            $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][3]]);
            $send($f, $remove, $f['actors'][3] + ['health' => 0, 'initiative' => null]);
            $send($f, 'turn.next');
            $assertTurn($f, 1, 1, "$remove del objetivo libera al participante que espera");
            $send($f, 'turn.next');
            $assertTurn($f, 4, 1, 'tras el retrasado se continúa desde la posición del ciclo');
        }

        $f = $fixture();
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][3]]);
        $kill($f, 3);
        $send($f, 'health.set', $f['actors'][3] + ['health' => 10]);
        $send($f, 'turn.next');
        $assertTurn($f, 1, 1, 'curar al objetivo no cancela una espera ya liberada por su muerte');
        $send($f, 'turn.next');
        $assertTurn($f, 3, 1, 'objetivo curado conserva su siguiente turno normal');

        $f = $fixture();
        $send($f, 'turn.next');
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][1]]);
        for ($i = 0; $i < 8; $i++) {
            $send($f, 'turn.next');
        }
        $assertTurn($f, 1, 2, 'retraso hacia la ronda siguiente alcanza el objetivo');
        $send($f, 'turn.next');
        $assertTurn($f, 2, 2, 'objetivo activa al retrasado en ronda 2');
        $send($f, 'turn.next');
        $assertTurn($f, 3, 2, 'el retrasado no vuelve a elegirse a sí mismo');

        $f = $fixture();
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][4], 'sortOrder' => 2]);
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][4], 'sortOrder' => 1]);
        $send($f, 'turn.next');
        $send($f, 'turn.next');
        $assertTurn($f, 2, 1, 'varios retrasados respetan sort_order');
        $send($f, 'turn.next');
        $assertTurn($f, 1, 1, 'la cola pendiente sobrevive al primer retrasado');
        $send($f, 'turn.next');
        $assertTurn($f, 5, 1, 'tras la cola se retoma el ciclo después del objetivo');

        $f = $fixture();
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][3]]);
        $kill($f, 1);
        $send($f, 'turn.next');
        $send($f, 'turn.next');
        $assertTurn($f, 4, 1, 'un retrasado muerto no recibe turno ni resucita');
        ok($part($f, 1)['state'] === 'DEAD', 'retrasado muerto conserva DEAD');
        $send($f, 'health.set', $f['actors'][1] + ['health' => 10]);
        ok($part($f, 1)['state'] === 'ACTIVE', 'curar al NPC restaura su elegibilidad');

        $f = $fixture();
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][3]]);
        $send($f, 'initiative.set', $f['actors'][5] + ['initiative' => 95]);
        ok($part($f, 1)['state'] === 'WAITING', 'guardar iniciativa no reactiva otras esperas');
        $send($f, 'initiative.set', $f['actors'][5] + ['initiative' => null]);
        ok(
            $part($f, 5)['initiative'] === null,
            'quitar iniciativa la elimina también del participante',
        );
        $send($f, 'token.update', $f['actors'][3] + ['health' => 0]);
        ok($part($f, 3)['state'] === 'DEAD', 'token.update no evita la sincronización de muerte');

        $f = $fixture();
        $send($f, 'encounter.prepare');
        $send($f, 'encounter.start', ['participants' => [$f['actors'][1], $f['actors'][2]]]);
        $send($f, 'initiative.set', $f['actors'][1] + ['initiative' => 99]);
        $q = $db->prepare(
            "SELECT state FROM encounter_participants WHERE encounter_id=? AND actor_type='NPC' AND actor_id=?",
        );
        $q->execute([$f['eid'], $f['actors'][3]['id']]);
        ok($q->fetchColumn() === 'REMOVED', 'guardar ficha no reincorpora NPC excluidos');

        $f = $fixture();
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][3]]);
        $send($f, 'encounter.stop');
        $send($f, 'encounter.prepare');
        $send($f, 'encounter.start');
        for ($i = 0; $i < 3; $i++) {
            $send($f, 'turn.next');
        }
        $e = $encounter($f);
        $q = $db->prepare('SELECT actor_id FROM encounter_participants WHERE id=?');
        $q->execute([$e['current_participant_id']]);
        ok(
            (int) $q->fetchColumn() === $f['actors'][4]['id'] && (int) $e['round_no'] === 1,
            'encuentro nuevo no hereda retrasos',
        );

        $f = $fixture();
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][3]]);
        $send($f, 'turn.rollback');
        $assertTurn($f, 1, 1, 'retrasar también guarda historial');
        ok($part($f, 1)['state'] === 'ACTIVE', 'rollback de retraso restaura ACTIVE');
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][3]]);
        $send($f, 'turn.next');
        $send($f, 'turn.next');
        $send($f, 'turn.rollback');
        ok($part($f, 1)['state'] === 'WAITING', 'rollback de activación restaura WAITING');
        $send($f, 'turn.next');
        $assertTurn($f, 1, 1, 'avanzar tras rollback reproduce la misma activación');
        $send($f, 'turn.rollback');
        $kill($f, 1);
        $send($f, 'turn.next');
        $assertTurn($f, 4, 1, 'rollback no permite resucitar a quien murió después');

        $f = $fixture();
        $send($f, 'turn.next');
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][5]]);
        $send($f, 'encounter.restart_round');
        $assertTurn($f, 1, 1, 'reiniciar ronda conserva número y vuelve al primero');
        ok($part($f, 2)['state'] === 'ACTIVE', 'reiniciar ronda limpia esperas');
        $send($f, 'turn.rollback');
        $assertTurn($f, 3, 1, 'rollback de reinicio restaura posición');
        ok($part($f, 2)['state'] === 'WAITING', 'rollback de reinicio restaura esperas');

        $f = $fixture();
        $send($f, 'turn.next');
        $reject(
            fn() => $send($f, 'initiative.set', $f['actors'][2] + ['initiative' => null]),
            'no se puede borrar la iniciativa del cursor en curso',
        );
        ok((int) $part($f, 2)['initiative'] === 98, 'cambio rechazado no altera iniciativa');
        $send($f, 'token.update', $f['actors'][3] + ['visible' => false]);
        $send($f, 'turn.next');
        $assertTurn($f, 3, 1, 'visibilidad no cambia pertenencia al combate');

        $f = $fixture();
        $snapshot = $game->snapshot($f['sid'], $dm);
        $version = (int) $snapshot['scenario']['version'];
        $requestId = req();
        $first = $send($f, 'turn.next', ['expectedVersion' => $version], null, $requestId);
        $repeat = $send($f, 'turn.next', ['expectedVersion' => $version], null, $requestId);
        ok($first === $repeat, 'reintentar requestId no avanza de nuevo');
        $reject(
            fn() => $send($f, 'turn.next', ['expectedVersion' => $version]),
            'dos comandos del mismo snapshot no avanzan dos veces',
        );
        $assertTurn($f, 2, 1, 'avance obsoleto deja intacto el turno');
        $reject(fn() => $send($f, 'turn.next', [], $player), 'jugador no puede avanzar turnos');
        $reject(
            fn() => $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][4]], $player),
            'jugador no puede retrasar un NPC ajeno',
        );

        $f = $fixture();
        foreach (range(2, 10) as $i) {
            $kill($f, $i);
        }
        $send($f, 'turn.next');
        $assertTurn($f, 1, 2, 'un único superviviente recibe una ronda nueva');
        $send($f, 'turn.next');
        $send($f, 'turn.rollback');
        $assertTurn($f, 1, 2, 'rollback restaura también el número de ronda');
        $send($f, 'turn.next');
        $assertTurn($f, 1, 3, 'volver a avanzar incrementa exactamente una ronda');

        $f = $fixture();
        $send($f, 'turn.next');
        $send($f, 'token.delete', $f['actors'][2]);
        $send($f, 'turn.next');
        $send($f, 'turn.rollback');
        ok($part($f, 2)['state'] === 'REMOVED', 'rollback no restaura la ficha eliminada');
        $send($f, 'turn.next');
        $assertTurn($f, 3, 1, 'el ancla eliminada permite avanzar otra vez tras rollback');

        $f = $fixture();
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][3]]);
        $send($f, 'turn.delay', ['targetParticipantId' => $f['parts'][4]]);
        $send($f, 'turn.next');
        $assertTurn($f, 1, 1, 'esperas a distintos objetivos: se resuelve la primera');
        $send($f, 'token.delete', $f['actors'][3]);
        $send($f, 'turn.next');
        $assertTurn($f, 4, 1, 'eliminar el cursor mientras actúa un retrasado conserva el ciclo');
        $send($f, 'turn.next');
        $assertTurn($f, 2, 1, 'la segunda espera se activa con su propio objetivo');
        $send($f, 'turn.next');
        $assertTurn($f, 5, 1, 'no se repiten los turnos normales de los retrasados');

        $other = $fixture();
        $before = $encounter($other);
        $send($f, 'turn.next');
        ok($before === $encounter($other), 'los encuentros de otros escenarios no cambian');
        $reject(
            fn() => $send($f, 'turn.delay', ['targetParticipantId' => $other['parts'][4]]),
            'no se puede esperar a un participante de otro encuentro',
        );
        $playerSnapshot = $game->snapshot($f['sid'], $player);
        ok(
            !array_key_exists('turn_cursor_id', $playerSnapshot['encounter']),
            'el cursor interno no revela turnos NPC a jugadores',
        );

        $f = $fixture();
        foreach (range(1, 10) as $i) {
            $kill($f, $i);
        }
        $send($f, 'turn.next');
        ok(
            $encounter($f)['state'] === 'OFF',
            'sin participantes elegibles el encuentro termina sin bucle',
        );
    } finally {
        foreach ($scenarios as $id) {
            $db->prepare('DELETE FROM scenarios WHERE id=?')->execute([$id]);
        }
        foreach ($characters as $id) {
            $db->prepare('DELETE FROM player_characters WHERE id=?')->execute([$id]);
        }
    }
}
