<?php
declare(strict_types=1);

function uploadAsset(PDO $db, array $user): array
{
    if (!isset($_FILES['image'])) {
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($length > 16 * 1024 * 1024) {
            throw new RuntimeException(
                'La solicitud supera el límite permitido de 15 MB por imagen.',
            );
        }
        throw new RuntimeException('No se recibió ningún archivo.');
    }
    $f = $_FILES['image'];
    if ($f['error'] !== UPLOAD_ERR_OK) {
        $message = match ($f['error']) {
            UPLOAD_ERR_INI_SIZE,
            UPLOAD_ERR_FORM_SIZE
                => 'La imagen supera el límite permitido de 15 MB.',
            UPLOAD_ERR_PARTIAL => 'La carga quedó incompleta. Inténtalo nuevamente.',
            UPLOAD_ERR_NO_FILE => 'Selecciona una imagen antes de continuar.',
            UPLOAD_ERR_NO_TMP_DIR => 'El servidor no tiene un directorio temporal para cargas.',
            UPLOAD_ERR_CANT_WRITE => 'El servidor no pudo escribir el archivo.',
            UPLOAD_ERR_EXTENSION => 'Una extensión del servidor bloqueó la carga.',
            default => 'No se pudo recibir la imagen.',
        };
        throw new RuntimeException($message);
    }
    if ((int) $f['size'] > 15 * 1024 * 1024) {
        throw new RuntimeException('La imagen supera el límite permitido de 15 MB.');
    }
    $info = getimagesize($f['tmp_name']);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!$info || !isset($allowed[$info['mime']])) {
        throw new RuntimeException('Formato no admitido. Usa JPEG, PNG o WebP.');
    }
    $name = bin2hex(random_bytes(24)) . '.' . $allowed[$info['mime']];
    $dir = dirname(__DIR__) . '/storage/uploads';
    if (!is_dir($dir)) {
        mkdir($dir, 0770, true);
    }
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) {
        throw new RuntimeException('No se pudo guardar la imagen.');
    }
    $db->prepare(
        'INSERT INTO assets(owner_id,mime,size_bytes,width,height,path) VALUES (?,?,?,?,?,?)',
    )->execute([$user['id'], $info['mime'], $f['size'], $info[0], $info[1], $name]);
    $id = (int) $db->lastInsertId();
    return ['id' => $id, 'url' => '/api/assets/' . $id];
}
function serveAsset(PDO $db, int $id, array $user): never
{
    $q = $db->prepare('SELECT * FROM assets WHERE id=?');
    $q->execute([$id]);
    $a = $q->fetch();
    if (!$a) {
        throw new HttpError('Imagen inexistente.', 404);
    }
    $allowed = (int) $a['owner_id'] === (int) $user['id'];
    if (!$allowed && $user['role'] === 'DM') {
        $q = $db->prepare(
            'SELECT 1 FROM campaign_members cm WHERE cm.user_id=? AND (EXISTS(SELECT 1 FROM player_characters pc WHERE pc.avatar_asset_id=? AND pc.campaign_id=cm.campaign_id) OR EXISTS(SELECT 1 FROM scenarios s WHERE s.background_asset_id=? AND s.campaign_id=cm.campaign_id) OR EXISTS(SELECT 1 FROM map_objects o JOIN scenarios s ON s.id=o.scenario_id WHERE o.image_asset_id=? AND s.campaign_id=cm.campaign_id) OR EXISTS(SELECT 1 FROM npc_characters n JOIN scenarios s ON s.id=n.scenario_id WHERE n.image_asset_id=? AND s.campaign_id=cm.campaign_id)) LIMIT 1',
        );
        $q->execute([$user['id'], $id, $id, $id, $id]);
        $allowed = (bool) $q->fetchColumn();
    }
    if (!$allowed && in_array($user['role'], ['PLAYER', 'GUEST'], true)) {
        $q = $db->prepare('SELECT 1 WHERE
            EXISTS(SELECT 1 FROM player_characters WHERE avatar_asset_id=? AND owner_id=?)
            OR EXISTS(SELECT 1 FROM scenario_players sp JOIN player_characters pc ON pc.id=sp.character_id JOIN scenarios s ON s.id=sp.scenario_id JOIN campaign_members cm ON cm.campaign_id=s.campaign_id WHERE pc.avatar_asset_id=? AND sp.placed=1 AND s.active=1 AND cm.user_id=?)
            OR EXISTS(SELECT 1 FROM scenarios s JOIN campaign_members cm ON cm.campaign_id=s.campaign_id WHERE s.background_asset_id=? AND s.active=1 AND cm.user_id=?)
            OR EXISTS(SELECT 1 FROM map_objects o JOIN scenarios s ON s.id=o.scenario_id JOIN campaign_members cm ON cm.campaign_id=s.campaign_id WHERE o.image_asset_id=? AND o.visible=1 AND s.active=1 AND cm.user_id=?)
            OR EXISTS(SELECT 1 FROM npc_characters n JOIN scenarios s ON s.id=n.scenario_id JOIN campaign_members cm ON cm.campaign_id=s.campaign_id WHERE n.image_asset_id=? AND n.visible=1 AND n.health>0 AND n.dead_hidden=0 AND s.active=1 AND cm.user_id=?)');
        $q->execute([
            $id,
            $user['id'],
            $id,
            $user['id'],
            $id,
            $user['id'],
            $id,
            $user['id'],
            $id,
            $user['id'],
        ]);
        $allowed = (bool) $q->fetchColumn();
    }
    if (!$allowed) {
        throw new HttpError('Sin acceso a esta imagen.', 403);
    }
    $file = dirname(__DIR__) . '/storage/uploads/' . $a['path'];
    if (!is_file($file)) {
        throw new HttpError('Archivo inexistente.', 404);
    }
    header('Content-Type: ' . $a['mime']);
    header('Cache-Control: private, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    exit();
}
