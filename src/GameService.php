<?php
declare(strict_types=1);

namespace Dnd;

use PDO;
use RuntimeException;

final class GameService
{
    public function __construct(private PDO $db) {}

    public function bootstrap(array $user): array
    {
        $campaigns=$this->all('SELECT c.* FROM campaigns c JOIN campaign_members m ON m.campaign_id=c.id WHERE m.user_id=? ORDER BY c.id',[$user['id']]);
        $characters=$user['role']==='PLAYER' ? $this->all('SELECT p.*,a.path avatar_path FROM player_characters p LEFT JOIN assets a ON a.id=p.avatar_asset_id WHERE p.owner_id=?',[$user['id']]) : [];
        $scenarioSql='SELECT s.*,a.path background_path FROM scenarios s LEFT JOIN assets a ON a.id=s.background_asset_id WHERE s.campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id=?)';
        if($user['role']!=='DM') $scenarioSql.=' AND s.active=1';
        $scenarioSql.=' ORDER BY s.active DESC,s.name';
        $scenarios=$this->all($scenarioSql,[$user['id']]);
        foreach($scenarios as &$s){ $s['id']=(int)$s['id']; $s['width']=(int)$s['width']; $s['height']=(int)$s['height']; $s['active']=(bool)$s['active']; }
        return compact('campaigns','characters','scenarios');
    }

    public function snapshot(int $scenarioId, array $user): array
    {
        $s=$this->one('SELECT s.*,a.path background_path FROM scenarios s LEFT JOIN assets a ON a.id=s.background_asset_id WHERE s.id=?',[$scenarioId]);
        if(!$s) throw new RuntimeException('Escenario inexistente.');
        $this->assertMember((int)$s['campaign_id'],(int)$user['id']);
        if($user['role']!=='DM' && !(bool)$s['active']) throw new RuntimeException('El escenario no está activo.');
        $blocked=$this->all('SELECT x,y FROM blocked_cells WHERE scenario_id=?',[$scenarioId]);
        $objects=$this->all('SELECT o.*,a.path image_path FROM map_objects o LEFT JOIN assets a ON a.id=o.image_asset_id WHERE o.scenario_id=?'.($user['role']==='DM'?'':' AND o.visible=1'),[$scenarioId]);
        $npcSql='SELECT n.*,a.path image_path FROM npc_characters n LEFT JOIN assets a ON a.id=n.image_asset_id WHERE n.scenario_id=?';
        if($user['role']!=='DM') $npcSql.=' AND n.visible=1 AND NOT(n.health<=0 OR n.dead_hidden=1)';
        $npcs=$this->all($npcSql,[$scenarioId]);
        $players=$this->all('SELECT sp.*,u.name user_name,pc.name,pc.avatar_asset_id image_asset_id,a.path image_path,dpn.notes dm_notes FROM scenario_players sp JOIN users u ON u.id=sp.user_id JOIN player_characters pc ON pc.id=sp.character_id LEFT JOIN assets a ON a.id=pc.avatar_asset_id LEFT JOIN dm_player_notes dpn ON dpn.player_id=sp.user_id AND dpn.campaign_id=pc.campaign_id WHERE sp.scenario_id=?'.($user['role']==='DM'?'':' AND sp.placed=1'),[$scenarioId]);
        $encounter=$this->one('SELECT * FROM encounters WHERE scenario_id=?',[$scenarioId]);
        $participants=[];
        if($encounter) $participants=$this->all('SELECT * FROM encounter_participants WHERE encounter_id=? ORDER BY initiative DESC,tie_order,id',[$encounter['id']]);
        if($user['role']!=='DM' && $encounter){
            $participants=array_values(array_filter($participants,fn($part)=>$part['actor_type']==='PLAYER'));
            if($encounter['current_participant_id'] && !array_filter($participants,fn($part)=>(int)$part['id']===(int)$encounter['current_participant_id'])) $encounter['current_participant_id']=null;
        }
        $pending=$user['role']==='DM'?$this->all("SELECT mr.*,u.name user_name FROM movement_requests mr JOIN users u ON u.id=mr.user_id WHERE mr.scenario_id=? AND mr.status='PENDING'",[$scenarioId]):[];
        $notes=$user['role']==='DM'?$this->all('SELECT * FROM cell_notes WHERE scenario_id=?',[$scenarioId]):[];
        if($user['role']!=='DM') { foreach($objects as &$o) unset($o['notes']); foreach($npcs as &$n) unset($n['notes']); foreach($players as &$pl) unset($pl['dm_notes']); }
        return ['scenario'=>$s,'blocked'=>$blocked,'objects'=>$objects,'npcs'=>$npcs,'players'=>$players,'encounter'=>$encounter,'participants'=>$participants,'pendingMovements'=>$pending,'cellNotes'=>$notes];
    }

