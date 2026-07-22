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
    if($path==='/api/auth/guest'&&$method==='POST') jsonOut(['user'=>$auth->guest()]);
    if($path==='/api/auth/logout'&&$method==='POST'){ $auth->logout($_COOKIE[Auth::COOKIE]??null); jsonOut(['ok'=>true]); }
    if($path==='/api/me'&&$method==='GET'){ ensureCsrf(); jsonOut(['user'=>$auth->current()]); }

    $user=$auth->current(); if(!$user) throw new HttpError('Debes iniciar sesión.',401);
    if($path==='/api/bootstrap'&&$method==='GET') jsonOut($game->bootstrap($user));
    if($path==='/api/codex/categories'&&$method==='GET') jsonOut(codexCategories($db,$user));
    if($path==='/api/codex/category-records'&&$method==='GET') jsonOut(codexCategoryRecords($db,$user,(string)($_GET['category']??''),(string)($_GET['q']??''),(int)($_GET['page']??1),(int)($_GET['limit']??15)));
    if($path==='/api/codex/action'&&$method==='GET') jsonOut(codexActionDetail($db,$user,(int)($_GET['id']??0)));
    if($path==='/api/codex/record'&&$method==='GET') jsonOut(codexRecordDetail($db,$user,(string)($_GET['category']??''),(int)($_GET['id']??0)));
    if(preg_match('#^/api/codex/media/(\d+)$#',$path,$m)&&$method==='GET') serveCodexMedia($db,(int)$m[1],$user);
    if($path==='/api/codex/customization/options'&&$method==='GET'){ requireDm($user); jsonOut(codexCustomizationOptions($db)); }
    if($path==='/api/codex/records'&&$method==='GET'){ requireDm($user); jsonOut(codexRecords($db,(string)($_GET['kind']??''),(string)($_GET['q']??''))); }
    if($path==='/api/codex/customize'&&$method==='POST'){ requireDm($user); jsonOut(createCustomCodexRecord($db,$user,$body),201); }
    if($path==='/api/codex/customize/media'&&$method==='POST'){ requireDm($user); jsonOut(uploadCustomCodexMedia($db,$user),201); }
    if(preg_match('#^/api/codex/customize/(creature|item|spell)/(\d+)$#',$path,$m)&&$method==='PATCH'){ requireDm($user); jsonOut(updateCustomCodexRecord($db,$user,$m[1],(int)$m[2],$body)); }
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
function dbCount(PDO $db,string $table): int { try{return (int)$db->query("SELECT COUNT(*) FROM $table WHERE is_active=1")->fetchColumn();}catch(Throwable){return 0;} }
function codexVisibleWhere(array $user,string $alias='c'): string { return $user['role']==='DM' ? '1=1' : "EXISTS(SELECT 1 FROM visibility_levels vl WHERE vl.id={$alias}.visibility_level_id AND vl.code='public')"; }
function codexActionCount(PDO $db,array $user): int { $where=$user['role']==='DM'?'a.is_active=1':"a.is_active=1 AND vl.code='public' AND ac.code<>'monster_ability'"; return (int)$db->query("SELECT COUNT(*) FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id JOIN visibility_levels vl ON vl.id=a.visibility_level_id WHERE $where")->fetchColumn(); }
function codexCategories(PDO $db,array $user): array {
    $categories=[
        ['code'=>'actions','name'=>'Acciones y hechizos','description'=>'Hechizos, rasgos, acciones y habilidades reutilizables.','count'=>codexActionCount($db,$user)],
        ['code'=>'items','name'=>'Objetos','description'=>'Equipo, armas, armaduras, herramientas y objetos mágicos.','count'=>dbCount($db,'items')],
        ['code'=>'feats','name'=>'Dotes','description'=>'Dotes regulares, raciales y custom.','count'=>dbCount($db,'feats')],
        ['code'=>'species','name'=>'Especies','description'=>'Linajes base y especies jugables.','count'=>dbCount($db,'species')],
        ['code'=>'subspecies','name'=>'Subespecies','description'=>'Variantes y sublinajes.','count'=>dbCount($db,'subspecies')],
        ['code'=>'backgrounds','name'=>'Trasfondos','description'=>'Trasfondos de personaje.','count'=>dbCount($db,'backgrounds')],
        ['code'=>'background_variants','name'=>'Variantes de trasfondo','description'=>'Variantes como Spy, Pirate, Knight, etc.','count'=>dbCount($db,'background_variants')],
        ['code'=>'classes','name'=>'Clases','description'=>'Clases base disponibles.','count'=>dbCount($db,'classes')],
        ['code'=>'subclasses','name'=>'Subclases','description'=>'Arquetipos, dominios, círculos y demás subclases.','count'=>dbCount($db,'subclasses')],
    ];
    if($user['role']==='DM') array_splice($categories,1,0,[['code'=>'creatures','name'=>'Criaturas','description'=>'Monstruos, NPCs y criaturas del codex.','count'=>dbCount($db,'creatures')]]);
    return ['categories'=>$categories];
}
function codexCategoryMeta(string $category): ?array {
    return match($category){
        'creatures'=>['table'=>'creatures','owner'=>'creature','select'=>'c.id,c.name,c.short_description,c.armor_class_text,c.hit_points_text,ct.name type_name,cs.name subtype_name,src.name source_name','joins'=>'LEFT JOIN creature_types ct ON ct.id=c.creature_type_id LEFT JOIN creature_sizes cs ON cs.id=c.creature_size_id LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','ct.name','cs.name','src.name','c.challenge_rating_text','c.environment_text']],
        'items'=>['table'=>'items','owner'=>'item','select'=>'c.id,c.name,c.short_description,it.name type_name,ir.name subtype_name,src.name source_name','joins'=>'LEFT JOIN item_types it ON it.id=c.item_type_id LEFT JOIN item_rarities ir ON ir.id=c.item_rarity_id LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','it.name','ir.name','src.name','c.properties_text','c.damage_text','c.value_text']],
        'feats'=>['table'=>'feats','owner'=>'feat','select'=>'c.id,c.name,c.short_description,ft.name type_name,src.name source_name','joins'=>'LEFT JOIN feat_types ft ON ft.id=c.feat_type_id LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','ft.name','src.name','c.prerequisites_text','c.benefits_text']],
        'species'=>['table'=>'species','owner'=>'species','select'=>'c.id,c.name,c.short_description,c.lineage_type_code type_name,src.name source_name','joins'=>'LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','c.lineage_type_code','src.name','c.size_text','c.languages_text','c.ability_score_text','c.traits_text']],
        'subspecies'=>['table'=>'subspecies','owner'=>'subspecies','select'=>'c.id,c.name,c.short_description,sp.name type_name,c.lineage_type_code subtype_name,src.name source_name','joins'=>'JOIN species sp ON sp.id=c.species_id LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','sp.name','c.lineage_type_code','src.name','c.size_text','c.languages_text','c.ability_score_text','c.traits_text']],
        'backgrounds'=>['table'=>'backgrounds','owner'=>'background','select'=>'c.id,c.name,c.short_description,c.background_type_code type_name,c.setting_name subtype_name,src.name source_name','joins'=>'LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','c.background_type_code','c.setting_name','src.name','c.skill_proficiencies_text','c.tool_proficiencies_text','c.languages_text','c.equipment_text','c.feature_text']],
        'background_variants'=>['table'=>'background_variants','owner'=>'background_variant','select'=>'c.id,c.name,c.short_description,b.name type_name,c.background_type_code subtype_name,src.name source_name','joins'=>'JOIN backgrounds b ON b.id=c.background_id LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','b.name','c.background_type_code','c.setting_name','src.name','c.skill_proficiencies_text','c.tool_proficiencies_text','c.languages_text','c.equipment_text','c.feature_text']],
        'classes'=>['table'=>'classes','owner'=>'class','select'=>'c.id,c.name,c.short_description,c.hit_die_text type_name,c.primary_ability_text subtype_name,src.name source_name','joins'=>'LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','c.hit_die_text','c.primary_ability_text','src.name','c.equipment_text']],
        'subclasses'=>['table'=>'subclasses','owner'=>'subclass','select'=>'c.id,c.name,c.short_description,cl.name type_name,c.subclass_type_text subtype_name,src.name source_name','joins'=>'JOIN classes cl ON cl.id=c.class_id LEFT JOIN sources src ON src.id=c.source_material_id','search'=>['c.name','c.short_description','c.description','cl.name','c.subclass_type_text','src.name','c.requirements_text']],
        default=>null
    };
}
function codexCategoryRecords(PDO $db,array $user,string $category,string $q,int $page=1,int $limit=15): array {
    $q=trim($q); $limit=max(1,min(50,$limit)); $page=max(1,$page); $offset=($page-1)*$limit;
    if($category==='creatures' && $user['role']!=='DM') throw new HttpError('Contenido exclusivo del DM.',403);
    if($category==='actions'){
        $role=$user['role']; $visibility="JOIN visibility_levels vl ON vl.id=a.visibility_level_id"; $extra=$role==='DM'?'':" AND vl.code='public' AND ac.code<>'monster_ability'";
        if($q===''){
            $st=$db->query("SELECT a.id,a.name,a.short_description,ac.name category_name,ac.code category_code,ms.name magic_school,a.spell_level,src.name source_name,(SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ') FROM action_assignments aa JOIN creatures c ON c.id=aa.owner_id WHERE aa.action_id=a.id AND aa.owner_type='creature') owner_names FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id $visibility LEFT JOIN magic_schools ms ON ms.id=a.magic_school_id LEFT JOIN sources src ON src.id=a.source_material_id WHERE a.is_active=1 $extra ORDER BY RAND() LIMIT 15");
            return ['records'=>$st->fetchAll(),'total'=>null,'page'=>1,'limit'=>15,'pages'=>null,'random'=>true];
        }
        $like='%'.$q.'%'; $where="a.is_active=1 $extra AND (a.name LIKE ? OR a.short_description LIKE ? OR a.description LIKE ? OR ac.name LIKE ? OR ac.code LIKE ? OR EXISTS(SELECT 1 FROM action_tags atg JOIN tags t ON t.id=atg.tag_id WHERE atg.action_id=a.id AND (t.name LIKE ? OR t.code LIKE ?)))"; $params=[$like,$like,$like,$like,$like,$like,$like];
        $cnt=$db->prepare("SELECT COUNT(*) FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id $visibility WHERE $where"); $cnt->execute($params); $total=(int)$cnt->fetchColumn(); $pages=max(1,(int)ceil($total/$limit)); $page=min($page,$pages); $offset=($page-1)*$limit;
        $st=$db->prepare("SELECT a.id,a.name,a.short_description,ac.name category_name,ac.code category_code,ms.name magic_school,a.spell_level,src.name source_name,(SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ') FROM action_assignments aa JOIN creatures c ON c.id=aa.owner_id WHERE aa.action_id=a.id AND aa.owner_type='creature') owner_names FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id $visibility LEFT JOIN magic_schools ms ON ms.id=a.magic_school_id LEFT JOIN sources src ON src.id=a.source_material_id WHERE $where ORDER BY a.name LIMIT $limit OFFSET $offset");
        $st->execute($params);
        return ['records'=>$st->fetchAll(),'total'=>$total,'page'=>$page,'limit'=>$limit,'pages'=>$pages,'random'=>false];
    }
    $meta=codexCategoryMeta($category); if(!$meta) throw new RuntimeException('Categoría de codex no disponible.');
    $visible=codexVisibleWhere($user,'c');
    if($q==='') { $st=$db->query("SELECT {$meta['select']} FROM {$meta['table']} c {$meta['joins']} WHERE c.is_active=1 AND $visible ORDER BY RAND() LIMIT 15"); return ['records'=>$st->fetchAll(),'total'=>null,'page'=>1,'limit'=>15,'pages'=>null,'random'=>true]; }
    $like='%'.$q.'%'; $parts=array_map(fn($col)=>"$col LIKE ?",$meta['search']); $where="c.is_active=1 AND $visible AND (".implode(' OR ',$parts)." OR EXISTS(SELECT 1 FROM codex_record_tags crt JOIN tags t ON t.id=crt.tag_id WHERE crt.owner_type=? AND crt.owner_id=c.id AND (t.name LIKE ? OR t.code LIKE ?)))"; $params=array_merge(array_fill(0,count($meta['search']),$like),[$meta['owner'],$like,$like]);
    $cnt=$db->prepare("SELECT COUNT(*) FROM {$meta['table']} c {$meta['joins']} WHERE $where"); $cnt->execute($params); $total=(int)$cnt->fetchColumn(); $pages=max(1,(int)ceil($total/$limit)); $page=min($page,$pages); $offset=($page-1)*$limit;
    $sql="SELECT {$meta['select']} FROM {$meta['table']} c {$meta['joins']} WHERE $where ORDER BY c.name LIMIT $limit OFFSET $offset"; $st=$db->prepare($sql); $st->execute($params);
    return ['records'=>$st->fetchAll(),'total'=>$total,'page'=>$page,'limit'=>$limit,'pages'=>$pages,'random'=>false];
}
function codexActionDetail(PDO $db,array $user,int $id): array {
    if($id<1) throw new RuntimeException('Acción inválida.');
    $extra=$user['role']==='DM'?'':" AND vl.code='public' AND ac.code<>'monster_ability'";
    $st=$db->prepare("SELECT a.*,ac.name category_name,ac.code category_code,act.name activation_name,ms.name magic_school,stt.name saving_throw,art.name attack_roll,src.name source_name FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id JOIN visibility_levels vl ON vl.id=a.visibility_level_id LEFT JOIN activation_types act ON act.id=a.activation_type_id LEFT JOIN magic_schools ms ON ms.id=a.magic_school_id LEFT JOIN saving_throw_types stt ON stt.id=a.saving_throw_type_id LEFT JOIN attack_roll_types art ON art.id=a.attack_roll_type_id LEFT JOIN sources src ON src.id=a.source_material_id WHERE a.id=? AND a.is_active=1 $extra");
    $st->execute([$id]); $action=$st->fetch(); if(!$action) throw new RuntimeException('Acción no encontrada.');
    $tags=$db->prepare('SELECT t.name FROM action_tags atg JOIN tags t ON t.id=atg.tag_id WHERE atg.action_id=? ORDER BY t.name');$tags->execute([$id]);
    $classes=$db->prepare('SELECT c.name FROM action_class_availability aca JOIN classes c ON c.id=aca.class_id WHERE aca.action_id=? ORDER BY c.name');$classes->execute([$id]);
    $owners=$db->prepare("SELECT c.name FROM action_assignments aa JOIN creatures c ON c.id=aa.owner_id WHERE aa.action_id=? AND aa.owner_type='creature' ORDER BY c.name");$owners->execute([$id]);
    return ['record'=>$action,'tags'=>array_column($tags->fetchAll(),'name'),'classes'=>array_column($classes->fetchAll(),'name'),'owners'=>array_column($owners->fetchAll(),'name'),'media'=>codexEntityMedia($db,'action',$id,$user)];
}
function codexRecordDetail(PDO $db,array $user,string $category,int $id): array {
    if($category==='creatures' && $user['role']!=='DM') throw new HttpError('Contenido exclusivo del DM.',403);
    if($id<1) throw new RuntimeException('Registro inválido.'); $meta=codexCategoryMeta($category); if(!$meta) throw new RuntimeException('Categoría de codex no disponible.');
    $visible=codexVisibleWhere($user,'c');
    $st=$db->prepare("SELECT c.*,src.name source_name FROM {$meta['table']} c LEFT JOIN sources src ON src.id=c.source_material_id WHERE c.id=? AND c.is_active=1 AND $visible");
    $st->execute([$id]); $record=$st->fetch(); if(!$record) throw new RuntimeException('Registro no encontrado.');
    $tags=$db->prepare('SELECT t.name FROM codex_record_tags crt JOIN tags t ON t.id=crt.tag_id WHERE crt.owner_type=? AND crt.owner_id=? ORDER BY t.name');$tags->execute([$meta['owner'],$id]);
    $labels=[];
    if($category==='creatures'){$labels['type']=dbLookup($db,'creature_types',$record['creature_type_id']??null);$labels['size']=dbLookup($db,'creature_sizes',$record['creature_size_id']??null);}
    if($category==='items'){$labels['type']=dbLookup($db,'item_types',$record['item_type_id']??null);$labels['rarity']=dbLookup($db,'item_rarities',$record['item_rarity_id']??null);}
    if($category==='feats')$labels['type']=dbLookup($db,'feat_types',$record['feat_type_id']??null);
    if($category==='subspecies')$labels['species']=dbLookup($db,'species',$record['species_id']??null);
    if($category==='background_variants')$labels['background']=dbLookup($db,'backgrounds',$record['background_id']??null);
    if($category==='subclasses')$labels['class']=dbLookup($db,'classes',$record['class_id']??null);
    $media=[];
    if($category==='creatures') $media=codexEntityMedia($db,'creature',$id,$user);
    if($category==='items') $media=codexEntityMedia($db,'item',$id,$user);
    return ['record'=>$record,'tags'=>array_column($tags->fetchAll(),'name'),'labels'=>$labels,'media'=>$media];
}
function dbLookup(PDO $db,string $table,mixed $id): ?string { if(!$id)return null; $st=$db->prepare("SELECT name FROM $table WHERE id=?");$st->execute([$id]); return ($v=$st->fetchColumn())?(string)$v:null; }
function codexEntityMedia(PDO $db,string $entityType,int $entityId,array $user): array {
    $st=$db->prepare("SELECT ma.id,ma.title,ma.alt_text,ma.mime_type,mp.code purpose,mp.name purpose_name,cml.is_primary FROM codex_media_links cml JOIN media_assets ma ON ma.id=cml.media_asset_id JOIN media_purposes mp ON mp.id=cml.media_purpose_id LEFT JOIN visibility_levels vl ON vl.id=cml.visibility_level_id WHERE cml.entity_type=? AND cml.entity_id=? AND ma.is_active=1 AND (?='DM' OR COALESCE(vl.code,'public')='public') ORDER BY cml.is_primary DESC, FIELD(mp.code,'portrait','token','miniature','reference'), cml.sort_order, ma.id");
    $st->execute([$entityType,$entityId,$user['role']]); $rows=$st->fetchAll();
    return array_map(fn($r)=>['id'=>(int)$r['id'],'url'=>'/api/codex/media/'.(int)$r['id'],'title'=>$r['title'],'altText'=>$r['alt_text'],'mimeType'=>$r['mime_type'],'purpose'=>$r['purpose'],'purposeName'=>$r['purpose_name'],'isPrimary'=>(bool)$r['is_primary']],$rows);
}
function serveCodexMedia(PDO $db,int $id,array $user): never {
    $st=$db->prepare("SELECT ma.*, cml.entity_type, cml.entity_id, COALESCE(vl.code,'public') visibility_code FROM media_assets ma JOIN codex_media_links cml ON cml.media_asset_id=ma.id LEFT JOIN visibility_levels vl ON vl.id=cml.visibility_level_id WHERE ma.id=? AND ma.is_active=1 LIMIT 1");
    $st->execute([$id]); $a=$st->fetch(); if(!$a) throw new HttpError('Media inexistente.',404);
    if($a['entity_type']==='creature' && $user['role']!=='DM') throw new HttpError('Contenido exclusivo del DM.',403);
    if($user['role']!=='DM' && $a['visibility_code']!=='public') throw new HttpError('Sin acceso a este media.',403);
    if($a['storage_path']){
        $base=realpath(dirname(__DIR__).'/storage/uploads');
        $file=realpath($base.'/'.str_replace(['..','\\'],['','/'],$a['storage_path']));
        if(!$base||!$file||!str_starts_with($file,$base)||!is_file($file)) throw new HttpError('Archivo inexistente.',404);
        header('Content-Type: '.($a['mime_type'] ?: 'application/octet-stream'));
        header('Cache-Control: private, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        readfile($file); exit;
    }
    if($a['external_url']) { header('Location: '.$a['external_url'], true, 302); exit; }
    throw new HttpError('Media sin archivo.',404);
}
function codexCustomizationOptions(PDO $db): array {
    $all=fn(string $sql): array=>$db->query($sql)->fetchAll();
    return [
        'creatureTypes'=>$all("SELECT id,name FROM creature_types WHERE system_id=(SELECT id FROM systems WHERE code='dnd_5e') ORDER BY name"),
        'creatureSizes'=>$all("SELECT id,name FROM creature_sizes WHERE system_id=(SELECT id FROM systems WHERE code='dnd_5e') ORDER BY id"),
        'itemTypes'=>$all("SELECT id,name FROM item_types WHERE system_id=(SELECT id FROM systems WHERE code='dnd_5e') ORDER BY name"),
        'itemRarities'=>$all("SELECT id,name FROM item_rarities WHERE system_id=(SELECT id FROM systems WHERE code='dnd_5e') ORDER BY id"),
        'activationTypes'=>$all("SELECT id,name FROM activation_types ORDER BY name"),
        'magicSchools'=>$all("SELECT id,name FROM magic_schools WHERE system_id=(SELECT id FROM systems WHERE code='dnd_5e') ORDER BY name"),
        'savingThrowTypes'=>$all("SELECT id,name FROM saving_throw_types WHERE system_id=(SELECT id FROM systems WHERE code='dnd_5e') ORDER BY name"),
        'attackRollTypes'=>$all("SELECT id,name FROM attack_roll_types WHERE system_id=(SELECT id FROM systems WHERE code='dnd_5e') ORDER BY name"),
    ];
}
function codexRecords(PDO $db,string $kind,string $q): array {
    $q=trim($q); if(strlen($q)<2) throw new RuntimeException('Escribe al menos 2 caracteres para buscar.'); $like='%'.$q.'%';
    if($kind==='creature'){
        $st=$db->prepare("SELECT c.*,ct.name creature_type_name,cs.name creature_size_name,(SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', ') FROM codex_record_tags crt JOIN tags t ON t.id=crt.tag_id WHERE crt.owner_type='creature' AND crt.owner_id=c.id) tag_names FROM creatures c LEFT JOIN creature_types ct ON ct.id=c.creature_type_id LEFT JOIN creature_sizes cs ON cs.id=c.creature_size_id WHERE c.is_active=1 AND (c.name LIKE ? OR EXISTS(SELECT 1 FROM codex_record_tags crt JOIN tags t ON t.id=crt.tag_id WHERE crt.owner_type='creature' AND crt.owner_id=c.id AND (t.name LIKE ? OR t.code LIKE ?))) ORDER BY c.is_custom ASC,c.name LIMIT 25");
    } elseif($kind==='item') {
        $st=$db->prepare("SELECT i.*,it.name item_type_name,ir.name item_rarity_name,(SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', ') FROM codex_record_tags crt JOIN tags t ON t.id=crt.tag_id WHERE crt.owner_type='item' AND crt.owner_id=i.id) tag_names FROM items i LEFT JOIN item_types it ON it.id=i.item_type_id LEFT JOIN item_rarities ir ON ir.id=i.item_rarity_id WHERE i.is_active=1 AND (i.name LIKE ? OR EXISTS(SELECT 1 FROM codex_record_tags crt JOIN tags t ON t.id=crt.tag_id WHERE crt.owner_type='item' AND crt.owner_id=i.id AND (t.name LIKE ? OR t.code LIKE ?))) ORDER BY i.is_custom ASC,i.name LIMIT 25");
    } elseif($kind==='spell') {
        $st=$db->prepare("SELECT a.*,ms.name magic_school_name,(SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', ') FROM action_tags atg JOIN tags t ON t.id=atg.tag_id WHERE atg.action_id=a.id) tag_names FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id LEFT JOIN magic_schools ms ON ms.id=a.magic_school_id WHERE a.is_active=1 AND ac.code='spell' AND (a.name LIKE ? OR a.short_description LIKE ? OR a.description LIKE ? OR EXISTS(SELECT 1 FROM action_tags atg JOIN tags t ON t.id=atg.tag_id WHERE atg.action_id=a.id AND (t.name LIKE ? OR t.code LIKE ?))) ORDER BY a.is_custom ASC,a.name LIMIT 25");
        $st->execute([$like,$like,$like,$like,$like]); return ['records'=>$st->fetchAll()];
    } else throw new RuntimeException('Tipo de registro inválido.');
    $st->execute([$like,$like,$like]); return ['records'=>$st->fetchAll()];
}
function cleanCode(string $value): string { $value=strtolower(trim($value)); $value=preg_replace('/[^a-z0-9_-]+/','_',$value)??''; return trim($value,'_'); }
function customMeta(PDO $db,string $table,string $identifier,?int $ignoreId=null): void { if($identifier==='')throw new RuntimeException('El identificador custom es obligatorio.'); $sql="SELECT 1 FROM $table WHERE custom_identifier=?".($ignoreId?' AND id<>?':'')." LIMIT 1"; $st=$db->prepare($sql);$st->execute($ignoreId?[$identifier,$ignoreId]:[$identifier]);if($st->fetchColumn())throw new RuntimeException('Ese identificador custom ya existe.'); }
function homebrewSourceId(PDO $db,int $systemId): ?int { $st=$db->prepare("SELECT id FROM sources WHERE system_id=? AND code='homebrew'");$st->execute([$systemId]);return ($id=$st->fetchColumn())?(int)$id:null; }
function copyCodexTags(PDO $db,string $ownerType,int $sourceId,int $customId): void { $st=$db->prepare('INSERT IGNORE INTO codex_record_tags(owner_type,owner_id,tag_id) SELECT owner_type,?,tag_id FROM codex_record_tags WHERE owner_type=? AND owner_id=?');$st->execute([$customId,$ownerType,$sourceId]); }
function copyCodexMediaLinks(PDO $db,string $entityType,int $sourceId,int $customId): void { $st=$db->prepare('INSERT IGNORE INTO codex_media_links(media_asset_id,entity_type,entity_id,media_purpose_id,visibility_level_id,title,caption,sort_order,is_primary) SELECT media_asset_id,entity_type,?,media_purpose_id,visibility_level_id,title,caption,sort_order,is_primary FROM codex_media_links WHERE entity_type=? AND entity_id=?');$st->execute([$customId,$entityType,$sourceId]); }
function copyActionTags(PDO $db,int $sourceId,int $customId): void { $st=$db->prepare('INSERT IGNORE INTO action_tags(action_id,tag_id) SELECT ?,tag_id FROM action_tags WHERE action_id=?');$st->execute([$customId,$sourceId]); }
function copyActionClassAvailability(PDO $db,int $sourceId,int $customId): void { $st=$db->prepare('INSERT IGNORE INTO action_class_availability(action_id,class_id,notes) SELECT ?,class_id,notes FROM action_class_availability WHERE action_id=?');$st->execute([$customId,$sourceId]); }
function codexCustomInput(array $body,array $src): array {
    $num=fn(string $k)=>isset($body[$k])&&$body[$k]!==''?(int)$body[$k]:null;
    $txt=fn(string $k,string $s)=>array_key_exists($k,$body)?trim((string)$body[$k]):($src[$s]??null);
    $bool=fn(string $k,string $s)=>array_key_exists($k,$body)?(!empty($body[$k])?1:0):(int)($src[$s]??0);
    return compact('num','txt','bool');
}
function createCustomCodexRecord(PDO $db,array $user,array $body): array {
    $kind=(string)($body['kind']??''); $sourceId=(int)($body['sourceId']??0); if($sourceId<1)throw new RuntimeException('Selecciona un registro base.');
    $name=trim((string)($body['name']??'')); if($name==='')throw new RuntimeException('Escribe un nombre.');
    $identifier=cleanCode((string)($body['customIdentifier']??'')); $tag=trim((string)($body['customTag']??'Homebrew')) ?: 'Homebrew';
    if($kind==='creature'){
        customMeta($db,'creatures',$identifier); $st=$db->prepare('SELECT * FROM creatures WHERE id=?');$st->execute([$sourceId]);$src=$st->fetch(); if(!$src)throw new RuntimeException('Criatura base inexistente.');
        $systemId=(int)$src['system_id']; $sourceMaterialId=homebrewSourceId($db,$systemId); $num=fn(string $k)=>isset($body[$k])&&$body[$k]!==''?(int)$body[$k]:null; $txt=fn(string $k,string $s)=>array_key_exists($k,$body)?trim((string)$body[$k]):($src[$s]??null);
        $sql='INSERT INTO creatures(system_id,creature_type_id,creature_size_id,visibility_level_id,source_creature_id,created_by_user_id,source_material_id,custom_identifier,custom_tag,name,short_description,description,armor_class_text,hit_points_text,speed_text,strength,dexterity,constitution,intelligence,wisdom,charisma,saving_throws_text,skills_text,damage_resistances_text,damage_immunities_text,damage_vulnerabilities_text,condition_immunities_text,senses_text,languages_text,challenge_rating_text,experience_points,traits_text,equipment_text,environment_text,is_custom,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1)';
        $db->prepare($sql)->execute([$systemId,$num('creatureTypeId')??$src['creature_type_id'],$num('creatureSizeId')??$src['creature_size_id'],$src['visibility_level_id'],$sourceId,$user['id'],$sourceMaterialId,$identifier,$tag,$name,$txt('shortDescription','short_description'),$txt('description','description'),$txt('armorClassText','armor_class_text'),$txt('hitPointsText','hit_points_text'),$txt('speedText','speed_text'),$num('strength')??$src['strength'],$num('dexterity')??$src['dexterity'],$num('constitution')??$src['constitution'],$num('intelligence')??$src['intelligence'],$num('wisdom')??$src['wisdom'],$num('charisma')??$src['charisma'],$txt('savingThrowsText','saving_throws_text'),$txt('skillsText','skills_text'),$txt('damageResistancesText','damage_resistances_text'),$txt('damageImmunitiesText','damage_immunities_text'),$txt('damageVulnerabilitiesText','damage_vulnerabilities_text'),$txt('conditionImmunitiesText','condition_immunities_text'),$txt('sensesText','senses_text'),$txt('languagesText','languages_text'),$txt('challengeRatingText','challenge_rating_text'),$num('experiencePoints')??$src['experience_points'],$txt('traitsText','traits_text'),$txt('equipmentText','equipment_text'),$txt('environmentText','environment_text')]);
        $id=(int)$db->lastInsertId(); copyCodexTags($db,'creature',$sourceId,$id); copyCodexMediaLinks($db,'creature',$sourceId,$id);
        return ['id'=>$id,'kind'=>'creature','customIdentifier'=>$identifier];
    }
    if($kind==='item'){
        customMeta($db,'items',$identifier); $st=$db->prepare('SELECT * FROM items WHERE id=?');$st->execute([$sourceId]);$src=$st->fetch(); if(!$src)throw new RuntimeException('Objeto base inexistente.');
        $systemId=(int)$src['system_id']; $sourceMaterialId=homebrewSourceId($db,$systemId); $num=fn(string $k)=>isset($body[$k])&&$body[$k]!==''?(int)$body[$k]:null; $txt=fn(string $k,string $s)=>array_key_exists($k,$body)?trim((string)$body[$k]):($src[$s]??null); $bool=fn(string $k,string $s)=>array_key_exists($k,$body)?(!empty($body[$k])?1:0):(int)$src[$s];
        $sql='INSERT INTO items(system_id,item_type_id,item_rarity_id,visibility_level_id,source_item_id,created_by_user_id,source_material_id,custom_identifier,custom_tag,name,short_description,description,requires_attunement,weight_text,value_text,armor_class_text,damage_text,properties_text,charges_text,resource_cost_text,requirements_text,is_magical,is_consumable,is_custom,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1)';
        $db->prepare($sql)->execute([$systemId,$num('itemTypeId')??$src['item_type_id'],$num('itemRarityId')??$src['item_rarity_id'],$src['visibility_level_id'],$sourceId,$user['id'],$sourceMaterialId,$identifier,$tag,$name,$txt('shortDescription','short_description'),$txt('description','description'),$bool('requiresAttunement','requires_attunement'),$txt('weightText','weight_text'),$txt('valueText','value_text'),$txt('armorClassText','armor_class_text'),$txt('damageText','damage_text'),$txt('propertiesText','properties_text'),$txt('chargesText','charges_text'),$txt('resourceCostText','resource_cost_text'),$txt('requirementsText','requirements_text'),$bool('isMagical','is_magical'),$bool('isConsumable','is_consumable')]);
        $id=(int)$db->lastInsertId(); copyCodexTags($db,'item',$sourceId,$id); copyCodexMediaLinks($db,'item',$sourceId,$id);
        return ['id'=>$id,'kind'=>'item','customIdentifier'=>$identifier];
    }
    if($kind==='spell'){
        customMeta($db,'actions',$identifier); $st=$db->prepare("SELECT a.* FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id WHERE a.id=? AND ac.code='spell'");$st->execute([$sourceId]);$src=$st->fetch(); if(!$src)throw new RuntimeException('Conjuro base inexistente.');
        $systemId=(int)$src['system_id']; $h=codexCustomInput($body,$src); $num=$h['num']; $txt=$h['txt']; $bool=$h['bool'];
        $sql='INSERT INTO actions(system_id,action_category_id,activation_type_id,visibility_level_id,source_action_id,created_by_user_id,custom_identifier,custom_tag,name,short_description,description,range_text,duration_text,damage_text,healing_text,saving_throw_type_id,attack_roll_type_id,spell_level,magic_school_id,components_text,requires_concentration,is_ritual,resource_cost_text,scaling_text,is_custom,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1)';
        $db->prepare($sql)->execute([$systemId,$src['action_category_id'],$num('activationTypeId')??$src['activation_type_id'],$src['visibility_level_id'],$sourceId,$user['id'],$identifier,$tag,$name,$txt('shortDescription','short_description'),$txt('description','description'),$txt('rangeText','range_text'),$txt('durationText','duration_text'),$txt('damageText','damage_text'),$txt('healingText','healing_text'),$num('savingThrowTypeId')??$src['saving_throw_type_id'],$num('attackRollTypeId')??$src['attack_roll_type_id'],$num('spellLevel')??$src['spell_level'],$num('magicSchoolId')??$src['magic_school_id'],$txt('componentsText','components_text'),$bool('requiresConcentration','requires_concentration'),$bool('isRitual','is_ritual'),$txt('resourceCostText','resource_cost_text'),$txt('scalingText','scaling_text')]);
        $id=(int)$db->lastInsertId(); copyActionTags($db,$sourceId,$id); copyActionClassAvailability($db,$sourceId,$id);
        return ['id'=>$id,'kind'=>'spell','customIdentifier'=>$identifier];
    }
    throw new RuntimeException('Tipo de registro inválido.');
}
function updateCustomCodexRecord(PDO $db,array $user,string $kind,int $id,array $body): array {
    $name=trim((string)($body['name']??'')); if($name==='')throw new RuntimeException('Escribe un nombre.');
    $identifier=cleanCode((string)($body['customIdentifier']??'')); $tag=trim((string)($body['customTag']??'Homebrew')) ?: 'Homebrew';
    if($kind==='creature'){
        customMeta($db,'creatures',$identifier,$id); $st=$db->prepare('SELECT * FROM creatures WHERE id=? AND is_custom=1');$st->execute([$id]);$src=$st->fetch(); if(!$src)throw new RuntimeException('Solo puedes editar registros custom existentes.');
        $h=codexCustomInput($body,$src); $num=$h['num']; $txt=$h['txt'];
        $sql='UPDATE creatures SET creature_type_id=?,creature_size_id=?,custom_identifier=?,custom_tag=?,name=?,short_description=?,description=?,armor_class_text=?,hit_points_text=?,speed_text=?,strength=?,dexterity=?,constitution=?,intelligence=?,wisdom=?,charisma=?,saving_throws_text=?,skills_text=?,damage_resistances_text=?,damage_immunities_text=?,damage_vulnerabilities_text=?,condition_immunities_text=?,senses_text=?,languages_text=?,challenge_rating_text=?,experience_points=?,traits_text=?,equipment_text=?,environment_text=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND is_custom=1';
        $db->prepare($sql)->execute([$num('creatureTypeId')??$src['creature_type_id'],$num('creatureSizeId')??$src['creature_size_id'],$identifier,$tag,$name,$txt('shortDescription','short_description'),$txt('description','description'),$txt('armorClassText','armor_class_text'),$txt('hitPointsText','hit_points_text'),$txt('speedText','speed_text'),$num('strength')??$src['strength'],$num('dexterity')??$src['dexterity'],$num('constitution')??$src['constitution'],$num('intelligence')??$src['intelligence'],$num('wisdom')??$src['wisdom'],$num('charisma')??$src['charisma'],$txt('savingThrowsText','saving_throws_text'),$txt('skillsText','skills_text'),$txt('damageResistancesText','damage_resistances_text'),$txt('damageImmunitiesText','damage_immunities_text'),$txt('damageVulnerabilitiesText','damage_vulnerabilities_text'),$txt('conditionImmunitiesText','condition_immunities_text'),$txt('sensesText','senses_text'),$txt('languagesText','languages_text'),$txt('challengeRatingText','challenge_rating_text'),$num('experiencePoints')??$src['experience_points'],$txt('traitsText','traits_text'),$txt('equipmentText','equipment_text'),$txt('environmentText','environment_text'),$id]);
        return ['id'=>$id,'kind'=>'creature','customIdentifier'=>$identifier];
    }
    if($kind==='item'){
        customMeta($db,'items',$identifier,$id); $st=$db->prepare('SELECT * FROM items WHERE id=? AND is_custom=1');$st->execute([$id]);$src=$st->fetch(); if(!$src)throw new RuntimeException('Solo puedes editar registros custom existentes.');
        $h=codexCustomInput($body,$src); $num=$h['num']; $txt=$h['txt']; $bool=$h['bool'];
        $sql='UPDATE items SET item_type_id=?,item_rarity_id=?,custom_identifier=?,custom_tag=?,name=?,short_description=?,description=?,requires_attunement=?,weight_text=?,value_text=?,armor_class_text=?,damage_text=?,properties_text=?,charges_text=?,resource_cost_text=?,requirements_text=?,is_magical=?,is_consumable=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND is_custom=1';
        $db->prepare($sql)->execute([$num('itemTypeId')??$src['item_type_id'],$num('itemRarityId')??$src['item_rarity_id'],$identifier,$tag,$name,$txt('shortDescription','short_description'),$txt('description','description'),$bool('requiresAttunement','requires_attunement'),$txt('weightText','weight_text'),$txt('valueText','value_text'),$txt('armorClassText','armor_class_text'),$txt('damageText','damage_text'),$txt('propertiesText','properties_text'),$txt('chargesText','charges_text'),$txt('resourceCostText','resource_cost_text'),$txt('requirementsText','requirements_text'),$bool('isMagical','is_magical'),$bool('isConsumable','is_consumable'),$id]);
        return ['id'=>$id,'kind'=>'item','customIdentifier'=>$identifier];
    }
    if($kind==='spell'){
        customMeta($db,'actions',$identifier,$id); $st=$db->prepare("SELECT a.* FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id WHERE a.id=? AND a.is_custom=1 AND ac.code='spell'");$st->execute([$id]);$src=$st->fetch(); if(!$src)throw new RuntimeException('Solo puedes editar conjuros custom existentes.');
        $h=codexCustomInput($body,$src); $num=$h['num']; $txt=$h['txt']; $bool=$h['bool'];
        $sql='UPDATE actions SET activation_type_id=?,custom_identifier=?,custom_tag=?,name=?,short_description=?,description=?,range_text=?,duration_text=?,damage_text=?,healing_text=?,saving_throw_type_id=?,attack_roll_type_id=?,spell_level=?,magic_school_id=?,components_text=?,requires_concentration=?,is_ritual=?,resource_cost_text=?,scaling_text=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND is_custom=1';
        $db->prepare($sql)->execute([$num('activationTypeId')??$src['activation_type_id'],$identifier,$tag,$name,$txt('shortDescription','short_description'),$txt('description','description'),$txt('rangeText','range_text'),$txt('durationText','duration_text'),$txt('damageText','damage_text'),$txt('healingText','healing_text'),$num('savingThrowTypeId')??$src['saving_throw_type_id'],$num('attackRollTypeId')??$src['attack_roll_type_id'],$num('spellLevel')??$src['spell_level'],$num('magicSchoolId')??$src['magic_school_id'],$txt('componentsText','components_text'),$bool('requiresConcentration','requires_concentration'),$bool('isRitual','is_ritual'),$txt('resourceCostText','resource_cost_text'),$txt('scalingText','scaling_text'),$id]);
        return ['id'=>$id,'kind'=>'spell','customIdentifier'=>$identifier];
    }
    throw new RuntimeException('Tipo de registro inválido.');
}
function uploadCustomCodexMedia(PDO $db,array $user): array {
    $kind=(string)($_POST['kind']??''); $id=(int)($_POST['id']??0); if($id<1) throw new RuntimeException('Registro custom inválido.');
    $map=['creature'=>['table'=>'creatures','entity'=>'creature','purpose'=>'portrait'],'item'=>['table'=>'items','entity'=>'item','purpose'=>'icon'],'spell'=>['table'=>'actions','entity'=>'action','purpose'=>'icon']];
    if(!isset($map[$kind])) throw new RuntimeException('Tipo de registro inválido.');
    $m=$map[$kind];
    $sql=$kind==='spell'?"SELECT a.id,a.name,a.visibility_level_id FROM actions a JOIN action_categories ac ON ac.id=a.action_category_id WHERE a.id=? AND a.is_custom=1 AND ac.code='spell'":"SELECT id,name,visibility_level_id FROM {$m['table']} WHERE id=? AND is_custom=1";
    $st=$db->prepare($sql);$st->execute([$id]);$record=$st->fetch(); if(!$record) throw new RuntimeException('Solo puedes adjuntar imagen a registros custom existentes.');
    if(!isset($_FILES['image'])) throw new RuntimeException('Selecciona una imagen.');
    $f=$_FILES['image']; if($f['error']!==UPLOAD_ERR_OK) throw new RuntimeException('No se pudo recibir la imagen.');
    if((int)$f['size']>15*1024*1024) throw new RuntimeException('La imagen supera el límite permitido de 15 MB.');
    $info=getimagesize($f['tmp_name']); $allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp']; if(!$info||!isset($allowed[$info['mime']])) throw new RuntimeException('Formato no admitido. Usa JPEG, PNG o WebP.');
    $relDir='codex/custom/'.$m['entity']; $dir=dirname(__DIR__).'/storage/uploads/'.$relDir; if(!is_dir($dir)) mkdir($dir,0770,true);
    $name=bin2hex(random_bytes(24)).'.'.$allowed[$info['mime']]; if(!move_uploaded_file($f['tmp_name'],$dir.'/'.$name)) throw new RuntimeException('No se pudo guardar la imagen.');
    $storagePath=$relDir.'/'.$name; $driver=(int)$db->query("SELECT id FROM media_storage_drivers WHERE code='local'")->fetchColumn(); $purposeSt=$db->prepare('SELECT id FROM media_purposes WHERE code=?');$purposeSt->execute([$m['purpose']]);$purpose=(int)$purposeSt->fetchColumn();
    $db->prepare('INSERT INTO media_assets(storage_driver_id,owner_user_id,original_filename,title,alt_text,storage_path,mime_type,width_px,height_px,size_bytes,sha256,is_private,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)')->execute([$driver,$user['id'],$f['name'],$record['name'],$record['name'],$storagePath,$info['mime'],$info[0],$info[1],$f['size'],hash_file('sha256',$dir.'/'.$name),1]);
    $mediaId=(int)$db->lastInsertId();
    $db->prepare('INSERT INTO codex_media_links(media_asset_id,entity_type,entity_id,media_purpose_id,visibility_level_id,title,is_primary) VALUES (?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE is_primary=VALUES(is_primary),title=VALUES(title)')->execute([$mediaId,$m['entity'],$id,$purpose,$record['visibility_level_id'],$record['name']]);
    return ['id'=>$mediaId,'url'=>'/api/codex/media/'.$mediaId];
}
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
    if(!$allowed&&in_array($user['role'],['PLAYER','GUEST'],true)){
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
