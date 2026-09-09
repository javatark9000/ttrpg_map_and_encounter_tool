<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

use Ttrpg\Auth;
use Ttrpg\Database;
use Ttrpg\GameService;
use Ttrpg\WebSocketServer;
use Workerman\Worker;

$runtimeDir = dirname(__DIR__) . '/storage/workerman';
if (!is_dir($runtimeDir) && !mkdir($runtimeDir, 0770, true) && !is_dir($runtimeDir)) {
    throw new RuntimeException("No se pudo crear el directorio de ejecución $runtimeDir");
}
Worker::$pidFile = $runtimeDir . '/websocket.pid';
Worker::$logFile = $runtimeDir . '/workerman.log';

$host = $_ENV['WS_HOST'] ?? '0.0.0.0';
$port = (int) ($_ENV['WS_PORT'] ?? 8081);
$db = Database::connection();
$worker = new Worker("websocket://$host:$port");
$worker->name = 'ttrpg-websocket';
$worker->count = 1;
(new WebSocketServer(new Auth($db), new GameService($db)))->attach($worker);
echo "WebSocket configurado en $host:$port\n";
Worker::runAll();