    public function command(array $user, string $type, array $p, string $requestId): array
    {
        if(!preg_match('/^[A-Za-z0-9_-]{8,64}$/',$requestId)) throw new RuntimeException('requestId inválido.');
        $old=$this->one('SELECT response FROM command_receipts WHERE request_id=? AND user_id=?',[$requestId,$user['id']]);
        if($old) return json_decode($old['response'],true);
        $scenarioId=(int)($p['scenarioId']??0);
        $result=Database::transaction(function() use($user,$type,$p,$scenarioId,$requestId){
            $s=$this->one('SELECT * FROM scenarios WHERE id=? FOR UPDATE',[$scenarioId]);
            if(!$s) throw new RuntimeException('Escenario inexistente.');
            $this->assertMember((int)$s['campaign_id'],(int)$user['id']);
            $dmOnly=['scenario.activate','scenario.deactivate','map.cells.paint','object.create','npc.create','token.update','token.move_dm','movement.approve','movement.reject','encounter.prepare','encounter.start','encounter.stop','initiative.set','initiative.reorder_tie','turn.next','turn.delay_order','health.set','cell.note','player.note'];
            if(in_array($type,$dmOnly,true) && $user['role']!=='DM') throw new RuntimeException('Acción exclusiva del DM.');
            $data=match($type){
                'scenario.activate'=>$this->activate($scenarioId,true),
                'scenario.deactivate'=>$this->activate($scenarioId,false),
                'map.cells.paint'=>$this->paint($s,$p),
                'cell.note'=>$this->cellNote($s,$p),
                'player.note'=>$this->playerNote($s,$p),
                'object.create'=>$this->createObject($s,$p),
                'npc.create'=>$this->createNpc($s,$p),
                'token.update'=>$this->updateToken($s,$p),
                'token.move_dm'=>$this->moveDm($s,$p),
                'player.place'=>$this->placePlayer($s,$user,$p),
                'movement.submit'=>$this->submitMovement($s,$user,$p),
                'movement.approve'=>$this->reviewMovement($s,$user,$p,true),
                'movement.reject'=>$this->reviewMovement($s,$user,$p,false),
                'encounter.prepare'=>$this->encounterPrepare($scenarioId),
                'encounter.start'=>$this->encounterStart($scenarioId),
                'encounter.stop'=>$this->encounterStop($scenarioId),
                'initiative.set'=>$this->initiativeSet($scenarioId,$p),
                'initiative.reorder_tie'=>$this->initiativeReorder($scenarioId,$p),
                'turn.next'=>$this->turnNext($scenarioId),
                'turn.delay'=>$this->turnDelay($scenarioId,$user,$p),
                'turn.delay_order'=>$this->turnDelayOrder($scenarioId,$p),
                'health.set'=>$this->healthSet($scenarioId,$p),
                default=>throw new RuntimeException('Comando desconocido.')
            };
            $version=(int)$s['version']+1;
            $this->db->prepare('UPDATE scenarios SET version=? WHERE id=?')->execute([$version,$scenarioId]);
            $event=['type'=>$type,'scenarioId'=>$scenarioId,'version'=>$version,'data'=>$data];
            $this->db->prepare('INSERT INTO scenario_events(scenario_id,version,event_type,actor_id,payload) VALUES (?,?,?,?,?)')->execute([$scenarioId,$version,$type,$user['id'],json_encode($event,JSON_UNESCAPED_UNICODE)]);
            $this->db->prepare('INSERT INTO command_receipts(request_id,user_id,response) VALUES (?,?,?)')->execute([$requestId,$user['id'],json_encode($event,JSON_UNESCAPED_UNICODE)]);
            return $event;
        });
        return $result;
    }

