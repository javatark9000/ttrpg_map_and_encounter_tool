<?php
declare(strict_types=1);

namespace Ttrpg;

use PDO;
use RuntimeException;

final class GameService
{
    public function __construct(private PDO $db) {}

    public function bootstrap(array $user): array
    {
        $campaigns = $this->all(
            'SELECT c.* FROM campaigns c JOIN campaign_members m ON m.campaign_id=c.id WHERE m.user_id=? ORDER BY c.id',
            [$user['id']],
        );
        $characters =
            $user['role'] === 'PLAYER'
                ? $this->all(
                    'SELECT p.*,a.path avatar_path,(SELECT sp.token_color FROM scenario_players sp WHERE sp.character_id=p.id AND sp.token_color IS NOT NULL ORDER BY sp.id DESC LIMIT 1) token_color FROM player_characters p LEFT JOIN assets a ON a.id=p.avatar_asset_id WHERE p.owner_id=?',
                    [$user['id']],
                )
                : [];
        $scenarioSql =
            'SELECT s.*,a.path background_path FROM scenarios s LEFT JOIN assets a ON a.id=s.background_asset_id WHERE s.campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id=?) AND s.is_deleted=0';
        if ($user['role'] !== 'DM') {
            $scenarioSql .= ' AND s.active=1';
        }
        $scenarioSql .= ' ORDER BY s.active DESC,s.name';
        $scenarios = $this->all($scenarioSql, [$user['id']]);
        foreach ($scenarios as &$s) {
            $s['id'] = (int) $s['id'];
            $s['width'] = (int) $s['width'];
            $s['height'] = (int) $s['height'];
            $s['active'] = (bool) $s['active'];
        }
        return compact('campaigns', 'characters', 'scenarios');
    }

    public function snapshot(int $scenarioId, array $user): array
    {
        $s = $this->one(
            'SELECT s.*,a.path background_path FROM scenarios s LEFT JOIN assets a ON a.id=s.background_asset_id WHERE s.id=?',
            [$scenarioId],
        );
        if (!$s || !empty($s['is_deleted'])) {
            throw new RuntimeException('Escenario inexistente.');
        }
        $this->assertMember((int) $s['campaign_id'], (int) $user['id']);
        if ($user['role'] !== 'DM' && !(bool) $s['active']) {
            throw new RuntimeException('El escenario no está activo.');
        }
        $this->ensureMapFocusTable();
        $mapFocus =
            $this->one(
                'SELECT x,y,width_cells,height_cells FROM scenario_map_focus WHERE scenario_id=?',
                [$scenarioId],
            ) ?:
            null;
        $blocked = $this->all('SELECT x,y FROM blocked_cells WHERE scenario_id=?', [$scenarioId]);
        $objects = $this->all(
            'SELECT o.*,a.path image_path FROM map_objects o LEFT JOIN assets a ON a.id=o.image_asset_id WHERE o.scenario_id=?' .
                ($user['role'] === 'DM' ? '' : ' AND o.visible=1'),
            [$scenarioId],
        );
        $npcSql =
            'SELECT n.*,COALESCE(n.max_health,n.health) max_health,a.path image_path FROM npc_characters n LEFT JOIN assets a ON a.id=n.image_asset_id WHERE n.scenario_id=?';
        if ($user['role'] !== 'DM') {
            $npcSql .= ' AND n.visible=1 AND NOT(n.health<=0 OR n.dead_hidden=1)';
        }
        $npcs = $this->all($npcSql, [$scenarioId]);
        $this->ensurePlayerCharacterDrawingColorColumn();
        $players = $this->all(
            'SELECT sp.*,u.name user_name,pc.name,pc.max_health,pc.drawing_color,pc.avatar_asset_id image_asset_id,a.path image_path,dpn.notes dm_notes FROM scenario_players sp JOIN users u ON u.id=sp.user_id JOIN player_characters pc ON pc.id=sp.character_id LEFT JOIN assets a ON a.id=pc.avatar_asset_id LEFT JOIN dm_player_notes dpn ON dpn.player_id=sp.user_id AND dpn.campaign_id=pc.campaign_id WHERE sp.scenario_id=?' .
                ($user['role'] === 'DM' ? '' : ' AND sp.placed=1'),
            [$scenarioId],
        );
        $encounter = $this->one('SELECT * FROM encounters WHERE scenario_id=?', [$scenarioId]);
        $participants = [];
        if ($encounter) {
            $participants = $this->all(
                'SELECT * FROM encounter_participants WHERE encounter_id=? ORDER BY initiative DESC,tie_order,id',
                [$encounter['id']],
            );
        }
        if ($user['role'] !== 'DM' && $encounter) {
            $participants = array_values(
                array_filter($participants, fn($part) => $part['actor_type'] === 'PLAYER'),
            );
            if (
                $encounter['current_participant_id'] &&
                !array_filter(
                    $participants,
                    fn($part) => (int) $part['id'] === (int) $encounter['current_participant_id'],
                )
            ) {
                $encounter['current_participant_id'] = null;
            }
        }
        $pending =
            $user['role'] === 'DM'
                ? $this->all(
                    "SELECT mr.*,u.name user_name,pc.name character_name FROM movement_requests mr JOIN users u ON u.id=mr.user_id LEFT JOIN scenario_players sp ON sp.id=mr.scenario_player_id LEFT JOIN player_characters pc ON pc.id=sp.character_id WHERE mr.scenario_id=? AND mr.status='PENDING'",
                    [$scenarioId],
                )
                : [];
        $notes =
            $user['role'] === 'DM'
                ? $this->all('SELECT * FROM cell_notes WHERE scenario_id=?', [$scenarioId])
                : [];
        if ($user['role'] !== 'DM') {
            $objects = array_map(
                fn($o) => [
                    'id' => $o['id'],
                    'x' => $o['x'],
                    'y' => $o['y'],
                    'width_cells' => $o['width_cells'],
                    'height_cells' => $o['height_cells'],
                    'image_asset_id' => $o['image_asset_id'],
                ],
                $objects,
            );
            $npcs = array_map(
                fn($n) => [
                    'id' => $n['id'],
                    'x' => $n['x'],
                    'y' => $n['y'],
                    'image_asset_id' => $n['image_asset_id'],
                    'rotation_degrees' => $n['rotation_degrees'],
                ],
                $npcs,
            );
            foreach ($players as &$pl) {
                unset($pl['dm_notes']);
                if ($user['role'] !== 'PLAYER' || (int) $pl['user_id'] !== (int) $user['id']) {
                    unset($pl['health'], $pl['max_health']);
                }
            }
        }
        $previousEncounterLog = false;
        if ($user['role'] === 'DM' && $encounter && $encounter['state'] === 'OFF') {
            $previousEncounterLog = $this->hasEncounterHealthLog((int) $encounter['id']);
        }
        return [
            'scenario' => $s,
            'mapFocus' => $mapFocus,
            'blocked' => $blocked,
            'objects' => $objects,
            'npcs' => $npcs,
            'players' => $players,
            'encounter' => $encounter,
            'participants' => $participants,
            'pendingMovements' => $pending,
            'cellNotes' => $notes,
            'previousEncounterLog' => $previousEncounterLog,
        ];
    }

