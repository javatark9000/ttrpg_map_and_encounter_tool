<?php
declare(strict_types=1);

namespace Ttrpg;

use PDO;

final class Database
{
    private static ?PDO $pdo = null;

    public static function connection(): PDO
    {
        if (self::$pdo) return self::$pdo;
        $dsn = $_ENV['DB_DSN'] ?? 'mysql:host=127.0.0.1;port=3306;dbname=ttrpg_manager;charset=utf8mb4';
        self::$pdo = new PDO($dsn, $_ENV['DB_USER'] ?? 'ttrpg', $_ENV['DB_PASSWORD'] ?? 'ttrpg', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return self::$pdo;
    }

    public static function transaction(callable $callback): mixed
    {
        $db = self::connection();
        $db->beginTransaction();
        try {
            $result = $callback($db);
            $db->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
    }
}