    private function activate(int $id,bool $active): array { $this->db->prepare('UPDATE scenarios SET active=? WHERE id=?')->execute([$active?1:0,$id]); if(!$active)$this->db->prepare('UPDATE scenario_players SET placed=0 WHERE scenario_id=?')->execute([$id]); return ['active'=>$active]; }

    private function paint(array $s,array $p): array
    {
        $cells=$p['cells']??[]; if(!is_array($cells)||count($cells)>3600) throw new RuntimeException('Selección inválida.');
        $blocked=(bool)($p['blocked']??true);
        $ins=$this->db->prepare('INSERT IGNORE INTO blocked_cells(scenario_id,x,y) VALUES (?,?,?)'); $del=$this->db->prepare('DELETE FROM blocked_cells WHERE scenario_id=? AND x=? AND y=?');
        foreach($cells as $c){ [$x,$y]=$this->coords($s,$c); ($blocked?$ins:$del)->execute([$s['id'],$x,$y]); }
        return ['cells'=>$cells,'blocked'=>$blocked];
    }

    private function playerNote(array $s,array $p): array { $playerId=(int)($p['playerId']??0);$notes=(string)($p['notes']??'');if(!$this->one('SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=?',[$s['campaign_id'],$playerId]))throw new RuntimeException('Jugador inválido.');$this->db->prepare('INSERT INTO dm_player_notes(campaign_id,player_id,notes) VALUES (?,?,?) ON DUPLICATE KEY UPDATE notes=VALUES(notes)')->execute([$s['campaign_id'],$playerId,$notes]);return ['playerId'=>$playerId]; }

    private function cellNote(array $s,array $p): array { [$x,$y]=$this->coords($s,$p); $notes=trim((string)($p['notes']??'')); if($notes==='')$this->db->prepare('DELETE FROM cell_notes WHERE scenario_id=? AND x=? AND y=?')->execute([$s['id'],$x,$y]); else $this->db->prepare('INSERT INTO cell_notes(scenario_id,x,y,notes) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE notes=VALUES(notes)')->execute([$s['id'],$x,$y,$notes]); return compact('x','y','notes'); }

    private function createObject(array $s,array $p): array { [$x,$y]=$this->coords($s,$p); $this->db->prepare('INSERT INTO map_objects(scenario_id,name,x,y,notes,visible,image_asset_id) VALUES (?,?,?,?,?,?,?)')->execute([$s['id'],trim((string)($p['name']??'Objeto'))?:'Objeto',$x,$y,$p['notes']??null,!empty($p['visible'])?1:0,$p['imageAssetId']??null]); return ['id'=>(int)$this->db->lastInsertId(),'kind'=>'OBJECT','x'=>$x,'y'=>$y]; }
    private function createNpc(array $s,array $p): array { [$x,$y]=$this->coords($s,$p); $this->db->prepare('INSERT INTO npc_characters(scenario_id,name,x,y,notes,health,initiative,visible,image_asset_id) VALUES (?,?,?,?,?,?,?,?,?)')->execute([$s['id'],trim((string)($p['name']??'NPC'))?:'NPC',$x,$y,$p['notes']??null,(int)($p['health']??1),isset($p['initiative'])?(int)$p['initiative']:null,!empty($p['visible'])?1:0,$p['imageAssetId']??null]); return ['id'=>(int)$this->db->lastInsertId(),'kind'=>'NPC','x'=>$x,'y'=>$y]; }

    private function updateToken(array $s,array $p): array
    {
        $kind=strtoupper((string)($p['kind']??'')); $id=(int)($p['id']??0);
        if($kind==='NPC') { $fields=['name','notes','health','initiative','visible','dead_hidden','image_asset_id']; $table='npc_characters'; }
        elseif($kind==='OBJECT') { $fields=['name','notes','visible','image_asset_id']; $table='map_objects'; }
        else throw new RuntimeException('Tipo de token inválido.');
        $sets=[];$vals=[]; foreach($fields as $f)if(array_key_exists($f,$p)){$sets[]="$f=?";$vals[]=$p[$f];}
        if(!$sets)throw new RuntimeException('No hay cambios.'); $vals[]=$id;$vals[]=$s['id'];
        $this->db->prepare("UPDATE $table SET ".implode(',',$sets).' WHERE id=? AND scenario_id=?')->execute($vals);
        return ['kind'=>$kind,'id'=>$id];
    }