    public function downloadEncounterLog(int $scenarioId, array $user): string
    {
        if ($user['role'] !== 'DM') {
            throw new RuntimeException('Acción exclusiva del DM.');
        }
        $s = $this->one('SELECT campaign_id FROM scenarios WHERE id=?', [$scenarioId]);
        if (!$s) {
            throw new RuntimeException('Escenario inexistente.');
        }
        $this->assertMember((int) $s['campaign_id'], (int) $user['id']);
        $this->ensureEncounterHealthLogTable();
        $enc = $this->one('SELECT id FROM encounters WHERE scenario_id=?', [$scenarioId]);
        if (!$enc) {
            return '';
        }
        $rows = $this->all(
            'SELECT round_no,actor_type,actor_id,actor_name,action_type,amount,health_before,health_after,created_at FROM encounter_health_log WHERE encounter_id=? ORDER BY id',
            [$enc['id']],
        );
        $out = fopen('php://temp', 'r+');
        fputcsv($out, [
            'ronda',
            'tipo',
            'id',
            'nombre',
            'accion',
            'cantidad',
            'vida_antes',
            'vida_despues',
            'fecha',
        ]);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['round_no'],
                $r['actor_type'],
                $r['actor_id'],
                $r['actor_name'],
                $r['action_type'],
                $r['amount'],
                $r['health_before'],
                $r['health_after'],
                $r['created_at'],
            ]);
        }
        rewind($out);
        return (string) stream_get_contents($out);
    }

    public function chatThreads(int $scenarioId, array $user): array
    {
        $s = $this->one('SELECT campaign_id FROM scenarios WHERE id=?', [$scenarioId]);
        if (!$s) {
            throw new RuntimeException('Escenario inexistente.');
        }
        $cid = (int) $s['campaign_id'];
        $this->assertMember($cid, (int) $user['id']);
        $this->ensureChatTables();
        if ($user['role'] === 'PLAYER') {
            $this->ensurePlayerChat($cid, (int) $user['id']);
        }
        $where = $user['role'] === 'DM' ? 'c.campaign_id=?' : 'c.campaign_id=? AND c.player_id=?';
        $args = $user['role'] === 'DM' ? [$cid] : [$cid, $user['id']];
        return $this->all(
            'SELECT c.id,c.player_id,u.name player_name,(SELECT m.message FROM dm_player_chat_messages m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1) last_message,(SELECT m.created_at FROM dm_player_chat_messages m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1) last_at,(SELECT COUNT(*) FROM dm_player_chat_messages m WHERE m.chat_id=c.id AND ' .
                ($user['role'] === 'DM'
                    ? 'm.read_by_dm=0 AND m.sender_id<>?'
                    : 'm.read_by_player=0 AND m.sender_id<>?') .
                ") unread FROM dm_player_chats c JOIN users u ON u.id=c.player_id WHERE $where ORDER BY COALESCE(last_at,c.updated_at) DESC",
            array_merge([$user['id']], $args),
        );
    }
    public function chatMessages(int $chatId, array $user): array
    {
        $this->ensureChatTables();
        $chat = $this->one('SELECT * FROM dm_player_chats WHERE id=?', [$chatId]);
        if (!$chat) {
            throw new RuntimeException('Chat inexistente.');
        }
        $this->assertMember((int) $chat['campaign_id'], (int) $user['id']);
        if ($user['role'] !== 'DM' && (int) $chat['player_id'] !== (int) $user['id']) {
            throw new RuntimeException('Sin acceso al chat.');
        }
        $this->db
            ->prepare(
                'UPDATE dm_player_chat_messages SET ' .
                    ($user['role'] === 'DM' ? 'read_by_dm=1' : 'read_by_player=1') .
                    ' WHERE chat_id=? AND sender_id<>?',
            )
            ->execute([$chatId, $user['id']]);
        return [
            'chat' => $chat,
            'messages' => $this->all(
                'SELECT m.*,u.name sender_name,u.role sender_role FROM dm_player_chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.chat_id=? ORDER BY m.id LIMIT 200',
                [$chatId],
            ),
        ];
    }
    public function sendChatMessage(int $scenarioId, array $user, array $p): array
    {
        $msg = trim((string) ($p['message'] ?? ''));
        if ($msg === '') {
            throw new RuntimeException('Escribe un mensaje.');
        }
        if (mb_strlen($msg) > 2000) {
            $msg = mb_substr($msg, 0, 2000);
        }
        $s = $this->one('SELECT campaign_id FROM scenarios WHERE id=?', [$scenarioId]);
        if (!$s) {
            throw new RuntimeException('Escenario inexistente.');
        }
        $cid = (int) $s['campaign_id'];
        $this->assertMember($cid, (int) $user['id']);
        $this->ensureChatTables();
        if ($user['role'] === 'DM') {
            $chatId = (int) ($p['chatId'] ?? 0);
            $chat = $this->one('SELECT * FROM dm_player_chats WHERE id=? AND campaign_id=?', [
                $chatId,
                $cid,
            ]);
            if (!$chat) {
                throw new RuntimeException('Chat inválido.');
            }
        } elseif ($user['role'] === 'PLAYER') {
            $chat = $this->ensurePlayerChat($cid, (int) $user['id']);
            $chatId = (int) $chat['id'];
        } else {
            throw new RuntimeException('Chat no disponible.');
        }
        $this->db
            ->prepare(
                'INSERT INTO dm_player_chat_messages(chat_id,sender_id,message,read_by_dm,read_by_player) VALUES (?,?,?,?,?)',
            )
            ->execute([
                $chatId,
                $user['id'],
                $msg,
                $user['role'] === 'DM' ? 1 : 0,
                $user['role'] === 'PLAYER' ? 1 : 0,
            ]);
        $mid = (int) $this->db->lastInsertId();
        $this->db
            ->prepare('UPDATE dm_player_chats SET updated_at=NOW() WHERE id=?')
            ->execute([$chatId]);
        $row = $this->one(
            'SELECT c.id chat_id,c.player_id,u.name player_name,m.id message_id,m.message,m.created_at,su.name sender_name,su.role sender_role FROM dm_player_chats c JOIN users u ON u.id=c.player_id JOIN dm_player_chat_messages m ON m.id=? JOIN users su ON su.id=m.sender_id WHERE c.id=?',
            [$mid, $chatId],
        );
        return $row ?: [];
    }

    public function recordDmView(array $user, int $scenarioId, array $camera): array
    {
        if ($user['role'] !== 'DM') {
            throw new RuntimeException('Acción exclusiva del DM.');
        }
        $scenario = $this->one('SELECT id,campaign_id,active FROM scenarios WHERE id=?', [
            $scenarioId,
        ]);
        if (!$scenario || (int) $scenario['active'] !== 1) {
            throw new RuntimeException('El escenario no está activo.');
        }
        $this->assertMember((int) $scenario['campaign_id'], (int) $user['id']);
        $centerX = (float) ($camera['centerX'] ?? 0);
        $centerY = (float) ($camera['centerY'] ?? 0);
        $zoom = max(0.25, min(3, (float) ($camera['zoom'] ?? 1)));
        $this->db
            ->prepare(
                'INSERT INTO dm_scenario_views(campaign_id,scenario_id,center_x,center_y,zoom) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE center_x=VALUES(center_x),center_y=VALUES(center_y),zoom=VALUES(zoom),viewed_at=CURRENT_TIMESTAMP',
            )
            ->execute([$scenario['campaign_id'], $scenarioId, $centerX, $centerY, $zoom]);
        return [
            'scenarioId' => $scenarioId,
            'campaignId' => (int) $scenario['campaign_id'],
            'camera' => ['centerX' => $centerX, 'centerY' => $centerY, 'zoom' => $zoom],
        ];
    }

    public function guestView(array $user): ?array
    {
        if ($user['role'] !== 'GUEST') {
            return null;
        }
        $view = $this->one(
            'SELECT v.campaign_id,v.scenario_id,v.center_x,v.center_y,v.zoom FROM dm_scenario_views v JOIN scenarios s ON s.id=v.scenario_id JOIN campaign_members m ON m.campaign_id=v.campaign_id WHERE m.user_id=? AND s.active=1 AND s.is_deleted=0 ORDER BY v.viewed_at DESC,v.scenario_id DESC LIMIT 1',
            [$user['id']],
        );
        return $view
            ? [
                'scenarioId' => (int) $view['scenario_id'],
                'campaignId' => (int) $view['campaign_id'],
                'camera' => [
                    'centerX' => (float) $view['center_x'],
                    'centerY' => (float) $view['center_y'],
                    'zoom' => (float) $view['zoom'],
                ],
            ]
            : null;
    }

    public function command(array $user, string $type, array $p, string $requestId): array
    {
        if ($user['role'] === 'GUEST') {
            throw new RuntimeException('El invitado es de solo lectura.');
        }
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $requestId)) {
            throw new RuntimeException('requestId inválido.');
        }
        $old = $this->one(
            'SELECT response FROM command_receipts WHERE request_id=? AND user_id=?',
            [$requestId, $user['id']],
        );
        if ($old) {
            return json_decode($old['response'], true);
        }
        $scenarioId = (int) ($p['scenarioId'] ?? 0);
        $result = Database::transaction(function () use (
            $user,
            $type,
            $p,
            $scenarioId,
            $requestId,
        ) {
            $s = $this->one('SELECT * FROM scenarios WHERE id=? FOR UPDATE', [$scenarioId]);
            if (!$s) {
                throw new RuntimeException('Escenario inexistente.');
            }
            $this->assertMember((int) $s['campaign_id'], (int) $user['id']);
            $dmOnly = [
                'scenario.activate',
                'scenario.deactivate',
                'scenario.hide',
                'scenario.copy_alive_previous',
                'map.focus',
                'map.focus.clear',
                'map.cells.paint',
                'object.create',
                'objects.bulk_update',
                'tokens.bulk_update',
                'tokens.delete',
                'npc.create',
                'token.update',
                'token.delete',
                'token.clone',
                'token.move_dm',
                'movement.approve',
                'movement.reject',
                'encounter.prepare',
                'encounter.start',
                'encounter.include',
                'encounter.restart_round',
                'encounter.stop',
                'initiative.set',
                'initiative.reorder_tie',
                'turn.next',
                'turn.rollback',
                'turn.delay_order',
                'health.set',
                'cell.note',
                'player.note',
            ];
            if (in_array($type, $dmOnly, true) && $user['role'] !== 'DM') {
                throw new RuntimeException('Acción exclusiva del DM.');
            }
            $data = match ($type) {
                'scenario.activate' => $this->activate($scenarioId, true),
                'scenario.deactivate' => $this->activate($scenarioId, false),
                'scenario.hide' => $this->hideScenario($scenarioId),
                'scenario.copy_alive_previous' => $this->copyAliveFromPreviousScenario($s),
                'map.focus' => $this->setMapFocus($s, $p),
                'map.focus.clear' => $this->clearMapFocus($s),
                'map.cells.paint' => $this->paint($s, $p),
                'cell.note' => $this->cellNote($s, $p),
                'player.note' => $this->playerNote($s, $p),
                'object.create' => $this->createObject($s, $p),
                'objects.bulk_update' => $this->bulkUpdateObjects($s, $p),
                'tokens.bulk_update' => $this->bulkUpdateTokens($s, $p),
                'tokens.delete' => $this->deleteTokens($s, $p),
                'npc.create' => $this->createNpc($s, $p, $user),
                'token.update' => $this->updateToken($s, $p),
                'token.delete' => $this->deleteToken($s, $p),
                'token.clone' => $this->cloneToken($s, $p),
                'token.move_dm' => $this->moveDm($s, $p),
                'player.place' => $this->placePlayer($s, $user, $p),
                'movement.submit' => $this->submitMovement($s, $user, $p),
                'movement.approve' => $this->reviewMovement($s, $user, $p, true),
                'movement.reject' => $this->reviewMovement($s, $user, $p, false),
                'encounter.prepare' => $this->encounterPrepare($scenarioId),
                'encounter.start' => $this->encounterStart($scenarioId, $p),
                'encounter.include' => $this->encounterInclude($scenarioId, $p),
                'encounter.restart_round' => $this->encounterRestartRound($scenarioId),
                'encounter.stop' => $this->encounterStop($scenarioId),
                'initiative.set' => $this->initiativeSet($scenarioId, $p),
                'initiative.reorder_tie' => $this->initiativeReorder($scenarioId, $p),
                'turn.next' => $this->turnNext($scenarioId),
                'turn.rollback' => $this->turnRollback($scenarioId),
                'turn.delay' => $this->turnDelay($scenarioId, $user, $p),
                'turn.delay_order' => $this->turnDelayOrder($scenarioId, $p),
                'health.set' => $this->healthSet($scenarioId, $p),
                'player.health.set' => $this->playerHealthSet($scenarioId, $user, $p),
                'player.rotate' => $this->playerRotate($scenarioId, $user, $p),
                default => throw new RuntimeException('Comando desconocido.'),
            };
            $version = (int) $s['version'] + 1;
            $this->db
                ->prepare('UPDATE scenarios SET version=? WHERE id=?')
                ->execute([$version, $scenarioId]);
            $event = [
                'type' => $type,
                'scenarioId' => $scenarioId,
                'version' => $version,
                'data' => $data,
            ];
            $this->db
                ->prepare(
                    'INSERT INTO scenario_events(scenario_id,version,event_type,actor_id,payload) VALUES (?,?,?,?,?)',
                )
                ->execute([
                    $scenarioId,
                    $version,
                    $type,
                    $user['id'],
                    json_encode($event, JSON_UNESCAPED_UNICODE),
                ]);
            $this->db
                ->prepare(
                    'INSERT INTO command_receipts(request_id,user_id,response) VALUES (?,?,?)',
                )
                ->execute([$requestId, $user['id'], json_encode($event, JSON_UNESCAPED_UNICODE)]);
            return $event;
        });
        return $result;
    }

    // Scenario lifecycle and map editing.
    private function activate(int $id, bool $active): array
    {
        $this->db
            ->prepare('UPDATE scenarios SET active=? WHERE id=? AND is_deleted=0')
            ->execute([$active ? 1 : 0, $id]);
        if (!$active) {
            $this->db
                ->prepare('UPDATE scenario_players SET placed=0 WHERE scenario_id=?')
                ->execute([$id]);
        }
        return ['active' => $active];
    }
    private function copyAliveFromPreviousScenario(array $s): array
    {
        $src = $this->one(
            'SELECT s2.id FROM scenarios s2 WHERE s2.campaign_id=? AND s2.id<>? AND s2.is_deleted=0 AND EXISTS(SELECT 1 FROM npc_characters n WHERE n.scenario_id=s2.id AND n.health>0) ORDER BY s2.active DESC,s2.id DESC LIMIT 1',
            [$s['campaign_id'], $s['id']],
        );
        if (!$src) {
            throw new RuntimeException('No hay escenario anterior con tokens no-jugador vivos.');
        }
        $sourceId = (int) $src['id'];
        $copiedNpcs = 0;
        $npcs = $this->all('SELECT * FROM npc_characters WHERE scenario_id=? AND health>0', [
            $sourceId,
        ]);
        foreach ($npcs as $n) {
            $x = min((int) $s['width'] - 1, max(0, (int) $n['x']));
            $y = min((int) $s['height'] - 1, max(0, (int) $n['y']));
            $this->db
                ->prepare(
                    'INSERT INTO npc_characters(scenario_id,name,x,y,notes,image_asset_id,codex_creature_id,health,max_health,armor_class,rotation_degrees,initiative,visible,dead_hidden) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                )
                ->execute([
                    $s['id'],
                    $n['name'],
                    $x,
                    $y,
                    $n['notes'],
                    $n['image_asset_id'],
                    $n['codex_creature_id'],
                    $n['health'],
                    $n['max_health'] ?? $n['health'],
                    $n['armor_class'],
                    $n['rotation_degrees'],
                    $n['initiative'],
                    $n['visible'],
                    $n['dead_hidden'],
                ]);
            $copiedNpcs++;
        }
        return ['sourceScenarioId' => $sourceId, 'npcs' => $copiedNpcs];
    }
    private function hideScenario(int $id): array
    {
        $this->db->prepare('UPDATE scenarios SET is_deleted=1,active=0 WHERE id=?')->execute([$id]);
        $this->db
            ->prepare('UPDATE scenario_players SET placed=0 WHERE scenario_id=?')
            ->execute([$id]);
        $this->db->prepare('DELETE FROM dm_scenario_views WHERE scenario_id=?')->execute([$id]);
        return ['hidden' => true];
    }

    private function paint(array $s, array $p): array
    {
        $cells = $p['cells'] ?? [];
        if (!is_array($cells) || count($cells) > 3600) {
            throw new RuntimeException('Selección inválida.');
        }
        $blocked = (bool) ($p['blocked'] ?? true);
        $ins = $this->db->prepare(
            'INSERT IGNORE INTO blocked_cells(scenario_id,x,y) VALUES (?,?,?)',
        );
        $del = $this->db->prepare('DELETE FROM blocked_cells WHERE scenario_id=? AND x=? AND y=?');
        foreach ($cells as $c) {
            [$x, $y] = $this->coords($s, $c);
            ($blocked ? $ins : $del)->execute([$s['id'], $x, $y]);
        }
        return ['cells' => $cells, 'blocked' => $blocked];
    }

    private function playerNote(array $s, array $p): array
    {
        $playerId = (int) ($p['playerId'] ?? 0);
        $notes = (string) ($p['notes'] ?? '');
        if (
            !$this->one('SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=?', [
                $s['campaign_id'],
                $playerId,
            ])
        ) {
            throw new RuntimeException('Jugador inválido.');
        }
        $this->db
            ->prepare(
                'INSERT INTO dm_player_notes(campaign_id,player_id,notes) VALUES (?,?,?) ON DUPLICATE KEY UPDATE notes=VALUES(notes)',
            )
            ->execute([$s['campaign_id'], $playerId, $notes]);
        return ['playerId' => $playerId];
    }

    private function cellNote(array $s, array $p): array
    {
        [$x, $y] = $this->coords($s, $p);
        $notes = trim((string) ($p['notes'] ?? ''));
        if ($notes === '') {
            $this->db
                ->prepare('DELETE FROM cell_notes WHERE scenario_id=? AND x=? AND y=?')
                ->execute([$s['id'], $x, $y]);
        } else {
            $this->db
                ->prepare(
                    'INSERT INTO cell_notes(scenario_id,x,y,notes) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE notes=VALUES(notes)',
                )
                ->execute([$s['id'], $x, $y, $notes]);
        }
        return compact('x', 'y', 'notes');
    }

    private function createObject(array $s, array $p): array
    {
        [$x, $y] = $this->coords($s, $p);
        $width = (int) ($p['widthCells'] ?? 1);
        $height = (int) ($p['heightCells'] ?? 1);
        $this->validateObjectSize($s, $x, $y, $width, $height);
        $this->db
            ->prepare(
                'INSERT INTO map_objects(scenario_id,name,x,y,width_cells,height_cells,notes,visible,image_asset_id) VALUES (?,?,?,?,?,?,?,?,?)',
            )
            ->execute([
                $s['id'],
                trim((string) ($p['name'] ?? 'Objeto')) ?: 'Objeto',
                $x,
                $y,
                $width,
                $height,
                $p['notes'] ?? null,
                !empty($p['visible']) ? 1 : 0,
                $p['imageAssetId'] ?? null,
            ]);
        return [
            'id' => (int) $this->db->lastInsertId(),
            'kind' => 'OBJECT',
            'x' => $x,
            'y' => $y,
            'widthCells' => $width,
            'heightCells' => $height,
        ];
    }
    private function bulkUpdateObjects(array $s, array $p): array
    {
        $ids = array_values(
            array_unique(
                array_filter(
                    array_map('intval', (array) ($p['objectIds'] ?? [])),
                    fn($id) => $id > 0,
                ),
            ),
        );
        if (!$ids || count($ids) > 200) {
            throw new RuntimeException('Selecciona entre 1 y 200 objetos.');
        }
        $sets = [];
        $values = [];
        if (array_key_exists('visible', $p)) {
            $sets[] = 'visible=?';
            $values[] = !empty($p['visible']) ? 1 : 0;
        }
        if (array_key_exists('image_asset_id', $p)) {
            $sets[] = 'image_asset_id=?';
            $values[] = (int) $p['image_asset_id'];
        }
        if (!$sets) {
            throw new RuntimeException('No hay cambios para aplicar.');
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $values[] = $s['id'];
        array_push($values, ...$ids);
        $this->db
            ->prepare(
                'UPDATE map_objects SET ' .
                    implode(',', $sets) .
                    " WHERE scenario_id=? AND id IN ($placeholders)",
            )
            ->execute($values);
        return [
            'objectIds' => $ids,
            'updated' => $this->db->query('SELECT ROW_COUNT()')->fetchColumn(),
        ];
    }
    private function bulkUpdateTokens(array $s, array $p): array
    {
        $items = array_slice((array) ($p['items'] ?? []), 0, 201);
        if (!$items || count($items) > 200) {
            throw new RuntimeException('Selecciona entre 1 y 200 elementos.');
        }
        $objects = [];
        $npcs = [];
        foreach ($items as $item) {
            $kind = strtoupper((string) ($item['kind'] ?? ''));
            $id = (int) ($item['id'] ?? 0);
            if ($id < 1) {
                continue;
            }
            if ($kind === 'OBJECT') {
                $objects[] = $id;
            } elseif ($kind === 'NPC') {
                $npcs[] = $id;
            } else {
                throw new RuntimeException('Tipo de elemento no permitido.');
            }
        }
        $objects = array_values(array_unique($objects));
        $npcs = array_values(array_unique($npcs));
        if (!$objects && !$npcs) {
            throw new RuntimeException('Selección inválida.');
        }
        $sets = [];
        $values = [];
        if (array_key_exists('visible', $p)) {
            $sets[] = 'visible=?';
            $values[] = !empty($p['visible']) ? 1 : 0;
        }
        if (array_key_exists('image_asset_id', $p)) {
            $sets[] = 'image_asset_id=?';
            $values[] = (int) $p['image_asset_id'];
        }
        if (!$sets) {
            throw new RuntimeException('No hay cambios para aplicar.');
        }
        $updated = 0;
        foreach ([['map_objects', $objects], ['npc_characters', $npcs]] as [$table, $ids]) {
            if (!$ids) {
                continue;
            }
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $params = $values;
            $params[] = $s['id'];
            array_push($params, ...$ids);
            $q = $this->db->prepare(
                "UPDATE $table SET " .
                    implode(',', $sets) .
                    " WHERE scenario_id=? AND id IN ($placeholders)",
            );
            $q->execute($params);
            $updated += $q->rowCount();
        }
        return ['items' => $items, 'updated' => $updated];
    }
    // Tokens and map actors.
    private function createNpc(array $s, array $p, array $user): array
    {
        [$x, $y] = $this->coords($s, $p);
        $imageAssetId = $p['imageAssetId'] ?? null;
        $stats = [];
        $codexCreatureId = !empty($p['codexCreatureId']) ? (int) $p['codexCreatureId'] : null;
        if ($codexCreatureId) {
            if (!$imageAssetId) {
                $imageAssetId = $this->codexCreatureAssetId($user, $codexCreatureId);
            }
            $stats = $this->codexCreatureStats($codexCreatureId);
        }
        $health = array_key_exists('health', $p)
            ? (int) $p['health']
            : (int) ($stats['health'] ?? 1);
        $armorClass =
            array_key_exists('armorClass', $p) && $p['armorClass'] !== ''
                ? (int) $p['armorClass']
                : $stats['armorClass'] ?? null;
        $rotation = array_key_exists('rotationDegrees', $p)
            ? $this->snapRotation((int) $p['rotationDegrees'])
            : $this->autoNpcRotation($s, $x, $y);
        $this->db
            ->prepare(
                'INSERT INTO npc_characters(scenario_id,name,x,y,notes,health,max_health,armor_class,rotation_degrees,initiative,visible,image_asset_id,codex_creature_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            ->execute([
                $s['id'],
                trim((string) ($p['name'] ?? 'NPC')) ?: 'NPC',
                $x,
                $y,
                $p['notes'] ?? null,
                $health,
                $health,
                $armorClass,
                $rotation,
                isset($p['initiative']) ? (int) $p['initiative'] : null,
                !empty($p['visible']) ? 1 : 0,
                $imageAssetId,
                $codexCreatureId,
            ]);
        return ['id' => (int) $this->db->lastInsertId(), 'kind' => 'NPC', 'x' => $x, 'y' => $y];
    }
    private function snapRotation(int $degrees): int
    {
        $degrees = (($degrees % 360) + 360) % 360;
        return (int) (round($degrees / 45) * 45) % 360;
    }
    private function autoNpcRotation(array $s, int $x, int $y): int
    {
        $players = $this->all('SELECT x,y FROM scenario_players WHERE scenario_id=? AND placed=1', [
            $s['id'],
        ]);
        $best = null;
        $bestDist = null;
        foreach ($players as $pl) {
            $dx = (int) $pl['x'] - $x;
            $dy = (int) $pl['y'] - $y;
            $dist = $dx * $dx + $dy * $dy;
            if ($dist === 0) {
                continue;
            }
            if ($bestDist === null || $dist < $bestDist) {
                $bestDist = $dist;
                $best = [$dx, $dy];
            }
        }
        if (!$best) {
            return 0;
        }
        [$dx, $dy] = $best;
        $deg = rad2deg(atan2(-$dx, $dy));
        return $this->snapRotation((int) round($deg));
    }
    private function codexCreatureStats(int $creatureId): array
    {
        if ($creatureId < 1) {
            return [];
        }
        $st = $this->db->prepare(
            'SELECT hit_points_text,armor_class_text FROM creatures WHERE id=? AND is_active=1',
        );
        $st->execute([$creatureId]);
        $c = $st->fetch();
        if (!$c) {
            return [];
        }
        $num = function ($v): ?int {
            return preg_match('/\d+/', (string) $v, $m) ? (int) $m[0] : null;
        };
        return [
            'health' => $num($c['hit_points_text'] ?? null),
            'armorClass' => $num($c['armor_class_text'] ?? null),
        ];
    }
    private function codexCreatureAssetId(array $user, int $creatureId): ?int
    {
        if ($creatureId < 1) {
            return null;
        }
        $st = $this->db->prepare(
            "SELECT ma.storage_path,ma.mime_type,ma.size_bytes FROM creatures c JOIN codex_media_links cml ON cml.entity_type='creature' AND cml.entity_id=c.id JOIN media_assets ma ON ma.id=cml.media_asset_id JOIN media_purposes mp ON mp.id=cml.media_purpose_id WHERE c.id=? AND c.is_active=1 AND ma.is_active=1 ORDER BY FIELD(mp.code,'token','portrait','miniature','reference'), cml.is_primary DESC, cml.sort_order, ma.id LIMIT 1",
        );
        $st->execute([$creatureId]);
        $media = $st->fetch();
        if (!$media || empty($media['storage_path'])) {
            return null;
        }
        $path = (string) $media['storage_path'];
        $existing = $this->one('SELECT id FROM assets WHERE path=? LIMIT 1', [$path]);
        if ($existing) {
            return (int) $existing['id'];
        }
        $base = realpath(dirname(__DIR__) . '/storage/uploads');
        $file = $base ? realpath($base . '/' . str_replace(['..', '\\'], ['', '/'], $path)) : false;
        if (!$base || !$file || !str_starts_with($file, $base) || !is_file($file)) {
            return null;
        }
        $info = @getimagesize($file);
        if (!$info) {
            return null;
        }
        $this->db
            ->prepare(
                'INSERT INTO assets(owner_id,mime,size_bytes,width,height,path) VALUES (?,?,?,?,?,?)',
            )
            ->execute([
                (int) $user['id'],
                (string) $media['mime_type'],
                (int) $media['size_bytes'],
                (int) $info[0],
                (int) $info[1],
                $path,
            ]);
        return (int) $this->db->lastInsertId();
    }

    private function deleteTokens(array $s, array $p): array
    {
        $items = array_slice((array) ($p['items'] ?? []), 0, 201);
        if (!$items || count($items) > 200) {
            throw new RuntimeException('Selecciona entre 1 y 200 elementos.');
        }
        $objects = [];
        $npcs = [];
        foreach ($items as $item) {
            $kind = strtoupper((string) ($item['kind'] ?? ''));
            $id = (int) ($item['id'] ?? 0);
            if ($id < 1) {
                continue;
            }
            if ($kind === 'OBJECT') {
                $objects[] = $id;
            } elseif ($kind === 'NPC') {
                $npcs[] = $id;
            } else {
                throw new RuntimeException('No se puede eliminar uno de los tokens seleccionados.');
            }
        }
        $objects = array_values(array_unique($objects));
        $npcs = array_values(array_unique($npcs));
        if (!$objects && !$npcs) {
            throw new RuntimeException('Selección inválida.');
        }
        $deleted = 0;
        if ($npcs) {
            $ph = implode(',', array_fill(0, count($npcs), '?'));
            $enc = $this->one('SELECT id FROM encounters WHERE scenario_id=?', [$s['id']]);
            if ($enc) {
                $params = [$enc['id']];
                array_push($params, ...$npcs);
                $this->db
                    ->prepare(
                        "DELETE FROM encounter_participants WHERE encounter_id=? AND actor_type='NPC' AND actor_id IN ($ph)",
                    )
                    ->execute($params);
            }
            $params = [$s['id']];
            array_push($params, ...$npcs);
            $q = $this->db->prepare(
                "DELETE FROM npc_characters WHERE scenario_id=? AND id IN ($ph)",
            );
            $q->execute($params);
            $deleted += $q->rowCount();
        }
        if ($objects) {
            $ph = implode(',', array_fill(0, count($objects), '?'));
            $params = [$s['id']];
            array_push($params, ...$objects);
            $q = $this->db->prepare("DELETE FROM map_objects WHERE scenario_id=? AND id IN ($ph)");
            $q->execute($params);
            $deleted += $q->rowCount();
        }
        return ['items' => $items, 'deleted' => $deleted];
    }

    private function deleteToken(array $s, array $p): array
    {
        $kind = strtoupper((string) ($p['kind'] ?? ''));
        $id = (int) ($p['id'] ?? 0);
        if ($id < 1) {
            throw new RuntimeException('Token inválido.');
        }
        if ($kind === 'NPC') {
            $enc = $this->one('SELECT id FROM encounters WHERE scenario_id=?', [$s['id']]);
            if ($enc) {
                $this->db
                    ->prepare(
                        "DELETE FROM encounter_participants WHERE encounter_id=? AND actor_type='NPC' AND actor_id=?",
                    )
                    ->execute([$enc['id'], $id]);
            }
            $this->db
                ->prepare('DELETE FROM npc_characters WHERE id=? AND scenario_id=?')
                ->execute([$id, $s['id']]);
        } elseif ($kind === 'OBJECT') {
            $this->db
                ->prepare('DELETE FROM map_objects WHERE id=? AND scenario_id=?')
                ->execute([$id, $s['id']]);
        } else {
            throw new RuntimeException('No se puede eliminar este token.');
        }
        if ($this->db->query('SELECT ROW_COUNT()')->fetchColumn() < 1) {
            throw new RuntimeException('Token inexistente.');
        }
        return ['kind' => $kind, 'id' => $id];
    }

    private function cloneToken(array $s, array $p): array
    {
        [$x, $y] = $this->coords($s, $p);
        $kind = strtoupper((string) ($p['kind'] ?? ''));
        $id = (int) ($p['id'] ?? 0);
        if ($kind === 'NPC') {
            $src = $this->one('SELECT * FROM npc_characters WHERE id=? AND scenario_id=?', [
                $id,
                $s['id'],
            ]);
            if (!$src) {
                throw new RuntimeException('NPC inexistente.');
            }
            $this->db
                ->prepare(
                    'INSERT INTO npc_characters(scenario_id,name,x,y,notes,image_asset_id,codex_creature_id,health,max_health,armor_class,rotation_degrees,initiative,visible,dead_hidden) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                )
                ->execute([
                    $s['id'],
                    $src['name'],
                    $x,
                    $y,
                    $src['notes'],
                    $src['image_asset_id'],
                    $src['codex_creature_id'],
                    $src['health'],
                    $src['max_health'] ?? $src['health'],
                    $src['armor_class'],
                    $this->autoNpcRotation($s, $x, $y),
                    $src['initiative'],
                    $src['visible'],
                    $src['dead_hidden'],
                ]);
            return ['id' => (int) $this->db->lastInsertId(), 'kind' => 'NPC', 'x' => $x, 'y' => $y];
        }
        if ($kind === 'OBJECT') {
            $src = $this->one('SELECT * FROM map_objects WHERE id=? AND scenario_id=?', [
                $id,
                $s['id'],
            ]);
            if (!$src) {
                throw new RuntimeException('Objeto inexistente.');
            }
            $this->validateObjectSize(
                $s,
                $x,
                $y,
                (int) $src['width_cells'],
                (int) $src['height_cells'],
            );
            $this->db
                ->prepare(
                    'INSERT INTO map_objects(scenario_id,name,x,y,width_cells,height_cells,notes,visible,image_asset_id) VALUES (?,?,?,?,?,?,?,?,?)',
                )
                ->execute([
                    $s['id'],
                    $src['name'],
                    $x,
                    $y,
                    $src['width_cells'],
                    $src['height_cells'],
                    $src['notes'],
                    $src['visible'],
                    $src['image_asset_id'],
                ]);
            return [
                'id' => (int) $this->db->lastInsertId(),
                'kind' => 'OBJECT',
                'x' => $x,
                'y' => $y,
            ];
        }
        throw new RuntimeException('No se puede clonar este token.');
    }

    private function updateToken(array $s, array $p): array
    {
        $kind = strtoupper((string) ($p['kind'] ?? ''));
        $id = (int) ($p['id'] ?? 0);
        if ($kind === 'NPC') {
            $fields = [
                'name',
                'notes',
                'health',
                'armor_class',
                'rotation_degrees',
                'initiative',
                'visible',
                'dead_hidden',
                'image_asset_id',
            ];
            $table = 'npc_characters';
        } elseif ($kind === 'OBJECT') {
            $fields = ['name', 'notes', 'visible', 'image_asset_id', 'width_cells', 'height_cells'];
            $table = 'map_objects';
            if (array_key_exists('width_cells', $p) || array_key_exists('height_cells', $p)) {
                $current = $this->one('SELECT * FROM map_objects WHERE id=? AND scenario_id=?', [
                    $id,
                    $s['id'],
                ]);
                if (!$current) {
                    throw new RuntimeException('Objeto inexistente.');
                }
                $this->validateObjectSize(
                    $s,
                    (int) $current['x'],
                    (int) $current['y'],
                    (int) ($p['width_cells'] ?? $current['width_cells']),
                    (int) ($p['height_cells'] ?? $current['height_cells']),
                );
            }
        } else {
            throw new RuntimeException('Tipo de token inválido.');
        }
        $sets = [];
        $vals = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $p)) {
                $value = $p[$f];
                if (in_array($f, ['visible', 'dead_hidden'], true)) {
                    $value = !empty($value) ? 1 : 0;
                } elseif (in_array($f, ['health', 'width_cells', 'height_cells'], true)) {
                    $value = (int) $value;
                } elseif ($f === 'rotation_degrees') {
                    $value = $this->snapRotation((int) $value);
                } elseif (in_array($f, ['initiative', 'armor_class'], true)) {
                    $value = $value === null || $value === '' ? null : (int) $value;
                } elseif ($f === 'image_asset_id') {
                    $value = $value === null || $value === '' ? null : (int) $value;
                } else {
                    $value = (string) $value;
                }
                $sets[] = "$f=?";
                $vals[] = $value;
            }
        }
        if (!$sets) {
            throw new RuntimeException('No hay cambios.');
        }
        $vals[] = $id;
        $vals[] = $s['id'];
        $this->db
            ->prepare("UPDATE $table SET " . implode(',', $sets) . ' WHERE id=? AND scenario_id=?')
            ->execute($vals);
        return ['kind' => $kind, 'id' => $id];
    }

    private function moveDm(array $s, array $p): array
    {
        [$x, $y] = $this->coords($s, $p);
        $kind = strtoupper((string) $p['kind']);
        $id = (int) $p['id'];
        $table = match ($kind) {
            'NPC' => 'npc_characters',
            'OBJECT' => 'map_objects',
            'PLAYER' => 'scenario_players',
            default => throw new RuntimeException('Token inválido.'),
        };
        if ($kind === 'OBJECT') {
            $object = $this->one(
                'SELECT width_cells,height_cells FROM map_objects WHERE id=? AND scenario_id=?',
                [$id, $s['id']],
            );
            if (!$object) {
                throw new RuntimeException('Objeto inexistente.');
            }
            $this->validateObjectSize(
                $s,
                $x,
                $y,
                (int) $object['width_cells'],
                (int) $object['height_cells'],
            );
        }
        if ($kind === 'PLAYER') {
            $this->db
                ->prepare("UPDATE $table SET x=?,y=?,last_path=NULL WHERE id=? AND scenario_id=?")
                ->execute([$x, $y, $id, $s['id']]);
        } else {
            $this->db
                ->prepare("UPDATE $table SET x=?,y=? WHERE id=? AND scenario_id=?")
                ->execute([$x, $y, $id, $s['id']]);
        }
        return compact('kind', 'id', 'x', 'y');
    }

    // Player placement and movement.
    private function placePlayer(array $s, array $u, array $p): array
    {
        if ($u['role'] !== 'PLAYER') {
            throw new RuntimeException('Solo los jugadores se colocan.');
        }
        if (!$s['active']) {
            throw new RuntimeException('El escenario no está activo.');
        }
        [$x, $y] = $this->coords($s, $p);
        $cid = (int) ($p['characterId'] ?? 0);
        $c = $this->one(
            'SELECT * FROM player_characters WHERE id=? AND owner_id=? AND campaign_id=?',
            [$cid, $u['id'], $s['campaign_id']],
        );
        if (!$c) {
            throw new RuntimeException('Personaje inválido.');
        }
        if (
            $this->one(
                'SELECT 1 FROM scenario_players WHERE scenario_id=? AND character_id=? AND placed=1',
                [$s['id'], $cid],
            )
        ) {
            throw new RuntimeException(
                'Ya colocaste este personaje en este escenario. Pide al DM que lo mueva si necesitas cambiarlo de lugar.',
            );
        }
        $this->db
            ->prepare('UPDATE scenario_players SET placed=0 WHERE character_id=?')
            ->execute([$cid]);
        $picked = $p['tokenColor'] ?? null;
        if ($picked === null || $picked === '') {
            $prev = $this->one(
                'SELECT token_color FROM scenario_players WHERE character_id=? AND token_color IS NOT NULL ORDER BY id DESC LIMIT 1',
                [$cid],
            );
            $picked = $prev['token_color'] ?? null;
        }
        $color = $this->playerTokenColor($picked);
        $this->db
            ->prepare(
                'INSERT INTO scenario_players(scenario_id,user_id,character_id,x,y,health,token_color) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id),user_id=VALUES(user_id),x=VALUES(x),y=VALUES(y),health=VALUES(health),token_color=VALUES(token_color),last_path=NULL,placed=1',
            )
            ->execute([$s['id'], $u['id'], $cid, $x, $y, $c['max_health'], $color]);
        return [
            'scenarioPlayerId' => (int) $this->db->lastInsertId(),
            'userId' => $u['id'],
            'characterId' => $cid,
            'x' => $x,
            'y' => $y,
        ];
    }

    private function playerTokenColor($color): ?string
    {
        $color = (string) ($color ?? '');
        $allowed = [
            'transparent',
            '#4c8cc7',
            '#c74c4c',
            '#5d9c63',
            '#d7aa52',
            '#8e5ad7',
            '#d75aa5',
            '#52b8b8',
            '#f4ead7',
            '#30271e',
        ];
        return in_array($color, $allowed, true) ? $color : '#4c8cc7';
    }
    private function submitMovement(array $s, array $u, array $p): array
    {
        if ($u['role'] !== 'PLAYER') {
            throw new RuntimeException('Movimiento de jugador inválido.');
        }
        $characterId = (int) ($p['characterId'] ?? 0);
        if ($characterId < 1) {
            throw new RuntimeException('Selecciona el personaje que quieres mover.');
        }
        $sp = $this->one(
            'SELECT * FROM scenario_players WHERE scenario_id=? AND user_id=? AND character_id=? AND placed=1 FOR UPDATE',
            [$s['id'], $u['id'], $characterId],
        );
        if (!$sp) {
            throw new RuntimeException('Coloca primero el personaje seleccionado.');
        }
        $enc = $this->one('SELECT * FROM encounters WHERE scenario_id=?', [$s['id']]);
        if ($enc && $enc['state'] === 'RUNNING') {
            $cur = $this->one('SELECT * FROM encounter_participants WHERE id=?', [
                $enc['current_participant_id'],
            ]);
            if (
                !$cur ||
                $cur['actor_type'] !== 'PLAYER' ||
                (int) $cur['actor_id'] !== (int) $sp['id']
            ) {
                throw new RuntimeException('No es el turno de este personaje.');
            }
        }
        $path = $p['path'] ?? [];
        if (!is_array($path) || count($path) < 1 || count($path) > 3600) {
            throw new RuntimeException('Camino inválido.');
        }
        $prev = [(int) $sp['x'], (int) $sp['y']];
        $needs = false;
        $clean = [];
        foreach ($path as $c) {
            [$x, $y] = $this->coords($s, $c);
            $dx = abs($x - $prev[0]);
            $dy = abs($y - $prev[1]);
            if (max($dx, $dy) !== 1) {
                throw new RuntimeException('Las casillas del camino deben ser contiguas.');
            }
            $clean[] = ['x' => $x, 'y' => $y];
            $prev = [$x, $y];
            if (
                $this->one('SELECT 1 FROM blocked_cells WHERE scenario_id=? AND x=? AND y=?', [
                    $s['id'],
                    $x,
                    $y,
                ])
            ) {
                $needs = true;
            }
            if (
                $this->one(
                    'SELECT 1 FROM scenario_players WHERE scenario_id=? AND x=? AND y=? AND health>0 AND placed=1 AND id<>? UNION ALL SELECT 1 FROM npc_characters WHERE scenario_id=? AND x=? AND y=? AND health>0 LIMIT 1',
                    [$s['id'], $x, $y, $sp['id'], $s['id'], $x, $y],
                )
            ) {
                $needs = true;
            }
        }
        $status = $needs ? 'PENDING' : 'APPLIED';
        $this->db
            ->prepare(
                'INSERT INTO movement_requests(scenario_id,user_id,scenario_player_id,path,status,reason) VALUES (?,?,?,?,?,?)',
            )
            ->execute([
                $s['id'],
                $u['id'],
                $sp['id'],
                json_encode($clean),
                $status,
                $needs ? 'Cruza una casilla bloqueada u ocupada' : null,
            ]);
        $id = (int) $this->db->lastInsertId();
        if (!$needs) {
            $last = end($clean);
            $this->db
                ->prepare('UPDATE scenario_players SET x=?,y=?,last_path=? WHERE id=?')
                ->execute([$last['x'], $last['y'], json_encode($clean), $sp['id']]);
        }
        return [
            'id' => $id,
            'status' => $status,
            'path' => $clean,
            'scenarioPlayerId' => (int) $sp['id'],
            'userId' => $u['id'],
            'characterId' => $characterId,
        ];
    }

    private function reviewMovement(array $s, array $u, array $p, bool $approve): array
    {
        $id = (int) ($p['movementId'] ?? 0);
        $m = $this->one(
            "SELECT * FROM movement_requests WHERE id=? AND scenario_id=? AND status='PENDING' FOR UPDATE",
            [$id, $s['id']],
        );
        if (!$m) {
            throw new RuntimeException('Solicitud no disponible.');
        }
        $scenarioPlayerId = (int) ($m['scenario_player_id'] ?? 0);
        if ($scenarioPlayerId < 1) {
            throw new RuntimeException('La solicitud no identifica un personaje.');
        }
        $status = $approve ? 'APPLIED' : 'REJECTED';
        $this->db
            ->prepare('UPDATE movement_requests SET status=?,reviewed_by=? WHERE id=?')
            ->execute([$status, $u['id'], $id]);
        $path = json_decode($m['path'], true);
        if ($approve) {
            $last = end($path);
            $this->db
                ->prepare(
                    'UPDATE scenario_players SET x=?,y=?,last_path=? WHERE id=? AND scenario_id=?',
                )
                ->execute([$last['x'], $last['y'], $m['path'], $scenarioPlayerId, $s['id']]);
        }
        return [
            'id' => $id,
            'status' => $status,
            'path' => $path,
            'scenarioPlayerId' => $scenarioPlayerId,
            'userId' => (int) $m['user_id'],
        ];
    }

    // Encounter initiative and turn order.
    private function encounterPrepare(int $sid): array
    {
        $this->db
            ->prepare(
                "INSERT INTO encounters(scenario_id,state) VALUES (?,'PREPARING') ON DUPLICATE KEY UPDATE state='PREPARING',round_no=0,current_participant_id=NULL,turn_sequence=0",
            )
            ->execute([$sid]);
        $enc = $this->one('SELECT id FROM encounters WHERE scenario_id=?', [$sid]);
        if ($enc) {
            $this->ensureEncounterHealthLogTable();
            $this->db
                ->prepare('DELETE FROM encounter_health_log WHERE encounter_id=?')
                ->execute([$enc['id']]);
        }
        return ['state' => 'PREPARING'];
    }
    private function encounterStart(int $sid, array $p = []): array
    {
        $e = $this->one('SELECT * FROM encounters WHERE scenario_id=? FOR UPDATE', [$sid]);
        if (!$e || !in_array($e['state'], ['PREPARING', 'PAUSED'])) {
            throw new RuntimeException('Primero prepara el encounter.');
        }
        if (array_key_exists('participants', $p)) {
            $this->syncSelectedParticipants((int) $e['id'], $sid, (array) $p['participants']);
        } else {
            $this->syncParticipants((int) $e['id'], $sid);
        }
        $first = $this->one(
            "SELECT * FROM encounter_participants WHERE encounter_id=? AND initiative IS NOT NULL AND state='ACTIVE' ORDER BY initiative DESC,tie_order,id LIMIT 1",
            [$e['id']],
        );
        if (!$first) {
            throw new RuntimeException('No hay participantes con iniciativa.');
        }
        $this->db
            ->prepare(
                "UPDATE encounters SET state='RUNNING',round_no=1,current_participant_id=?,turn_sequence=1 WHERE id=?",
            )
            ->execute([$first['id'], $e['id']]);
        return ['state' => 'RUNNING', 'round' => 1, 'currentParticipantId' => (int) $first['id']];
    }
    private function encounterInclude(int $sid, array $p): array
    {
        $e = $this->one("SELECT * FROM encounters WHERE scenario_id=? AND state<>'OFF'", [$sid]);
        if (!$e) {
            throw new RuntimeException('No hay encounter activo.');
        }
        $kind = strtoupper((string) ($p['kind'] ?? ''));
        $id = (int) ($p['id'] ?? 0);
        $this->upsertParticipant((int) $e['id'], $sid, $kind, $id);
        return compact('kind', 'id');
    }
    private function encounterRestartRound(int $sid): array
    {
        $e = $this->one(
            "SELECT * FROM encounters WHERE scenario_id=? AND state='RUNNING' FOR UPDATE",
            [$sid],
        );
        if (!$e) {
            throw new RuntimeException('No hay combate activo.');
        }
        $first = $this->one(
            "SELECT * FROM encounter_participants WHERE encounter_id=? AND initiative IS NOT NULL AND state='ACTIVE' ORDER BY initiative DESC,tie_order,id LIMIT 1",
            [$e['id']],
        );
        if (!$first) {
            throw new RuntimeException('No hay participantes activos.');
        }
        $this->saveTurnHistory($e);
        $seq = (int) $e['turn_sequence'] + 1;
        $this->db
            ->prepare('UPDATE encounters SET current_participant_id=?,turn_sequence=? WHERE id=?')
            ->execute([$first['id'], $seq, $e['id']]);
        return [
            'state' => 'RUNNING',
            'round' => (int) $e['round_no'],
            'currentParticipantId' => (int) $first['id'],
            'turnSequence' => $seq,
        ];
    }
    private function encounterStop(int $sid): array
    {
        $e = $this->one('SELECT id FROM encounters WHERE scenario_id=?', [$sid]);
        if ($e) {
            $this->db
                ->prepare('DELETE FROM encounter_turn_history WHERE encounter_id=?')
                ->execute([$e['id']]);
        }
        $this->db
            ->prepare(
                "UPDATE encounters SET state='OFF',current_participant_id=NULL WHERE scenario_id=?",
            )
            ->execute([$sid]);
        return ['state' => 'OFF'];
    }

    private function initiativeSet(int $sid, array $p): array
    {
        $kind = strtoupper((string) ($p['kind'] ?? ''));
        $id = (int) ($p['id'] ?? 0);
        $value = $p['initiative'] ?? null;
        $value = $value === null || $value === '' ? null : (int) $value;
        if ($kind === 'NPC') {
            $this->db
                ->prepare('UPDATE npc_characters SET initiative=? WHERE id=? AND scenario_id=?')
                ->execute([$value, $id, $sid]);
        } elseif ($kind === 'PLAYER') {
            $this->db
                ->prepare('UPDATE scenario_players SET initiative=? WHERE id=? AND scenario_id=?')
                ->execute([$value, $id, $sid]);
        } else {
            throw new RuntimeException('Participante inválido.');
        }
        $e = $this->one('SELECT * FROM encounters WHERE scenario_id=?', [$sid]);
        if ($e) {
            $this->syncParticipants((int) $e['id'], $sid);
        }
        return ['kind' => $kind, 'id' => $id, 'initiative' => $value];
    }

    private function initiativeReorder(int $sid, array $p): array
    {
        $e = $this->one('SELECT id FROM encounters WHERE scenario_id=?', [$sid]);
        if (!$e) {
            throw new RuntimeException('No hay encounter.');
        }
        $ids = $p['participantIds'] ?? [];
        if (!is_array($ids)) {
            throw new RuntimeException('Orden inválido.');
        }
        $q = $this->db->prepare(
            'UPDATE encounter_participants SET tie_order=? WHERE id=? AND encounter_id=?',
        );
        foreach (array_values($ids) as $i => $id) {
            $q->execute([$i, (int) $id, $e['id']]);
        }
        return ['participantIds' => $ids];
    }

    private function turnDelay(int $sid, array $user, array $p): array
    {
        $e = $this->one(
            "SELECT * FROM encounters WHERE scenario_id=? AND state='RUNNING' FOR UPDATE",
            [$sid],
        );
        if (!$e) {
            throw new RuntimeException('No hay combate activo.');
        }
        $current = $this->one('SELECT * FROM encounter_participants WHERE id=?', [
            $e['current_participant_id'],
        ]);
        if (!$current) {
            throw new RuntimeException('Turno inválido.');
        }
        if ($user['role'] !== 'DM') {
            if ($current['actor_type'] !== 'PLAYER') {
                throw new RuntimeException('No puedes retrasar este turno.');
            }
            $sp = $this->one('SELECT user_id FROM scenario_players WHERE id=?', [
                $current['actor_id'],
            ]);
            if (!$sp || (int) $sp['user_id'] !== (int) $user['id']) {
                throw new RuntimeException('No es tu turno.');
            }
        }
        $target = (int) ($p['targetParticipantId'] ?? 0);
        if (
            $target === (int) $current['id'] ||
            !$this->one(
                "SELECT 1 FROM encounter_participants WHERE id=? AND encounter_id=? AND state IN ('ACTIVE','DEAD','REMOVED')",
                [$target, $e['id']],
            )
        ) {
            throw new RuntimeException('Objetivo inválido.');
        }
        $ordered = $this->all(
            'SELECT id FROM encounter_participants WHERE encounter_id=? AND initiative IS NOT NULL ORDER BY initiative DESC,tie_order,id',
            [$e['id']],
        );
        $currentPos = $targetPos = -1;
        foreach ($ordered as $i => $part) {
            if ((int) $part['id'] === (int) $current['id']) {
                $currentPos = $i;
            }
            if ((int) $part['id'] === $target) {
                $targetPos = $i;
            }
        }
        $targetRound = (int) $e['round_no'] + ($targetPos <= $currentPos ? 1 : 0);
        $this->db
            ->prepare('UPDATE encounter_participants SET state=\'WAITING\' WHERE id=?')
            ->execute([$current['id']]);
        $this->db
            ->prepare(
                'INSERT INTO turn_delays(encounter_id,waiting_participant_id,target_participant_id,round_no,sort_order) VALUES (?,?,?,?,?)',
            )
            ->execute([
                $e['id'],
                $current['id'],
                $target,
                $targetRound,
                (int) ($p['sortOrder'] ?? 0),
            ]);
        return $this->advanceNormal($e, (int) $current['id']);
    }

    private function turnDelayOrder(int $sid, array $p): array
    {
        $e = $this->one('SELECT id FROM encounters WHERE scenario_id=?', [$sid]);
        if (!$e) {
            throw new RuntimeException('No hay encounter.');
        }
        $ids = $p['delayIds'] ?? [];
        $q = $this->db->prepare(
            'UPDATE turn_delays SET sort_order=? WHERE id=? AND encounter_id=?',
        );
        foreach (array_values($ids) as $i => $id) {
            $q->execute([$i, (int) $id, $e['id']]);
        }
        return ['delayIds' => $ids];
    }

    private function turnNext(int $sid): array
    {
        $e = $this->one(
            "SELECT * FROM encounters WHERE scenario_id=? AND state='RUNNING' FOR UPDATE",
            [$sid],
        );
        if (!$e) {
            throw new RuntimeException('No hay combate activo.');
        }
        $this->saveTurnHistory($e);
        $currentId = (int) $e['current_participant_id'];
        $chain = $this->one(
            'SELECT target_participant_id FROM turn_delays WHERE encounter_id=? AND waiting_participant_id=? AND round_no=? AND triggered=1',
            [$e['id'], $currentId, $e['round_no']],
        );
        $target = $chain ? (int) $chain['target_participant_id'] : $currentId;
        $delay = $this->one(
            'SELECT * FROM turn_delays WHERE encounter_id=? AND target_participant_id=? AND round_no=? AND triggered=0 ORDER BY sort_order,id LIMIT 1',
            [$e['id'], $target, $e['round_no']],
        );
        if ($delay) {
            $this->db
                ->prepare('UPDATE turn_delays SET triggered=1 WHERE id=?')
                ->execute([$delay['id']]);
            $this->db
                ->prepare("UPDATE encounter_participants SET state='ACTIVE' WHERE id=?")
                ->execute([$delay['waiting_participant_id']]);
            $seq = (int) $e['turn_sequence'] + 1;
            $this->db
                ->prepare(
                    'UPDATE encounters SET current_participant_id=?,turn_sequence=? WHERE id=?',
                )
                ->execute([$delay['waiting_participant_id'], $seq, $e['id']]);
            return [
                'state' => 'RUNNING',
                'round' => (int) $e['round_no'],
                'currentParticipantId' => (int) $delay['waiting_participant_id'],
                'turnSequence' => $seq,
            ];
        }
        return $this->advanceNormal($e, $target);
    }

    private function advanceNormal(array $e, int $afterId): array
    {
        $all = $this->all(
            'SELECT * FROM encounter_participants WHERE encounter_id=? AND initiative IS NOT NULL ORDER BY initiative DESC,tie_order,id',
            [$e['id']],
        );
        $active = array_values(array_filter($all, fn($x) => $x['state'] === 'ACTIVE'));
        if (!$active) {
            throw new RuntimeException('No hay participantes activos.');
        }
        $pos = -1;
        foreach ($all as $i => $a) {
            if ((int) $a['id'] === $afterId) {
                $pos = $i;
            }
        }
        $pick = null;
        for ($n = 1; $n <= count($all); $n++) {
            $candidate = $all[($pos + $n) % count($all)];
            if ($candidate['state'] === 'ACTIVE') {
                $pick = $candidate;
                break;
            }
        }
        $round = (int) $e['round_no'];
        $pickPos = array_search($pick, $all, true);
        if ($pickPos !== false && $pickPos <= $pos) {
            $round++;
        }
        $seq = (int) $e['turn_sequence'] + 1;
        $this->db
            ->prepare(
                'UPDATE encounters SET current_participant_id=?,round_no=?,turn_sequence=? WHERE id=?',
            )
            ->execute([$pick['id'], $round, $seq, $e['id']]);
        return [
            'state' => 'RUNNING',
            'round' => $round,
            'currentParticipantId' => (int) $pick['id'],
            'turnSequence' => $seq,
        ];
    }

    private function turnRollback(int $sid): array
    {
        $e = $this->one(
            "SELECT * FROM encounters WHERE scenario_id=? AND state='RUNNING' FOR UPDATE",
            [$sid],
        );
        if (!$e) {
            throw new RuntimeException('No hay combate activo.');
        }
        $h = $this->one(
            'SELECT * FROM encounter_turn_history WHERE encounter_id=? ORDER BY id DESC LIMIT 1',
            [$e['id']],
        );
        if (!$h) {
            throw new RuntimeException('No hay turnos para devolver.');
        }
        $this->db
            ->prepare(
                'UPDATE encounters SET current_participant_id=?,round_no=?,turn_sequence=? WHERE id=?',
            )
            ->execute([
                $h['previous_participant_id'],
                $h['previous_round_no'],
                $h['previous_turn_sequence'],
                $e['id'],
            ]);
        $this->db->prepare('DELETE FROM encounter_turn_history WHERE id=?')->execute([$h['id']]);
        return [
            'state' => 'RUNNING',
            'round' => (int) $h['previous_round_no'],
            'currentParticipantId' => (int) $h['previous_participant_id'],
            'turnSequence' => (int) $h['previous_turn_sequence'],
        ];
    }
    private function saveTurnHistory(array $e): void
    {
        $this->db
            ->prepare(
                'INSERT INTO encounter_turn_history(encounter_id,previous_participant_id,previous_round_no,previous_turn_sequence) VALUES (?,?,?,?)',
            )
            ->execute([
                $e['id'],
                $e['current_participant_id'],
                $e['round_no'],
                $e['turn_sequence'],
            ]);
    }

    // Health and player-controlled token updates.
    private function healthSet(int $sid, array $p): array
    {
        $kind = strtoupper((string) ($p['kind'] ?? ''));
        $id = (int) ($p['id'] ?? 0);
        $health = (int) ($p['health'] ?? 0);
        if ($kind === 'PLAYER') {
            $health = max(-10, $health);
        } elseif ($kind === 'NPC') {
            $health = max(0, $health);
        }
        $hasMax = array_key_exists('maxHealth', $p);
        $maxHealth = $hasMax ? max(1, (int) $p['maxHealth']) : null;
        $oldHealth = null;
        $actorName = '';
        if ($kind === 'NPC') {
            $old = $this->one(
                'SELECT health,name FROM npc_characters WHERE id=? AND scenario_id=?',
                [$id, $sid],
            );
            if ($old) {
                $oldHealth = (int) $old['health'];
                $actorName = (string) $old['name'];
            }
            if ($hasMax) {
                $this->db
                    ->prepare(
                        'UPDATE npc_characters SET health=?,max_health=? WHERE id=? AND scenario_id=?',
                    )
                    ->execute([$health, $maxHealth, $id, $sid]);
            } else {
                $this->db
                    ->prepare('UPDATE npc_characters SET health=? WHERE id=? AND scenario_id=?')
                    ->execute([$health, $id, $sid]);
            }
            if ($health <= 0) {
                $this->db
                    ->prepare(
                        "UPDATE encounter_participants ep JOIN encounters e ON e.id=ep.encounter_id SET ep.state='DEAD' WHERE e.scenario_id=? AND ep.actor_type='NPC' AND ep.actor_id=?",
                    )
                    ->execute([$sid, $id]);
            }
        } elseif ($kind === 'PLAYER') {
            $old = $this->one(
                'SELECT sp.health,pc.name FROM scenario_players sp JOIN player_characters pc ON pc.id=sp.character_id WHERE sp.id=? AND sp.scenario_id=?',
                [$id, $sid],
            );
            if ($old) {
                $oldHealth = (int) $old['health'];
                $actorName = (string) $old['name'];
            }
            $this->db
                ->prepare('UPDATE scenario_players SET health=? WHERE id=? AND scenario_id=?')
                ->execute([$health, $id, $sid]);
            if ($hasMax) {
                $this->db
                    ->prepare(
                        'UPDATE player_characters pc JOIN scenario_players sp ON sp.character_id=pc.id SET pc.max_health=? WHERE sp.id=? AND sp.scenario_id=?',
                    )
                    ->execute([$maxHealth, $id, $sid]);
            }
        } else {
            throw new RuntimeException('Participante inválido.');
        }
        if ($oldHealth !== null) {
            $this->logHealthChange($sid, $kind, $id, $actorName, $oldHealth, $health);
        }
        $out = compact('kind', 'id', 'health');
        if ($hasMax) {
            $out['maxHealth'] = $maxHealth;
        }
        return $out;
    }

    private function playerHealthSet(int $sid, array $user, array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        $health = (int) ($p['health'] ?? 0);
        $row = $this->one(
            'SELECT sp.id,pc.max_health FROM scenario_players sp JOIN player_characters pc ON pc.id=sp.character_id WHERE sp.id=? AND sp.scenario_id=? AND sp.user_id=? AND sp.placed=1',
            [$id, $sid, $user['id']],
        );
        if (!$row) {
            throw new RuntimeException('Solo puedes curar tu propia ficha seleccionada.');
        }
        $max = (int) $row['max_health'];
        $health = max(0, min($max, $health));
        $old = $this->one(
            'SELECT sp.health,pc.name FROM scenario_players sp JOIN player_characters pc ON pc.id=sp.character_id WHERE sp.id=? AND sp.scenario_id=? AND sp.user_id=?',
            [$id, $sid, $user['id']],
        );
        $this->db
            ->prepare(
                'UPDATE scenario_players SET health=? WHERE id=? AND scenario_id=? AND user_id=?',
            )
            ->execute([$health, $id, $sid, $user['id']]);
        if ($old) {
            $this->logHealthChange(
                $sid,
                'PLAYER',
                $id,
                (string) $old['name'],
                (int) $old['health'],
                $health,
            );
        }
        return ['kind' => 'PLAYER', 'id' => $id, 'health' => $health];
    }

    private function playerRotate(int $sid, array $user, array $p): array
    {
        if ($user['role'] !== 'PLAYER') {
            throw new RuntimeException('Rotación de jugador inválida.');
        }
        $this->db->exec(
            'ALTER TABLE scenario_players ADD COLUMN IF NOT EXISTS rotation_degrees SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER token_color',
        );
        $id = (int) ($p['id'] ?? 0);
        $degrees = $this->snapRotation((int) ($p['rotation_degrees'] ?? 0));
        $this->db
            ->prepare(
                'UPDATE scenario_players SET rotation_degrees=? WHERE id=? AND scenario_id=? AND user_id=? AND placed=1',
            )
            ->execute([$degrees, $id, $sid, $user['id']]);
        if ($this->db->query('SELECT ROW_COUNT()')->fetchColumn() < 1) {
            throw new RuntimeException('Solo puedes rotar tu propia ficha seleccionada.');
        }
        return ['kind' => 'PLAYER', 'id' => $id, 'rotation_degrees' => $degrees];
    }

    private function syncParticipants(int $eid, int $sid): void
    {
        $this->db
            ->prepare(
                "INSERT INTO encounter_participants(encounter_id,actor_type,actor_id,initiative) SELECT ?,'PLAYER',id,initiative FROM scenario_players WHERE scenario_id=? AND placed=1 AND initiative IS NOT NULL ON DUPLICATE KEY UPDATE initiative=VALUES(initiative),state=IF(state='REMOVED',state,'ACTIVE')",
            )
            ->execute([$eid, $sid]);
        $this->db
            ->prepare(
                "INSERT INTO encounter_participants(encounter_id,actor_type,actor_id,initiative,state) SELECT ?,'NPC',id,initiative,IF(health<=0,'DEAD','ACTIVE') FROM npc_characters WHERE scenario_id=? AND visible=1 AND initiative IS NOT NULL ON DUPLICATE KEY UPDATE initiative=VALUES(initiative),state=VALUES(state)",
            )
            ->execute([$eid, $sid]);
    }
    private function syncSelectedParticipants(int $eid, int $sid, array $items): void
    {
        $this->db
            ->prepare("UPDATE encounter_participants SET state='REMOVED' WHERE encounter_id=?")
            ->execute([$eid]);
        foreach (array_slice($items, 0, 200) as $item) {
            $kind = strtoupper((string) ($item['kind'] ?? ''));
            $id = (int) ($item['id'] ?? 0);
            if ($id > 0) {
                $this->upsertParticipant($eid, $sid, $kind, $id);
            }
        }
    }
    private function upsertParticipant(int $eid, int $sid, string $kind, int $id): void
    {
        if ($kind === 'PLAYER') {
            $row = $this->one(
                'SELECT initiative FROM scenario_players WHERE id=? AND scenario_id=? AND placed=1',
                [$id, $sid],
            );
            if (!$row) {
                throw new RuntimeException('Jugador no válido para combate.');
            }
            $state = 'ACTIVE';
        } elseif ($kind === 'NPC') {
            $row = $this->one(
                'SELECT initiative,health FROM npc_characters WHERE id=? AND scenario_id=? AND visible=1',
                [$id, $sid],
            );
            if (!$row) {
                throw new RuntimeException('NPC no válido para combate.');
            }
            $state = (int) $row['health'] <= 0 ? 'DEAD' : 'ACTIVE';
        } else {
            throw new RuntimeException('Tipo de participante inválido.');
        }
        $this->db
            ->prepare(
                'INSERT INTO encounter_participants(encounter_id,actor_type,actor_id,initiative,state) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE initiative=VALUES(initiative),state=VALUES(state)',
            )
            ->execute([$eid, $kind, $id, $row['initiative'], $state]);
    }

    // Compatibility helpers for installations that have not run every migration yet.
    private function ensurePlayerCharacterDrawingColorColumn(): void
    {
        $this->db->exec(
            "ALTER TABLE player_characters ADD COLUMN IF NOT EXISTS drawing_color VARCHAR(20) NOT NULL DEFAULT '#ffffff' AFTER avatar_asset_id",
        );
    }

    private function ensureMapFocusTable(): void
    {
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS scenario_map_focus (scenario_id BIGINT UNSIGNED PRIMARY KEY, x INT UNSIGNED NOT NULL, y INT UNSIGNED NOT NULL, width_cells INT UNSIGNED NOT NULL, height_cells INT UNSIGNED NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB',
        );
    }
    private function setMapFocus(array $s, array $p): array
    {
        $this->ensureMapFocusTable();
        $x = max(0, (int) ($p['x'] ?? 0));
        $y = max(0, (int) ($p['y'] ?? 0));
        $w = max(1, (int) ($p['widthCells'] ?? 1));
        $h = max(1, (int) ($p['heightCells'] ?? 1));
        if ($x + $w > (int) $s['width']) {
            $w = (int) $s['width'] - $x;
        }
        if ($y + $h > (int) $s['height']) {
            $h = (int) $s['height'] - $y;
        }
        if ($w < 1 || $h < 1) {
            throw new RuntimeException('Área de mapa inválida.');
        }
        $this->db
            ->prepare(
                'INSERT INTO scenario_map_focus(scenario_id,x,y,width_cells,height_cells) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE x=VALUES(x),y=VALUES(y),width_cells=VALUES(width_cells),height_cells=VALUES(height_cells)',
            )
            ->execute([$s['id'], $x, $y, $w, $h]);
        return ['x' => $x, 'y' => $y, 'widthCells' => $w, 'heightCells' => $h];
    }
    private function clearMapFocus(array $s): array
    {
        $this->ensureMapFocusTable();
        $this->db
            ->prepare('DELETE FROM scenario_map_focus WHERE scenario_id=?')
            ->execute([$s['id']]);
        return ['cleared' => true];
    }

    private function ensureChatTables(): void
    {
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS dm_player_chats (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, campaign_id BIGINT UNSIGNED NOT NULL, player_id BIGINT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE(campaign_id,player_id), INDEX(campaign_id,updated_at)) ENGINE=InnoDB',
        );
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS dm_player_chat_messages (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, chat_id BIGINT UNSIGNED NOT NULL, sender_id BIGINT UNSIGNED NOT NULL, message TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, read_by_dm BOOLEAN NOT NULL DEFAULT FALSE, read_by_player BOOLEAN NOT NULL DEFAULT FALSE, INDEX(chat_id,id), INDEX(sender_id,created_at)) ENGINE=InnoDB',
        );
    }
    private function ensurePlayerChat(int $campaignId, int $playerId): array
    {
        $this->db
            ->prepare('INSERT IGNORE INTO dm_player_chats(campaign_id,player_id) VALUES (?,?)')
            ->execute([$campaignId, $playerId]);
        $chat = $this->one('SELECT * FROM dm_player_chats WHERE campaign_id=? AND player_id=?', [
            $campaignId,
            $playerId,
        ]);
        if (!$chat) {
            throw new RuntimeException('No se pudo abrir el chat.');
        }
        return $chat;
    }

    private function ensureEncounterHealthLogTable(): void
    {
        $this->db->exec(
            "CREATE TABLE IF NOT EXISTS encounter_health_log (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, encounter_id BIGINT UNSIGNED NOT NULL, round_no INT UNSIGNED NOT NULL DEFAULT 0, actor_type ENUM('PLAYER','NPC') NOT NULL, actor_id BIGINT UNSIGNED NOT NULL, actor_name VARCHAR(120) NOT NULL, action_type ENUM('DAMAGE','HEAL') NOT NULL, amount INT NOT NULL, health_before INT NOT NULL, health_after INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(encounter_id,id), INDEX(encounter_id,actor_type,actor_id)) ENGINE=InnoDB",
        );
    }
    private function hasEncounterHealthLog(int $encounterId): bool
    {
        $this->ensureEncounterHealthLogTable();
        return (bool) $this->one(
            'SELECT 1 FROM encounter_health_log WHERE encounter_id=? LIMIT 1',
            [$encounterId],
        );
    }
    private function logHealthChange(
        int $sid,
        string $kind,
        int $id,
        string $name,
        int $before,
        int $after,
    ): void {
        if ($before === $after) {
            return;
        }
        $enc = $this->one(
            "SELECT id,round_no,state FROM encounters WHERE scenario_id=? AND state<>'OFF'",
            [$sid],
        );
        if (!$enc) {
            return;
        }
        $amount = abs($after - $before);
        $action = $after < $before ? 'DAMAGE' : 'HEAL';
        $this->ensureEncounterHealthLogTable();
        $this->db
            ->prepare(
                'INSERT INTO encounter_health_log(encounter_id,round_no,actor_type,actor_id,actor_name,action_type,amount,health_before,health_after) VALUES (?,?,?,?,?,?,?,?,?)',
            )
            ->execute([
                $enc['id'],
                (int) $enc['round_no'],
                $kind,
                $id,
                $name,
                $action,
                $amount,
                $before,
                $after,
            ]);
    }

    private function validateObjectSize(array $s, int $x, int $y, int $width, int $height): void
    {
        if (
            $width < 1 ||
            $height < 1 ||
            $width > 60 ||
            $height > 60 ||
            $x + $width > (int) $s['width'] ||
            $y + $height > (int) $s['height']
        ) {
            throw new RuntimeException('El área del objeto queda fuera del mapa.');
        }
    }
    private function coords(array $s, array $c): array
    {
        $x = filter_var($c['x'] ?? null, FILTER_VALIDATE_INT);
        $y = filter_var($c['y'] ?? null, FILTER_VALIDATE_INT);
        if (
            $x === false ||
            $y === false ||
            $x < 0 ||
            $y < 0 ||
            $x >= (int) $s['width'] ||
            $y >= (int) $s['height']
        ) {
            throw new RuntimeException('Coordenadas fuera del mapa.');
        }
        return [(int) $x, (int) $y];
    }
    private function assertMember(int $cid, int $uid): void
    {
        if (
            !$this->one('SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=?', [
                $cid,
                $uid,
            ])
        ) {
            throw new RuntimeException('Sin acceso a la campaña.');
        }
    }
    private function one(string $sql, array $args = []): array|false
    {
        $q = $this->db->prepare($sql);
        $q->execute($args);
        return $q->fetch();
    }
    private function all(string $sql, array $args = []): array
    {
        $q = $this->db->prepare($sql);
        $q->execute($args);
        return $q->fetchAll();
    }
}
