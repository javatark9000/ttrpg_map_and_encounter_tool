<?php
declare(strict_types=1);

use Ttrpg\Auth;
use Ttrpg\GameService;
use Ttrpg\WebSocketServer;
use Workerman\Connection\TcpConnection;
use Workerman\Worker;

// Capture transport output without opening sockets or running an event loop/timer.
// The caller owns the database fixtures and removes the scenario in its finally block.
function testDiceWebSocket(
    PDO $db,
    GameService $game,
    array $dm,
    array $player,
    array $guest,
    int $scenarioId,
): void {
    $connection = fn(int $id) => new class ($id) extends TcpConnection {
        public array $messages = [];

        public function __construct(int $id)
        {
            $this->id = $id;
        }

        public function send($send_buffer, $raw = false)
        {
            $this->messages[] = json_decode($send_buffer, true, 512, JSON_THROW_ON_ERROR);
            return true;
        }

        public function __destruct() {}
    };
    $sender = $connection(1);
    $dmObserver = $connection(2);
    $guestObserver = $connection(3);
    $otherScenario = $connection(4);
    $worker = (new ReflectionClass(Worker::class))->newInstanceWithoutConstructor();
    $worker->connections = [$sender, $dmObserver, $guestObserver, $otherScenario];
    $server = new WebSocketServer(new Auth($db), $game);
    $meta = new ReflectionProperty(WebSocketServer::class, 'meta');
    $meta->setAccessible(true);
    $meta->setValue($server, [
        1 => ['user' => $player, 'scenario' => $scenarioId],
        2 => ['user' => $dm, 'scenario' => $scenarioId],
        3 => ['user' => $guest, 'scenario' => $scenarioId],
        4 => ['user' => $player, 'scenario' => -1],
    ]);
    $server->attach($worker);
    $request = json_encode([
        'action' => 'dice.roll',
        'scenarioId' => $scenarioId,
        'requestId' => req(),
        'result' => 21, // A client cannot choose the result.
    ]);
    ($worker->onMessage)($sender, $request);
    ok(
        count($sender->messages) === 2,
        'WebSocket entrega inicio y resultado sin esperar un temporizador',
    );
    [$started, $revealed] = $sender->messages;
    ok(
        $started['type'] === 'dice.roll.started' &&
            $revealed['type'] === 'dice.roll.revealed' &&
            (int) $started['rollId'] === (int) $revealed['data']['id'],
        'WebSocket conserva el orden inicio → resultado de la misma tirada',
    );
    ok(
        (int) $revealed['data']['result'] >= 1 && (int) $revealed['data']['result'] <= 20,
        'la revelación inmediata conserva el resultado autoritativo',
    );
    ok(
        $sender->messages === $dmObserver->messages &&
            $sender->messages === $guestObserver->messages,
        'todos los suscriptores reciben la misma tirada inmediata',
    );
    ok(!$otherScenario->messages, 'la tirada no se difunde a otro escenario');
    $query = $db->prepare(
        'SELECT result, revealed_at FROM scenario_dice_rolls WHERE id=? AND scenario_id=?',
    );
    $query->execute([$started['rollId'], $scenarioId]);
    $stored = $query->fetch();
    ok(
        $stored &&
            $stored['revealed_at'] !== null &&
            (int) $stored['result'] === (int) $revealed['data']['result'],
        'el resultado ya está persistido al emitir la revelación',
    );
    $guestObserver->messages = [];
    ($worker->onMessage)($guestObserver, $request);
    ok(
        count($guestObserver->messages) === 1 &&
            $guestObserver->messages[0]['type'] === 'command.error',
        'la revelación inmediata no permite lanzar al invitado',
    );
    ($worker->onMessage)($otherScenario, $request);
    ok(
        count($otherScenario->messages) === 1 &&
            $otherScenario->messages[0]['type'] === 'command.error' &&
            count($sender->messages) === 2,
        'se rechaza lanzar sin suscripción y no se emiten tiradas inválidas',
    );
}