    private function moveDm(array $s,array $p): array { [$x,$y]=$this->coords($s,$p); $kind=strtoupper((string)$p['kind']);$id=(int)$p['id']; $table=match($kind){'NPC'=>'npc_characters','OBJECT'=>'map_objects','PLAYER'=>'scenario_players',default=>throw new RuntimeException('Token inválido.')}; $this->db->prepare("UPDATE $table SET x=?,y=? WHERE id=? AND scenario_id=?")->execute([$x,$y,$id,$s['id']]); return compact('kind','id','x','y'); }

    private function placePlayer(array $s,array $u,array $p): array
    {
        if($u['role']!=='PLAYER')throw new RuntimeException('Solo los jugadores se colocan.'); if(!$s['active'])throw new RuntimeException('El escenario no está activo.'); [$x,$y]=$this->coords($s,$p);
        $cid=(int)($p['characterId']??0); $c=$this->one('SELECT * FROM player_characters WHERE id=? AND owner_id=? AND campaign_id=?',[$cid,$u['id'],$s['campaign_id']]); if(!$c)throw new RuntimeException('Personaje inválido.');
        $this->db->prepare('UPDATE scenario_players SET placed=0 WHERE user_id=?')->execute([$u['id']]);
        $this->db->prepare('INSERT INTO scenario_players(scenario_id,user_id,character_id,x,y,health) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE character_id=VALUES(character_id),x=VALUES(x),y=VALUES(y),health=VALUES(health),placed=1')->execute([$s['id'],$u['id'],$cid,$x,$y,$c['max_health']]);
        return ['userId'=>$u['id'],'characterId'=>$cid,'x'=>$x,'y'=>$y];
    }

    private function submitMovement(array $s,array $u,array $p): array
    {
        if($u['role']!=='PLAYER')throw new RuntimeException('Movimiento de jugador inválido.');
        $sp=$this->one('SELECT * FROM scenario_players WHERE scenario_id=? AND user_id=? FOR UPDATE',[$s['id'],$u['id']]); if(!$sp)throw new RuntimeException('Coloca primero tu personaje.');
        $enc=$this->one('SELECT * FROM encounters WHERE scenario_id=?',[$s['id']]);
        if($enc&&$enc['state']==='RUNNING'){ $cur=$this->one('SELECT * FROM encounter_participants WHERE id=?',[$enc['current_participant_id']]); if(!$cur||$cur['actor_type']!=='PLAYER'||(int)$cur['actor_id']!==(int)$sp['id'])throw new RuntimeException('No es tu turno.'); }
        $path=$p['path']??[]; if(!is_array($path)||count($path)<1||count($path)>3600)throw new RuntimeException('Camino inválido.');
        $prev=[(int)$sp['x'],(int)$sp['y']];$needs=false;$clean=[];
        foreach($path as $c){[$x,$y]=$this->coords($s,$c);$dx=abs($x-$prev[0]);$dy=abs($y-$prev[1]);if(max($dx,$dy)!==1)throw new RuntimeException('Las casillas del camino deben ser contiguas.');$clean[]=['x'=>$x,'y'=>$y];$prev=[$x,$y];
            if($this->one('SELECT 1 FROM blocked_cells WHERE scenario_id=? AND x=? AND y=?',[$s['id'],$x,$y]))$needs=true;
            if($this->one('SELECT 1 FROM scenario_players WHERE scenario_id=? AND x=? AND y=? AND health>0 AND id<>? UNION ALL SELECT 1 FROM npc_characters WHERE scenario_id=? AND x=? AND y=? AND health>0 LIMIT 1',[$s['id'],$x,$y,$sp['id'],$s['id'],$x,$y]))$needs=true;
        }
        $status=$needs?'PENDING':'APPLIED';$this->db->prepare('INSERT INTO movement_requests(scenario_id,user_id,path,status,reason) VALUES (?,?,?,?,?)')->execute([$s['id'],$u['id'],json_encode($clean),$status,$needs?'Cruza una casilla bloqueada u ocupada':null]);$id=(int)$this->db->lastInsertId();
        if(!$needs){$last=end($clean);$this->db->prepare('UPDATE scenario_players SET x=?,y=?,last_path=? WHERE id=?')->execute([$last['x'],$last['y'],json_encode($clean),$sp['id']]);}
        return ['id'=>$id,'status'=>$status,'path'=>$clean,'userId'=>$u['id']];
    }

