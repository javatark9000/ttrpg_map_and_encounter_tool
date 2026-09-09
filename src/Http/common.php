<?php
declare(strict_types=1);

function jsonOut(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}
function ensureCsrf(): void
{
    if (empty($_COOKIE['ttrpg_csrf'])) {
        setcookie('ttrpg_csrf', bin2hex(random_bytes(24)), [
            'expires' => time() + 315360000,
            'path' => '/',
            'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'httponly' => false,
            'samesite' => 'Lax',
        ]);
    }
}
function verifyCsrf(): void
{
    $a = $_COOKIE['ttrpg_csrf'] ?? '';
    $b = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$a || !$b || !hash_equals($a, $b)) {
        throw new HttpError('Token CSRF inválido.', 419);
    }
}
function requireDm(array $u): void
{
    if ($u['role'] !== 'DM') {
        throw new HttpError('Acción exclusiva del DM.', 403);
    }
}
function assertMember(PDO $db, int $c, int $u): void
{
    $q = $db->prepare('SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=?');
    $q->execute([$c, $u]);
    if (!$q->fetchColumn()) {
        throw new HttpError('Sin acceso.', 403);
    }
}

final class HttpError extends RuntimeException
{
    public function __construct(string $message, public int $status)
    {
        parent::__construct($message);
    }
}
