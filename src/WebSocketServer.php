<?php
declare(strict_types=1);

namespace Ttrpg;

use RuntimeException;
use Workerman\Connection\TcpConnection;
use Workerman\Worker;

final class WebSocketServer
{
    private array $meta=[];

    public function __construct(private Auth $auth,private GameService $game) {}

    public function attach(Worker $worker): void
    {
        $worker->onWebSocketConnect=fn(TcpConnection $c,string $headers)=>$this->open($c);
        $worker->onMessage=fn(TcpConnection $c,string $msg)=>$this->message($worker,$c,$msg);
        $worker->onClose=fn(TcpConnection $c)=>$this->close($c);
        $worker->onError=function(TcpConnection $c,int $code,string $message){error_log("WebSocket $code: $message");};
    }

    private function open(TcpConnection $conn): void
    {
        try {
            $configuredOrigins=array_values(array_filter(array_map('trim',explode(',',$_ENV['APP_ORIGIN']??''))));
            $requestOrigin=$_SERVER['HTTP_ORIGIN']??'';
            if($requestOrigin){
                $originHost=mb_strtolower((string)(parse_url($requestOrigin,PHP_URL_HOST)??''));
                $socketHost=mb_strtolower((string)(parse_url('//'.($_SERVER['HTTP_HOST']??''),PHP_URL_HOST)??''));
                $explicitlyAllowed=in_array(rtrim($requestOrigin,'/'),array_map(fn($origin)=>rtrim($origin,'/'),$configuredOrigins),true);
                if(!$explicitlyAllowed&&(!$originHost||!$socketHost||$originHost!==$socketHost)) throw new RuntimeException('Origen no permitido.');
            }
            $user=$this->auth->fromToken($_COOKIE[Auth::COOKIE]??null);if(!$user)throw new RuntimeException('No autenticado.');
            $connectionId=bin2hex(random_bytes(16));
            if($user['role']==='DM'&&!$this->acquireDm((int)$user['id'],$connectionId))throw new RuntimeException('Ya hay un DM conectado.');
            $this->meta[$conn->id]=['user'=>$user,'scenario'=>null,'connectionId'=>$connectionId];
            $this->send($conn,['type'=>'connected','user'=>$user]);
            if($user['role']==='GUEST'&&($view=$this->game->guestView($user)))$this->send($conn,['type'=>'dm.view.changed']+$view);
        }catch(\Throwable $e){$this->send($conn,['type'=>'error','error'=>$e->getMessage()]);$conn->close();}
    }

    private function message(Worker $worker,TcpConnection $from,string $msg): void
    {
        $m=[];
        try {
            if(!isset($this->meta[$from->id]))throw new RuntimeException('Conexión inválida.');
            $m=json_decode($msg,true,512,JSON_THROW_ON_ERROR);$kind=$m['action']??'';$user=$this->meta[$from->id]['user'];
            if($kind==='subscribe'){$sid=(int)($m['scenarioId']??0);$snapshot=$this->game->snapshot($sid,$user);$this->meta[$from->id]['scenario']=$sid;$this->send($from,['type'=>'snapshot','data'=>$snapshot]);if($user['role']==='DM'&&!empty($snapshot['scenario']['active'])){$this->game->recordDmView($user,$sid,(array)($m['camera']??[]));$this->broadcastGuestViews($worker);}return;}
            if($kind==='command'){$result=$this->game->command($user,(string)($m['type']??''),(array)($m['payload']??[]),(string)($m['requestId']??''));$this->send($from,['type'=>'command.accepted','requestId'=>$m['requestId'],'event'=>$result]);if(in_array($result['type'],['scenario.activate','scenario.deactivate'],true)){$this->broadcastScenarioListChanged($worker,(int)$result['scenarioId']);$this->broadcastGuestViews($worker);}$this->broadcastRefresh($worker,(int)$result['scenarioId']);return;}
            if($kind==='dm.view'){$this->game->recordDmView($user,(int)($m['scenarioId']??0),(array)($m['camera']??[]));$this->broadcastGuestViews($worker);return;}
            if($kind==='guest.view.get'){if($view=$this->game->guestView($user))$this->send($from,['type'=>'dm.view.changed']+$view);return;}
            if($kind==='heartbeat'){ if($user['role']==='DM')$this->renewDm((int)$user['id'],$this->meta[$from->id]['connectionId']);$this->send($from,['type'=>'heartbeat']);return;}
            throw new RuntimeException('Mensaje desconocido.');
        }catch(\Throwable $e){$this->send($from,['type'=>'command.error','requestId'=>$m['requestId']??null,'error'=>$e->getMessage()]);}
    }

    private function close(TcpConnection $conn): void
    {
        $m=$this->meta[$conn->id]??null;if($m&&$m['user']['role']==='DM')Database::connection()->prepare('DELETE FROM dm_lease WHERE user_id=? AND connection_id=?')->execute([$m['user']['id'],$m['connectionId']]);unset($this->meta[$conn->id]);
    }
    private function broadcastRefresh(Worker $worker,int $sid): void {foreach($worker->connections as $c)if(($this->meta[$c->id]['scenario']??null)===$sid)$this->send($c,['type'=>'refresh','scenarioId'=>$sid]);}
    private function broadcastScenarioListChanged(Worker $worker,int $sid): void {foreach($worker->connections as $c)$this->send($c,['type'=>'scenarios.changed','scenarioId'=>$sid]);}
    private function broadcastGuestViews(Worker $worker): void {foreach($worker->connections as $c){$meta=$this->meta[$c->id]??null;if(!$meta||$meta['user']['role']!=='GUEST')continue;if($view=$this->game->guestView($meta['user']))$this->send($c,['type'=>'dm.view.changed']+$view);}}
    private function send(TcpConnection $c,array $data): void {$c->send(json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));}
    private function acquireDm(int $uid,string $cid): bool {$db=Database::connection();$db->prepare('DELETE FROM dm_lease WHERE expires_at<NOW()')->execute();try{$db->prepare('INSERT INTO dm_lease(lease_key,user_id,connection_id,expires_at) VALUES (1,?,?,DATE_ADD(NOW(),INTERVAL 45 SECOND))')->execute([$uid,$cid]);return true;}catch(\PDOException){return false;}}
    private function renewDm(int $uid,string $cid): void {Database::connection()->prepare('UPDATE dm_lease SET expires_at=DATE_ADD(NOW(),INTERVAL 45 SECOND) WHERE user_id=? AND connection_id=?')->execute([$uid,$cid]);}
}