    private function reviewMovement(array $s,array $u,array $p,bool $approve): array
    {
        $id=(int)($p['movementId']??0);$m=$this->one("SELECT * FROM movement_requests WHERE id=? AND scenario_id=? AND status='PENDING' FOR UPDATE",[$id,$s['id']]);if(!$m)throw new RuntimeException('Solicitud no disponible.');
        $status=$approve?'APPLIED':'REJECTED';$this->db->prepare('UPDATE movement_requests SET status=?,reviewed_by=? WHERE id=?')->execute([$status,$u['id'],$id]);$path=json_decode($m['path'],true);
        if($approve){$last=end($path);$this->db->prepare('UPDATE scenario_players SET x=?,y=?,last_path=? WHERE scenario_id=? AND user_id=?')->execute([$last['x'],$last['y'],$m['path'],$s['id'],$m['user_id']]);}
        return ['id'=>$id,'status'=>$status,'path'=>$path,'userId'=>(int)$m['user_id']];
    }

    private function encounterPrepare(int $sid): array { $this->db->prepare("INSERT INTO encounters(scenario_id,state) VALUES (?,'PREPARING') ON DUPLICATE KEY UPDATE state='PREPARING',round_no=0,current_participant_id=NULL,turn_sequence=0")->execute([$sid]); return ['state'=>'PREPARING']; }
    private function encounterStart(int $sid): array
    {
        $e=$this->one('SELECT * FROM encounters WHERE scenario_id=? FOR UPDATE',[$sid]);if(!$e||!in_array($e['state'],['PREPARING','PAUSED']))throw new RuntimeException('Primero prepara el encounter.');
        $this->syncParticipants((int)$e['id'],$sid);$first=$this->one("SELECT * FROM encounter_participants WHERE encounter_id=? AND initiative IS NOT NULL AND state='ACTIVE' ORDER BY initiative DESC,tie_order,id LIMIT 1",[$e['id']]);if(!$first)throw new RuntimeException('No hay participantes con iniciativa.');
        $this->db->prepare("UPDATE encounters SET state='RUNNING',round_no=1,current_participant_id=?,turn_sequence=1 WHERE id=?")->execute([$first['id'],$e['id']]);return ['state'=>'RUNNING','round'=>1,'currentParticipantId'=>(int)$first['id']];
    }
    private function encounterStop(int $sid): array { $this->db->prepare("UPDATE encounters SET state='OFF',current_participant_id=NULL WHERE scenario_id=?")->execute([$sid]);return ['state'=>'OFF']; }

    private function initiativeSet(int $sid,array $p): array
    {
        $kind=strtoupper((string)($p['kind']??''));$id=(int)($p['id']??0);$value=($p['initiative']??null);$value=$value===null||$value===''?null:(int)$value;
        if($kind==='NPC')$this->db->prepare('UPDATE npc_characters SET initiative=? WHERE id=? AND scenario_id=?')->execute([$value,$id,$sid]);elseif($kind==='PLAYER')$this->db->prepare('UPDATE scenario_players SET initiative=? WHERE id=? AND scenario_id=?')->execute([$value,$id,$sid]);else throw new RuntimeException('Participante inválido.');
        $e=$this->one('SELECT * FROM encounters WHERE scenario_id=?',[$sid]);if($e)$this->syncParticipants((int)$e['id'],$sid);return ['kind'=>$kind,'id'=>$id,'initiative'=>$value];
    }

    private function initiativeReorder(int $sid,array $p): array
    {
        $e=$this->one('SELECT id FROM encounters WHERE scenario_id=?',[$sid]);if(!$e)throw new RuntimeException('No hay encounter.');$ids=$p['participantIds']??[];if(!is_array($ids))throw new RuntimeException('Orden inválido.');$q=$this->db->prepare('UPDATE encounter_participants SET tie_order=? WHERE id=? AND encounter_id=?');foreach(array_values($ids) as $i=>$id)$q->execute([$i,(int)$id,$e['id']]);return ['participantIds'=>$ids];
    }

