<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

use Ttrpg\Database;

$manifestPath = $argv[1] ?? '-';
$json = $manifestPath === '-' ? stream_get_contents(STDIN) : file_get_contents($manifestPath);
if ($json === false || trim($json) === '') {
    fwrite(STDERR, "No se pudo leer el manifiesto de media.\n");
    exit(1);
}

$manifest = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
$matches = $manifest['matches'] ?? null;
if (!is_array($matches)) {
    fwrite(STDERR, "El manifiesto no contiene una lista matches válida.\n");
    exit(1);
}

$uploads = realpath(dirname(__DIR__) . '/storage/uploads');
if ($uploads === false) {
    fwrite(STDERR, "No existe storage/uploads dentro del contenedor.\n");
    exit(1);
}

$db = Database::connection();
$db->beginTransaction();

try {
    $driverId = (int)$db->query("SELECT id FROM media_storage_drivers WHERE code='local'")->fetchColumn();
    $visibilityId = (int)$db->query("SELECT id FROM visibility_levels WHERE code='dm_only'")->fetchColumn();
    $purposes = $db->query("SELECT code,id FROM media_purposes WHERE code IN ('token','portrait')")->fetchAll(PDO::FETCH_KEY_PAIR);
    if (!$driverId || !$visibilityId || count($purposes) !== 2) {
        throw new RuntimeException('Faltan catálogos de media; ejecuta primero las migraciones.');
    }

    $findCreature = $db->prepare(
        "SELECT c.id
         FROM creatures c
         JOIN systems s ON s.id=c.system_id AND s.code='dnd_5e'
         WHERE c.rules_revision=? AND c.srd_index=? AND c.is_active=1
         ORDER BY c.is_custom, c.id
         LIMIT 1"
    );
    $findAsset = $db->prepare('SELECT id FROM media_assets WHERE storage_path=? ORDER BY id LIMIT 1');
    $insertAsset = $db->prepare(
        'INSERT INTO media_assets
         (storage_driver_id,original_filename,title,alt_text,storage_path,mime_type,size_bytes,sha256,is_private,is_active)
         VALUES (?,?,?,?,?,?,?,?,1,1)'
    );
    $updateAsset = $db->prepare(
        'UPDATE media_assets SET original_filename=?,title=?,alt_text=?,mime_type=?,size_bytes=?,sha256=?,is_active=1 WHERE id=?'
    );
    $linkAsset = $db->prepare(
        'INSERT INTO codex_media_links
         (media_asset_id,entity_type,entity_id,media_purpose_id,visibility_level_id,title,sort_order,is_primary)
         VALUES (?,\'creature\',?,?,?,?,0,1)
         ON DUPLICATE KEY UPDATE visibility_level_id=VALUES(visibility_level_id),title=VALUES(title),is_primary=1'
    );

    $linked = 0;
    $missingCreatures = [];
    $missingFiles = [];

    foreach ($matches as $match) {
        $revision = (string)($match['rules_revision'] ?? '');
        $index = (string)($match['srd_index'] ?? '');
        $storagePath = str_replace('\\', '/', (string)($match['storage_path'] ?? ''));
        if ($revision === '' || $index === '' || $storagePath === '' || str_contains($storagePath, '..')) {
            continue;
        }

        $findCreature->execute([$revision, $index]);
        $creatureId = (int)$findCreature->fetchColumn();
        if (!$creatureId) {
            $missingCreatures[] = "$revision:$index";
            continue;
        }

        $absolutePath = realpath($uploads . '/' . $storagePath);
        if ($absolutePath === false || !str_starts_with($absolutePath, $uploads) || !is_file($absolutePath)) {
            $missingFiles[] = $storagePath;
            continue;
        }

        $title = trim((string)($match['name'] ?? $index)) . ' token';
        $filename = (string)($match['original_filename'] ?? basename($storagePath));
        $mime = (string)($match['mime_type'] ?? 'image/webp');
        $size = (int)($match['size_bytes'] ?? filesize($absolutePath));
        $sha256 = (string)($match['sha256'] ?? '');

        $findAsset->execute([$storagePath]);
        $assetId = (int)$findAsset->fetchColumn();
        if ($assetId) {
            $updateAsset->execute([$filename, $title, $title, $mime, $size, $sha256 ?: null, $assetId]);
        } else {
            $insertAsset->execute([$driverId, $filename, $title, $title, $storagePath, $mime, $size, $sha256 ?: null]);
            $assetId = (int)$db->lastInsertId();
        }

        foreach (['token', 'portrait'] as $purpose) {
            $linkAsset->execute([$assetId, $creatureId, (int)$purposes[$purpose], $visibilityId, $title]);
        }
        $linked++;
    }

    $db->commit();
    printf("Media enlazado: %d; criaturas no encontradas: %d; archivos no encontrados: %d\n", $linked, count($missingCreatures), count($missingFiles));
    if ($missingCreatures) {
        fwrite(STDERR, 'Sin criatura: ' . implode(', ', array_slice($missingCreatures, 0, 20)) . "\n");
    }
    if ($missingFiles) {
        fwrite(STDERR, 'Sin archivo: ' . implode(', ', array_slice($missingFiles, 0, 20)) . "\n");
    }
    exit($missingFiles ? 2 : 0);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
