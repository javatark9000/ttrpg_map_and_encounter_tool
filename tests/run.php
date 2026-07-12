<?php
declare(strict_types=1);

require dirname(__DIR__).'/src/bootstrap.php';

use Dnd\Auth;
use Dnd\Database;
use Dnd\GameService;

$tests=0;$db=Database::connection();$game=new GameService($db);$suffix=bin2hex(random_bytes(4));$userIds=[];$scenarioId=0;
function ok(bool $condition,string $message): void {global $tests;$tests++;if(!$condition)throw new RuntimeException("FALLÓ: $message");echo "✓ $message\n";}
function req(): string {return bin2hex(random_bytes(16));}
try {
    $campaign=(int)$db->query('SELECT id FROM campaigns ORDER BY id LIMIT 1')->fetchColumn();ok($campaign>0,'existe una campaña inicial');
    $addUser=$db->prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)');
    $addUser->execute(['DM prueba',"dm-$suffix@example.test",password_hash('password123',PASSWORD_DEFAULT),'DM']);$dmId=(int)$db->lastInsertId();$userIds[]=$dmId;
    $addUser->execute(['Jugador prueba',"player-$suffix@example.test",password_hash('password123',PASSWORD_DEFAULT),'PLAYER']);$playerId=(int)$db->lastInsertId();$userIds[]=$playerId;
    $addUser->execute(['Invitado prueba',"guest-$suffix@example.test",password_hash('password123',PASSWORD_DEFAULT),'GUEST']);$guestId=(int)$db->lastInsertId();$userIds[]=$guestId;
    $member=$db->prepare('INSERT INTO campaign_members(campaign_id,user_id) VALUES (?,?)');$member->execute([$campaign,$dmId]);$member->execute([$campaign,$playerId]);$member->execute([$campaign,$guestId]);
    $db->prepare('INSERT INTO player_characters(owner_id,campaign_id,name,max_health) VALUES (?,?,?,?)')->execute([$playerId,$campaign,'Héroe',20]);$characterId=(int)$db->lastInsertId();
    $db->prepare('INSERT INTO assets(owner_id,mime,size_bytes,width,height,path) VALUES (?,?,?,?,?,?)')->execute([$playerId,'image/png',100,32,32,"test-$suffix.png"]);$avatarId=(int)$db->lastInsertId();$db->prepare('UPDATE player_characters SET avatar_asset_id=? WHERE id=?')->execute([$avatarId,$characterId]);
    $db->prepare('INSERT INTO scenarios(campaign_id,name,width,height) VALUES (?,?,?,?)')->execute([$campaign,"Prueba $suffix",10,10]);$scenarioId=(int)$db->lastInsertId();
    $dm=['id'=>$dmId,'name'=>'DM prueba','email'=>'','role'=>'DM'];$player=['id'=>$playerId,'name'=>'Jugador prueba','email'=>'','role'=>'PLAYER'];$guest=['id'=>$guestId,'name'=>'Invitado prueba','email'=>'','role'=>'GUEST'];

    ok((int)$game->snapshot($scenarioId,$dm)['scenario']['width']===10,'el DM obtiene un snapshot');
    ok(!array_filter($game->bootstrap($player)['scenarios'],fn($s)=>(int)$s['id']===$scenarioId),'jugador no lista escenarios inactivos');
    try{$game->snapshot($scenarioId,$player);ok(false,'jugador no ve escenario inactivo');}catch(RuntimeException){ok(true,'jugador no ve escenario inactivo');}
    $game->command($dm,'scenario.activate',['scenarioId'=>$scenarioId],req());
    ok((bool)array_filter($game->bootstrap($player)['scenarios'],fn($s)=>(int)$s['id']===$scenarioId),'jugador lista escenarios activos');
    $view=$game->recordDmView($dm,$scenarioId,['centerX'=>4.5,'centerY'=>3.25,'zoom'=>1.4]);$guestView=$game->guestView($guest);ok($guestView['scenarioId']===$scenarioId&&abs($guestView['camera']['centerX']-4.5)<.001&&abs($guestView['camera']['zoom']-1.4)<.001,'invitado sigue escenario, posición y zoom del DM');
    ok((bool)array_filter($game->bootstrap($guest)['scenarios'],fn($s)=>(int)$s['id']===$scenarioId),'invitado solo lista escenarios activos');
    try{$game->command($guest,'scenario.activate',['scenarioId'=>$scenarioId],req());ok(false,'invitado es solo lectura');}catch(RuntimeException){ok(true,'invitado es solo lectura');}
    $placed=$game->command($player,'player.place',['scenarioId'=>$scenarioId,'characterId'=>$characterId,'x'=>0,'y'=>0],req());ok($placed['data']['x']===0,'jugador coloca su personaje');
    ok((int)$game->snapshot($scenarioId,$dm)['players'][0]['image_asset_id']===$avatarId,'snapshot incluye el avatar del jugador');
    $move=$game->command($player,'movement.submit',['scenarioId'=>$scenarioId,'path'=>[['x'=>1,'y'=>0]]],req());ok($move['data']['status']==='APPLIED','movimiento libre se aplica inmediatamente');
    $game->command($dm,'map.cells.paint',['scenarioId'=>$scenarioId,'cells'=>[['x'=>2,'y'=>0]],'blocked'=>true],req());
    $pending=$game->command($player,'movement.submit',['scenarioId'=>$scenarioId,'path'=>[['x'=>2,'y'=>0]]],req());ok($pending['data']['status']==='PENDING','movimiento bloqueado solicita aprobación');
    $approved=$game->command($dm,'movement.approve',['scenarioId'=>$scenarioId,'movementId'=>$pending['data']['id']],req());ok($approved['data']['status']==='APPLIED','el DM aprueba movimiento');
    $object=$game->command($dm,'object.create',['scenarioId'=>$scenarioId,'name'=>'Mesa grande','x'=>3,'y'=>2,'widthCells'=>5,'heightCells'=>2,'visible'=>true],req());$objectRow=array_values(array_filter($game->snapshot($scenarioId,$dm)['objects'],fn($o)=>(int)$o['id']===(int)$object['data']['id']))[0];ok((int)$objectRow['width_cells']===5&&(int)$objectRow['height_cells']===2,'objeto conserva su área rectangular en casillas');
    $object2=$game->command($dm,'object.create',['scenarioId'=>$scenarioId,'name'=>'Silla','x'=>0,'y'=>5,'widthCells'=>1,'heightCells'=>1,'visible'=>true],req());$game->command($dm,'objects.bulk_update',['scenarioId'=>$scenarioId,'objectIds'=>[$object['data']['id'],$object2['data']['id']],'visible'=>false,'image_asset_id'=>$avatarId],req());$bulkObjects=array_filter($game->snapshot($scenarioId,$dm)['objects'],fn($o)=>in_array((int)$o['id'],[(int)$object['data']['id'],(int)$object2['data']['id']],true));ok(count($bulkObjects)===2&&!array_filter($bulkObjects,fn($o)=>(bool)$o['visible']||(int)$o['image_asset_id']!==$avatarId),'DM cambia visibilidad e imagen de varios objetos');

    $npc=$game->command($dm,'npc.create',['scenarioId'=>$scenarioId,'name'=>'Goblin','x'=>4,'y'=>4,'health'=>8,'visible'=>true],req());
    $game->command($dm,'token.update',['scenarioId'=>$scenarioId,'kind'=>'NPC','id'=>$npc['data']['id'],'visible'=>false],req());$hiddenNpc=array_values(array_filter($game->snapshot($scenarioId,$dm)['npcs'],fn($n)=>(int)$n['id']===(int)$npc['data']['id']))[0];ok(!(bool)$hiddenNpc['visible'],'checkbox individual guarda visibilidad falsa como entero');
    $game->command($dm,'tokens.bulk_update',['scenarioId'=>$scenarioId,'items'=>[['kind'=>'OBJECT','id'=>$object['data']['id']],['kind'=>'NPC','id'=>$npc['data']['id']]],'visible'=>true,'image_asset_id'=>$avatarId],req());$mixed=$game->snapshot($scenarioId,$dm);$mixedObject=array_values(array_filter($mixed['objects'],fn($o)=>(int)$o['id']===(int)$object['data']['id']))[0];$mixedNpc=array_values(array_filter($mixed['npcs'],fn($n)=>(int)$n['id']===(int)$npc['data']['id']))[0];ok((bool)$mixedObject['visible']&&(bool)$mixedNpc['visible']&&(int)$mixedNpc['image_asset_id']===$avatarId,'DM actualiza en grupo objetos y personajes');$playerView=$game->snapshot($scenarioId,$player);ok(!array_key_exists('name',$playerView['objects'][0])&&!array_key_exists('notes',$playerView['objects'][0])&&!array_key_exists('name',$playerView['npcs'][0])&&!array_key_exists('health',$playerView['npcs'][0])&&!array_key_exists('initiative',$playerView['npcs'][0]),'vista del jugador no expone datos de objetos o NPC');
    $snap=$game->snapshot($scenarioId,$dm);$spId=(int)$snap['players'][0]['id'];
    $game->command($dm,'encounter.prepare',['scenarioId'=>$scenarioId],req());
    $game->command($dm,'initiative.set',['scenarioId'=>$scenarioId,'kind'=>'NPC','id'=>$npc['data']['id'],'initiative'=>15],req());
    $game->command($dm,'initiative.set',['scenarioId'=>$scenarioId,'kind'=>'PLAYER','id'=>$spId,'initiative'=>10],req());
    $started=$game->command($dm,'encounter.start',['scenarioId'=>$scenarioId],req());ok($started['data']['state']==='RUNNING','combate inicia con iniciativas');
    $after=$game->command($dm,'turn.next',['scenarioId'=>$scenarioId],req());ok($after['data']['round']===1,'el DM avanza el turno');
    $combat=$game->snapshot($scenarioId,$dm);$npcParticipant=array_values(array_filter($combat['participants'],fn($p)=>$p['actor_type']==='NPC'))[0];
    $wait=$game->command($player,'turn.delay',['scenarioId'=>$scenarioId,'targetParticipantId'=>(int)$npcParticipant['id']],req());ok($wait['data']['round']===2,'jugador retrasa su turno hasta la ronda del objetivo');
    $trigger=$game->command($dm,'turn.next',['scenarioId'=>$scenarioId],req());ok($trigger['data']['currentParticipantId']===(int)$after['data']['currentParticipantId'],'el objetivo activa el turno retrasado');

    $selector=bin2hex(random_bytes(12));$validator=bin2hex(random_bytes(32));$db->prepare('INSERT INTO auth_tokens(user_id,selector,validator_hash) VALUES (?,?,?)')->execute([$playerId,$selector,hash('sha256',$validator)]);
    $authenticated=(new Auth($db))->fromToken("$selector:$validator");ok((int)$authenticated['id']===$playerId,'token persistente autentica al usuario');
    echo "\n$tests pruebas superadas.\n";
} finally {
    if($scenarioId)$db->prepare('DELETE FROM scenarios WHERE id=?')->execute([$scenarioId]);
    foreach(array_reverse($userIds) as $id)$db->prepare('DELETE FROM users WHERE id=?')->execute([$id]);
}
