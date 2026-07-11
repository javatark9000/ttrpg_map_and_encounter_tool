<?php
declare(strict_types=1);

require dirname(__DIR__).'/src/bootstrap.php';

use Dnd\Auth;
use Dnd\Database;
use Dnd\GameService;

$db=Database::connection(); $auth=new Auth($db); $game=new GameService($db);
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH) ?: '/'; $method=$_SERVER['REQUEST_METHOD'];

// El servidor integrado usa este archivo como router. Dejar que sirva los
// archivos estáticos existentes para conservar su MIME correcto.
if (PHP_SAPI === 'cli-server' && $path !== '/' && is_file(__DIR__ . $path)) {
    return false;
}

if(!str_starts_with($path,'/api/')) { ensureCsrf(); readfile(__DIR__.'/app.html'); exit; }

try {
    $body=[];
    if(str_contains($_SERVER['CONTENT_TYPE']??'','application/json')) {
        $rawBody=file_get_contents('php://input');
        if(trim($rawBody)!=='') {
            $decoded=json_decode($rawBody,true,512,JSON_THROW_ON_ERROR);
            if(!is_array($decoded)) throw new RuntimeException('El cuerpo JSON debe ser un objeto.');
            $body=$decoded;
        }
    }
    if($method!=='GET' && !in_array($path,['/api/auth/login','/api/auth/register'],true)) verifyCsrf();

    if($path==='/api/auth/register'&&$method==='POST') jsonOut(['user'=>$auth->register($body)]);
    if($path==='/api/auth/login'&&$method==='POST') jsonOut(['user'=>$auth->login((string)($body['email']??''),(string)($body['password']??''))]);
    if($path==='/api/auth/logout'&&$method==='POST'){ $auth->logout($_COOKIE[Auth::COOKIE]??null); jsonOut(['ok'=>true]); }
    if($path==='/api/me'&&$method==='GET'){ ensureCsrf(); jsonOut(['user'=>$auth->current()]); }

    $user=$auth->current(); if(!$user) throw new HttpError('Debes iniciar sesión.',401);
    if($path==='/api/bootstrap'&&$method==='GET') jsonOut($game->bootstrap($user));
    if(preg_match('#^/api/scenarios/(\d+)/snapshot$#',$path,$m)&&$method==='GET') jsonOut($game->snapshot((int)$m[1],$user));

    if($path==='/api/scenarios'&&$method==='POST'){
        requireDm($user); $w=(int)($body['width']??25);$h=(int)($body['height']??25);if($w<5||$w>60||$h<5||$h>60)throw new RuntimeException('El mapa debe medir entre 5 y 60 casillas.');
        $cid=(int)($body['campaignId']??0);assertMember($db,$cid,(int)$user['id']);$name=trim((string)($body['name']??''));if($name==='')throw new RuntimeException('Escribe un nombre.');
        $q=$db->prepare('INSERT INTO scenarios(campaign_id,name,width,height) VALUES (?,?,?,?)');$q->execute([$cid,$name,$w,$h]);jsonOut(['id'=>(int)$db->lastInsertId()],201);
    }
    if(preg_match('#^/api/scenarios/(\d+)$#',$path,$m)&&$method==='PATCH'){
        requireDm($user);$id=(int)$m[1];$q=$db->prepare('UPDATE scenarios SET name=? WHERE id=? AND campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id=?)');$q->execute([trim((string)$body['name']),$id,$user['id']]);jsonOut(['ok'=>true]);
    }
    if($path==='/api/characters'&&$method==='POST'){
        if($user['role']!=='PLAYER')throw new RuntimeException('Solo un jugador crea personajes.');$cid=(int)($body['campaignId']??0);assertMember($db,$cid,(int)$user['id']);$name=trim((string)($body['name']??''));if($name==='')throw new RuntimeException('Escribe un nombre.');$hp=max(1,(int)($body['maxHealth']??10));
        $db->prepare('INSERT INTO player_characters(owner_id,campaign_id,name,max_health) VALUES (?,?,?,?)')->execute([$user['id'],$cid,$name,$hp]);jsonOut(['id'=>(int)$db->lastInsertId()],201);
    }
    if($path==='/api/assets'&&$method==='POST') jsonOut(uploadAsset($db,$user),201);
    if(preg_match('#^/api/assets/(\d+)$#',$path,$m)&&$method==='GET') serveAsset($db,(int)$m[1],$user);
    if(preg_match('#^/api/scenarios/(\d+)/background$#',$path,$m)&&$method==='POST'){
        requireDm($user);$asset=(int)($body['assetId']??0);$db->prepare('UPDATE scenarios SET background_asset_id=? WHERE id=?')->execute([$asset,(int)$m[1]]);jsonOut(['ok'=>true]);
    }
    if(preg_match('#^/api/characters/(\d+)/avatar$#',$path,$m)&&$method==='POST'){
        $asset=(int)($body['assetId']??0);$db->prepare('UPDATE player_characters SET avatar_asset_id=? WHERE id=? AND owner_id=?')->execute([$asset,(int)$m[1],$user['id']]);jsonOut(['ok'=>true]);
    }
    throw new HttpError('Ruta no encontrada.',404);
} catch(HttpError $e){jsonOut(['error'=>$e->getMessage()],$e->status);} catch(Throwable $e){error_log((string)$e);jsonOut(['error'=>$e instanceof RuntimeException?$e->getMessage():'Error interno.'],400);}