    private function turnDelay(int $sid,array $user,array $p): array
    {
        $e=$this->one("SELECT * FROM encounters WHERE scenario_id=? AND state='RUNNING' FOR UPDATE",[$sid]);if(!$e)throw new RuntimeException('No hay combate activo.');$current=$this->one('SELECT * FROM encounter_participants WHERE id=?',[$e['current_participant_id']]);if(!$current)throw new RuntimeException('Turno inválido.');
        if($user['role']!=='DM'){if($current['actor_type']!=='PLAYER')throw new RuntimeException('No puedes retrasar este turno.');$sp=$this->one('SELECT user_id FROM scenario_players WHERE id=?',[$current['actor_id']]);if(!$sp||(int)$sp['user_id']!==(int)$user['id'])throw new RuntimeException('No es tu turno.');}
        $target=(int)($p['targetParticipantId']??0);if($target===(int)$current['id']||!$this->one("SELECT 1 FROM encounter_participants WHERE id=? AND encounter_id=? AND state IN ('ACTIVE','DEAD','REMOVED')",[$target,$e['id']]))throw new RuntimeException('Objetivo inválido.');
        $ordered=$this->all("SELECT id FROM encounter_participants WHERE encounter_id=? AND initiative IS NOT NULL ORDER BY initiative DESC,tie_order,id",[$e['id']]);$currentPos=$targetPos=-1;foreach($ordered as $i=>$part){if((int)$part['id']===(int)$current['id'])$currentPos=$i;if((int)$part['id']===$target)$targetPos=$i;}$targetRound=(int)$e['round_no']+($targetPos<=$currentPos?1:0);
        $this->db->prepare('UPDATE encounter_participants SET state=\'WAITING\' WHERE id=?')->execute([$current['id']]);$this->db->prepare('INSERT INTO turn_delays(encounter_id,waiting_participant_id,target_participant_id,round_no,sort_order) VALUES (?,?,?,?,?)')->execute([$e['id'],$current['id'],$target,$targetRound,(int)($p['sortOrder']??0)]);return $this->advanceNormal($e,(int)$current['id']);
    }

    private function turnDelayOrder(int $sid,array $p): array
    {
        $e=$this->one('SELECT id FROM encounters WHERE scenario_id=?',[$sid]);if(!$e)throw new RuntimeException('No hay encounter.');$ids=$p['delayIds']??[];$q=$this->db->prepare('UPDATE turn_delays SET sort_order=? WHERE id=? AND encounter_id=?');foreach(array_values($ids) as $i=>$id)$q->execute([$i,(int)$id,$e['id']]);return ['delayIds'=>$ids];
    }

    private function turnNext(int $sid): array
    {
        $e=$this->one("SELECT * FROM encounters WHERE scenario_id=? AND state='RUNNING' FOR UPDATE",[$sid]);if(!$e)throw new RuntimeException('No hay combate activo.');
        $currentId=(int)$e['current_participant_id'];$chain=$this->one('SELECT target_participant_id FROM turn_delays WHERE encounter_id=? AND waiting_participant_id=? AND round_no=? AND triggered=1',[$e['id'],$currentId,$e['round_no']]);$target=$chain?(int)$chain['target_participant_id']:$currentId;
        $delay=$this->one('SELECT * FROM turn_delays WHERE encounter_id=? AND target_participant_id=? AND round_no=? AND triggered=0 ORDER BY sort_order,id LIMIT 1',[$e['id'],$target,$e['round_no']]);
        if($delay){$this->db->prepare('UPDATE turn_delays SET triggered=1 WHERE id=?')->execute([$delay['id']]);$this->db->prepare("UPDATE encounter_participants SET state='ACTIVE' WHERE id=?")->execute([$delay['waiting_participant_id']]);$seq=(int)$e['turn_sequence']+1;$this->db->prepare('UPDATE encounters SET current_participant_id=?,turn_sequence=? WHERE id=?')->execute([$delay['waiting_participant_id'],$seq,$e['id']]);return ['state'=>'RUNNING','round'=>(int)$e['round_no'],'currentParticipantId'=>(int)$delay['waiting_participant_id'],'turnSequence'=>$seq];}
        return $this->advanceNormal($e,$target);
    }

