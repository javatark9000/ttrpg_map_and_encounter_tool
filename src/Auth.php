<?php
declare(strict_types=1);

namespace Ttrpg;

use PDO;
use RuntimeException;

final class Auth
{
    public const COOKIE = 'ttrpg_session';

    public function __construct(private PDO $db) {}

    public function register(array $data): array
    {
        $name = trim((string)($data['name'] ?? ''));
        $email = mb_strtolower(trim((string)($data['email'] ?? '')));
        $password = (string)($data['password'] ?? '');
        $role = strtoupper((string)($data['role'] ?? 'PLAYER'));
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Nombre y correo válidos son obligatorios.');
        if (mb_strlen($password) < 8) throw new RuntimeException('La contraseña debe tener al menos 8 caracteres.');
        if (!in_array($role, ['DM','PLAYER'], true)) throw new RuntimeException('Rol inválido.');
        $invite = $_ENV['DM_INVITE_CODE'] ?? '';
        if ($role === 'DM' && $invite !== '' && !hash_equals($invite, (string)($data['inviteCode'] ?? ''))) throw new RuntimeException('Código de DM inválido.');

        $stmt = $this->db->prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)');
        $stmt->execute([$name,$email,password_hash($password, PASSWORD_DEFAULT),$role]);
        $id = (int)$this->db->lastInsertId();
        $campaign = (int)$this->db->query('SELECT id FROM campaigns WHERE active=1 ORDER BY id LIMIT 1')->fetchColumn();
        if ($campaign) $this->db->prepare('INSERT IGNORE INTO campaign_members(campaign_id,user_id) VALUES (?,?)')->execute([$campaign,$id]);
        return $this->issue($id);
    }

    public function guest(): array
    {
        $email='guest@ttrpg-manager.internal';
        $stmt=$this->db->prepare('SELECT id FROM users WHERE email=? AND role=\'GUEST\' LIMIT 1');
        $stmt->execute([$email]);
        $userId=(int)$stmt->fetchColumn();
        if(!$userId){
            try{
                $this->db->prepare("INSERT INTO users(name,email,password_hash,role) VALUES ('Invitado',?,?, 'GUEST')")->execute([$email,password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT)]);
                $userId=(int)$this->db->lastInsertId();
            }catch(\PDOException){$stmt->execute([$email]);$userId=(int)$stmt->fetchColumn();}
        }
        if(!$userId) throw new RuntimeException('No se pudo iniciar el modo invitado.');
        $this->db->prepare('INSERT IGNORE INTO campaign_members(campaign_id,user_id) SELECT id,? FROM campaigns WHERE active=1')->execute([$userId]);
        return $this->issue($userId);
    }

    public function login(string $email, string $password): array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE email=? AND active=1');
        $stmt->execute([mb_strtolower(trim($email))]);
        $user = $stmt->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) throw new RuntimeException('Credenciales incorrectas.');
        return $this->issue((int)$user['id']);
    }

    public function issue(int $userId): array
    {
        $selector = bin2hex(random_bytes(12));
        $validator = bin2hex(random_bytes(32));
        $this->db->prepare('INSERT INTO auth_tokens(user_id,selector,validator_hash) VALUES (?,?,?)')
            ->execute([$userId,$selector,hash('sha256',$validator)]);
        $value = $selector . ':' . $validator;
        setcookie(self::COOKIE, $value, [
            'expires' => time() + 60 * 60 * 24 * 365 * 10,
            'path' => '/', 'secure' => $this->isHttps(), 'httponly' => true, 'samesite' => 'Lax'
        ]);
        return $this->user($userId);
    }

    public function fromToken(?string $token): ?array
    {
        if (!$token || !str_contains($token, ':')) return null;
        [$selector,$validator] = explode(':',$token,2);
        if (!preg_match('/^[a-f0-9]{24}$/',$selector) || !preg_match('/^[a-f0-9]{64}$/',$validator)) return null;
        $stmt = $this->db->prepare('SELECT t.*,u.name,u.email,u.role,u.active FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.selector=? AND t.revoked_at IS NULL');
        $stmt->execute([$selector]);
        $row = $stmt->fetch();
        if (!$row || !$row['active'] || !hash_equals($row['validator_hash'],hash('sha256',$validator))) return null;
        $this->db->prepare('UPDATE auth_tokens SET last_used_at=NOW() WHERE id=?')->execute([$row['id']]);
        return ['id'=>(int)$row['user_id'],'name'=>$row['name'],'email'=>$row['email'],'role'=>$row['role']];
    }

    public function current(): ?array { return $this->fromToken($_COOKIE[self::COOKIE] ?? null); }

    public function logout(?string $token): void
    {
        if ($token && str_contains($token, ':')) {
            $selector = explode(':',$token,2)[0];
            $this->db->prepare('UPDATE auth_tokens SET revoked_at=NOW() WHERE selector=?')->execute([$selector]);
        }
        setcookie(self::COOKIE,'',['expires'=>time()-3600,'path'=>'/','httponly'=>true,'samesite'=>'Lax']);
    }

    private function user(int $id): array
    {
        $stmt=$this->db->prepare('SELECT id,name,email,role FROM users WHERE id=?'); $stmt->execute([$id]);
        $u=$stmt->fetch(); $u['id']=(int)$u['id']; return $u;
    }

    private function isHttps(): bool { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'; }
}
