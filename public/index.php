<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';
require dirname(__DIR__) . '/src/Http/common.php';
require dirname(__DIR__) . '/src/Http/codex.php';
require dirname(__DIR__) . '/src/Http/assets.php';

use Ttrpg\Auth;
use Ttrpg\Database;
use Ttrpg\GameService;

$db = Database::connection();
$auth = new Auth($db);
$game = new GameService($db);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'];

// El servidor integrado usa este archivo como router. Dejar que sirva los
// archivos estáticos existentes para conservar su MIME correcto.
if (PHP_SAPI === 'cli-server' && $path !== '/' && is_file(__DIR__ . $path)) {
    return false;
}

if (!str_starts_with($path, '/api/')) {
    ensureCsrf();
    readfile(__DIR__ . '/app.html');
    exit();
}

try {
    $body = [];
    if (str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
        $rawBody = file_get_contents('php://input');
        if (trim($rawBody) !== '') {
            $decoded = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($decoded)) {
                throw new RuntimeException('El cuerpo JSON debe ser un objeto.');
            }
            $body = $decoded;
        }
    }
    if ($method !== 'GET' && !in_array($path, ['/api/auth/login', '/api/auth/register'], true)) {
        verifyCsrf();
    }

    if ($path === '/api/auth/register' && $method === 'POST') {
        jsonOut(['user' => $auth->register($body)]);
    }
    if ($path === '/api/auth/login' && $method === 'POST') {
        jsonOut([
            'user' => $auth->login(
                (string) ($body['email'] ?? ''),
                (string) ($body['password'] ?? ''),
            ),
        ]);
    }
    if ($path === '/api/auth/guest' && $method === 'POST') {
        jsonOut(['user' => $auth->guest()]);
    }
    if ($path === '/api/auth/logout' && $method === 'POST') {
        $auth->logout($_COOKIE[Auth::COOKIE] ?? null);
        jsonOut(['ok' => true]);
    }
    if ($path === '/api/me' && $method === 'GET') {
        ensureCsrf();
        jsonOut(['user' => $auth->current()]);
    }

    $user = $auth->current();
    if (!$user) {
        throw new HttpError('Debes iniciar sesión.', 401);
    }
    if ($path === '/api/bootstrap' && $method === 'GET') {
        jsonOut($game->bootstrap($user));
    }
    if ($path === '/api/codex/categories' && $method === 'GET') {
        jsonOut(codexCategories($db, $user));
    }
    if ($path === '/api/codex/category-records' && $method === 'GET') {
        jsonOut(
            codexCategoryRecords(
                $db,
                $user,
                (string) ($_GET['category'] ?? ''),
                (string) ($_GET['q'] ?? ''),
                (int) ($_GET['page'] ?? 1),
                (int) ($_GET['limit'] ?? 15),
            ),
        );
    }
    if ($path === '/api/codex/action' && $method === 'GET') {
        jsonOut(codexActionDetail($db, $user, (int) ($_GET['id'] ?? 0)));
    }
    if ($path === '/api/codex/record' && $method === 'GET') {
        jsonOut(
            codexRecordDetail(
                $db,
                $user,
                (string) ($_GET['category'] ?? ''),
                (int) ($_GET['id'] ?? 0),
            ),
        );
    }
    if (preg_match('#^/api/codex/media/(\d+)$#', $path, $m) && $method === 'GET') {
        serveCodexMedia($db, (int) $m[1], $user);
    }
    if ($path === '/api/codex/customization/options' && $method === 'GET') {
        requireDm($user);
        jsonOut(codexCustomizationOptions($db));
    }
    if ($path === '/api/codex/records' && $method === 'GET') {
        requireDm($user);
        jsonOut(codexRecords($db, (string) ($_GET['kind'] ?? ''), (string) ($_GET['q'] ?? '')));
    }
    if ($path === '/api/codex/customize' && $method === 'POST') {
        requireDm($user);
        jsonOut(createCustomCodexRecord($db, $user, $body), 201);
    }
    if ($path === '/api/codex/customize/media' && $method === 'POST') {
        requireDm($user);
        jsonOut(uploadCustomCodexMedia($db, $user), 201);
    }
    if (
        preg_match('#^/api/codex/customize/(creature|item|spell)/(\d+)$#', $path, $m) &&
        $method === 'PATCH'
    ) {
        requireDm($user);
        jsonOut(updateCustomCodexRecord($db, $user, $m[1], (int) $m[2], $body));
    }
    if (
        preg_match('#^/api/codex/customize/creature/(\d+)/deactivate$#', $path, $m) &&
        $method === 'POST'
    ) {
        requireDm($user);
        jsonOut(deactivateCustomCreature($db, (int) $m[1]));
    }
    if (preg_match('#^/api/scenarios/(\d+)/snapshot$#', $path, $m) && $method === 'GET') {
        jsonOut($game->snapshot((int) $m[1], $user));
    }
    if (preg_match('#^/api/scenarios/(\d+)/encounter-log$#', $path, $m) && $method === 'GET') {
        requireDm($user);
        $csv = $game->downloadEncounterLog((int) $m[1], $user);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="encounter-' . $m[1] . '-log.csv"');
        echo $csv;
        exit();
    }
    if (preg_match('#^/api/scenarios/(\d+)/chats$#', $path, $m) && $method === 'GET') {
        jsonOut(['threads' => $game->chatThreads((int) $m[1], $user)]);
    }
    if (preg_match('#^/api/chats/(\d+)/messages$#', $path, $m) && $method === 'GET') {
        jsonOut($game->chatMessages((int) $m[1], $user));
    }

    if ($path === '/api/scenarios' && $method === 'POST') {
        requireDm($user);
        $w = (int) ($body['width'] ?? 25);
        $h = (int) ($body['height'] ?? 25);
        if ($w < 5 || $w > 60 || $h < 5 || $h > 60) {
            throw new RuntimeException('El mapa debe medir entre 5 y 60 casillas.');
        }
        $cid = (int) ($body['campaignId'] ?? 0);
        assertMember($db, $cid, (int) $user['id']);
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            throw new RuntimeException('Escribe un nombre.');
        }
        $q = $db->prepare('INSERT INTO scenarios(campaign_id,name,width,height) VALUES (?,?,?,?)');
        $q->execute([$cid, $name, $w, $h]);
        jsonOut(['id' => (int) $db->lastInsertId()], 201);
    }
    if (preg_match('#^/api/scenarios/(\d+)$#', $path, $m) && $method === 'PATCH') {
        requireDm($user);
        $id = (int) $m[1];
        $q = $db->prepare(
            'UPDATE scenarios SET name=? WHERE id=? AND campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id=?)',
        );
        $q->execute([trim((string) $body['name']), $id, $user['id']]);
        jsonOut(['ok' => true]);
    }
    if ($path === '/api/characters' && $method === 'POST') {
        if ($user['role'] !== 'PLAYER') {
            throw new RuntimeException('Solo un jugador crea personajes.');
        }
        $cid = (int) ($body['campaignId'] ?? 0);
        assertMember($db, $cid, (int) $user['id']);
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            throw new RuntimeException('Escribe un nombre.');
        }
        $hp = max(1, (int) ($body['maxHealth'] ?? 10));
        $db->prepare(
            'INSERT INTO player_characters(owner_id,campaign_id,name,max_health) VALUES (?,?,?,?)',
        )->execute([$user['id'], $cid, $name, $hp]);
        jsonOut(['id' => (int) $db->lastInsertId()], 201);
    }
    if ($path === '/api/assets' && $method === 'POST') {
        jsonOut(uploadAsset($db, $user), 201);
    }
    if (preg_match('#^/api/assets/(\d+)$#', $path, $m) && $method === 'GET') {
        serveAsset($db, (int) $m[1], $user);
    }
    if (preg_match('#^/api/scenarios/(\d+)/background$#', $path, $m) && $method === 'POST') {
        requireDm($user);
        $asset = (int) ($body['assetId'] ?? 0);
        $db->prepare('UPDATE scenarios SET background_asset_id=? WHERE id=?')->execute([
            $asset,
            (int) $m[1],
        ]);
        jsonOut(['ok' => true]);
    }
    if (preg_match('#^/api/characters/(\d+)/avatar$#', $path, $m) && $method === 'POST') {
        $asset = (int) ($body['assetId'] ?? 0);
        $db->prepare(
            'UPDATE player_characters SET avatar_asset_id=? WHERE id=? AND owner_id=?',
        )->execute([$asset, (int) $m[1], $user['id']]);
        jsonOut(['ok' => true]);
    }
    throw new HttpError('Ruta no encontrada.', 404);
} catch (HttpError $e) {
    jsonOut(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log((string) $e);
    jsonOut(['error' => $e instanceof RuntimeException ? $e->getMessage() : 'Error interno.'], 400);
}