    private function advanceNormal(array $e,int $afterId): array
    {
        $all=$this->all("SELECT * FROM encounter_participants WHERE encounter_id=? AND initiative IS NOT NULL ORDER BY initiative DESC,tie_order,id",[$e['id']]);$active=array_values(array_filter($all,fn($x)=>$x['state']==='ACTIVE'));if(!$active)throw new RuntimeException('No hay participantes activos.');$pos=-1;foreach($all as $i=>$a)if((int)$a['id']===$afterId)$pos=$i;$pick=null;for($n=1;$n<=count($all);$n++){$candidate=$all[($pos+$n)%count($all)];if($candidate['state']==='ACTIVE'){$pick=$candidate;break;}}$round=(int)$e['round_no'];$pickPos=array_search($pick,$all,true);if($pickPos!==false&&$pickPos<=$pos)$round++;$seq=(int)$e['turn_sequence']+1;$this->db->prepare('UPDATE encounters SET current_participant_id=?,round_no=?,turn_sequence=? WHERE id=?')->execute([$pick['id'],$round,$seq,$e['id']]);return ['state'=>'RUNNING','round'=>$round,'currentParticipantId'=>(int)$pick['id'],'turnSequence'=>$seq];
    }

    private function healthSet(int $sid,array $p): array
    {
        $kind=strtoupper((string)($p['kind']??''));$id=(int)($p['id']??0);$health=(int)($p['health']??0);if($kind==='NPC'){$this->db->prepare('UPDATE npc_characters SET health=? WHERE id=? AND scenario_id=?')->execute([$health,$id,$sid]);if($health<=0)$this->db->prepare("UPDATE encounter_participants ep JOIN encounters e ON e.id=ep.encounter_id SET ep.state='DEAD' WHERE e.scenario_id=? AND ep.actor_type='NPC' AND ep.actor_id=?")->execute([$sid,$id]);}elseif($kind==='PLAYER')$this->db->prepare('UPDATE scenario_players SET health=? WHERE id=? AND scenario_id=?')->execute([$health,$id,$sid]);else throw new RuntimeException('Participante inválido.');return compact('kind','id','health');
    }

    private function syncParticipants(int $eid,int $sid): void
    {
        $this->db->prepare("INSERT INTO encounter_participants(encounter_id,actor_type,actor_id,initiative) SELECT ?,'PLAYER',id,initiative FROM scenario_players WHERE scenario_id=? AND initiative IS NOT NULL ON DUPLICATE KEY UPDATE initiative=VALUES(initiative),state=IF(state='REMOVED',state,'ACTIVE')")->execute([$eid,$sid]);
        $this->db->prepare("INSERT INTO encounter_participants(encounter_id,actor_type,actor_id,initiative,state) SELECT ?,'NPC',id,initiative,IF(health<=0,'DEAD','ACTIVE') FROM npc_characters WHERE scenario_id=? AND initiative IS NOT NULL ON DUPLICATE KEY UPDATE initiative=VALUES(initiative),state=VALUES(state)")->execute([$eid,$sid]);
    }

    private function coords(array $s,array $c): array { $x=filter_var($c['x']??null,FILTER_VALIDATE_INT);$y=filter_var($c['y']??null,FILTER_VALIDATE_INT);if($x===false||$y===false||$x<0||$y<0||$x>=(int)$s['width']||$y>=(int)$s['height'])throw new RuntimeException('Coordenadas fuera del mapa.');return [(int)$x,(int)$y]; }
    private function assertMember(int $cid,int $uid): void { if(!$this->one('SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=?',[$cid,$uid]))throw new RuntimeException('Sin acceso a la campaña.'); }
    private function one(string $sql,array $args=[]): array|false { $q=$this->db->prepare($sql);$q->execute($args);return $q->fetch(); }
    private function all(string $sql,array $args=[]): array { $q=$this->db->prepare($sql);$q->execute($args);return $q->fetchAll(); }
}