function jsonOut(array $data,int $status=200): never { http_response_code($status);header('Content-Type: application/json; charset=utf-8');echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit; }
function ensureCsrf(): void { if(empty($_COOKIE['dnd_csrf']))setcookie('dnd_csrf',bin2hex(random_bytes(24)),['expires'=>time()+315360000,'path'=>'/','secure'=>(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'),'httponly'=>false,'samesite'=>'Lax']); }
function verifyCsrf(): void { $a=$_COOKIE['dnd_csrf']??'';$b=$_SERVER['HTTP_X_CSRF_TOKEN']??'';if(!$a||!$b||!hash_equals($a,$b))throw new HttpError('Token CSRF inválido.',419); }
function requireDm(array $u): void { if($u['role']!=='DM')throw new HttpError('Acción exclusiva del DM.',403); }
function assertMember(PDO $db,int $c,int $u): void{$q=$db->prepare('SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=?');$q->execute([$c,$u]);if(!$q->fetchColumn())throw new HttpError('Sin acceso.',403);}
function uploadAsset(PDO $db,array $user): array {
    if(!isset($_FILES['image'])) {
        $length=(int)($_SERVER['CONTENT_LENGTH']??0);
        if($length>16*1024*1024) throw new RuntimeException('La solicitud supera el límite permitido de 15 MB por imagen.');
        throw new RuntimeException('No se recibió ningún archivo.');
    }
    $f=$_FILES['image'];
    if($f['error']!==UPLOAD_ERR_OK) {
        $message=match($f['error']) {
            UPLOAD_ERR_INI_SIZE,UPLOAD_ERR_FORM_SIZE=>'La imagen supera el límite permitido de 15 MB.',
            UPLOAD_ERR_PARTIAL=>'La carga quedó incompleta. Inténtalo nuevamente.',
            UPLOAD_ERR_NO_FILE=>'Selecciona una imagen antes de continuar.',
            UPLOAD_ERR_NO_TMP_DIR=>'El servidor no tiene un directorio temporal para cargas.',
            UPLOAD_ERR_CANT_WRITE=>'El servidor no pudo escribir el archivo.',
            UPLOAD_ERR_EXTENSION=>'Una extensión del servidor bloqueó la carga.',
            default=>'No se pudo recibir la imagen.'
        };
        throw new RuntimeException($message);
    }
    if((int)$f['size']>15*1024*1024) throw new RuntimeException('La imagen supera el límite permitido de 15 MB.');
    $info=getimagesize($f['tmp_name']);
    $allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
    if(!$info||!isset($allowed[$info['mime']])) throw new RuntimeException('Formato no admitido. Usa JPEG, PNG o WebP.');
    $name=bin2hex(random_bytes(24)).'.'.$allowed[$info['mime']];
    $dir=dirname(__DIR__).'/storage/uploads';
    if(!is_dir($dir)) mkdir($dir,0770,true);
    if(!move_uploaded_file($f['tmp_name'],$dir.'/'.$name)) throw new RuntimeException('No se pudo guardar la imagen.');
    $db->prepare('INSERT INTO assets(owner_id,mime,size_bytes,width,height,path) VALUES (?,?,?,?,?,?)')->execute([$user['id'],$info['mime'],$f['size'],$info[0],$info[1],$name]);
    $id=(int)$db->lastInsertId();
    return ['id'=>$id,'url'=>'/api/assets/'.$id];
}
function serveAsset(PDO $db,int $id,array $user): never {
    $q=$db->prepare('SELECT * FROM assets WHERE id=?');$q->execute([$id]);$a=$q->fetch();if(!$a)throw new HttpError('Imagen inexistente.',404);
    $allowed=(int)$a['owner_id']===(int)$user['id'];
    if(!$allowed&&$user['role']==='DM'){$q=$db->prepare('SELECT 1 FROM campaign_members cm WHERE cm.user_id=? AND (EXISTS(SELECT 1 FROM player_characters pc WHERE pc.avatar_asset_id=? AND pc.campaign_id=cm.campaign_id) OR EXISTS(SELECT 1 FROM scenarios s WHERE s.background_asset_id=? AND s.campaign_id=cm.campaign_id) OR EXISTS(SELECT 1 FROM map_objects o JOIN scenarios s ON s.id=o.scenario_id WHERE o.image_asset_id=? AND s.campaign_id=cm.campaign_id) OR EXISTS(SELECT 1 FROM npc_characters n JOIN scenarios s ON s.id=n.scenario_id WHERE n.image_asset_id=? AND s.campaign_id=cm.campaign_id)) LIMIT 1');$q->execute([$user['id'],$id,$id,$id,$id]);$allowed=(bool)$q->fetchColumn();}
    if(!$allowed&&$user['role']==='PLAYER'){
        $q=$db->prepare('SELECT 1 WHERE
            EXISTS(SELECT 1 FROM player_characters WHERE avatar_asset_id=? AND owner_id=?)
            OR EXISTS(SELECT 1 FROM scenario_players sp JOIN player_characters pc ON pc.id=sp.character_id JOIN scenarios s ON s.id=sp.scenario_id JOIN campaign_members cm ON cm.campaign_id=s.campaign_id WHERE pc.avatar_asset_id=? AND sp.placed=1 AND s.active=1 AND cm.user_id=?)
            OR EXISTS(SELECT 1 FROM scenarios s JOIN campaign_members cm ON cm.campaign_id=s.campaign_id WHERE s.background_asset_id=? AND s.active=1 AND cm.user_id=?)
            OR EXISTS(SELECT 1 FROM map_objects o JOIN scenarios s ON s.id=o.scenario_id JOIN campaign_members cm ON cm.campaign_id=s.campaign_id WHERE o.image_asset_id=? AND o.visible=1 AND s.active=1 AND cm.user_id=?)
            OR EXISTS(SELECT 1 FROM npc_characters n JOIN scenarios s ON s.id=n.scenario_id JOIN campaign_members cm ON cm.campaign_id=s.campaign_id WHERE n.image_asset_id=? AND n.visible=1 AND n.health>0 AND n.dead_hidden=0 AND s.active=1 AND cm.user_id=?)');
        $q->execute([$id,$user['id'],$id,$user['id'],$id,$user['id'],$id,$user['id'],$id,$user['id']]);
        $allowed=(bool)$q->fetchColumn();
    }
    if(!$allowed)throw new HttpError('Sin acceso a esta imagen.',403);$file=dirname(__DIR__).'/storage/uploads/'.$a['path'];if(!is_file($file))throw new HttpError('Archivo inexistente.',404);header('Content-Type: '.$a['mime']);header('Cache-Control: private, max-age=86400');header('X-Content-Type-Options: nosniff');readfile($file);exit;
}
final class HttpError extends RuntimeException { public function __construct(string $message,public int $status){parent::__construct($message);} }
