<?php
declare(strict_types=1);

require dirname(__DIR__).'/vendor/autoload.php';

$root=dirname(__DIR__);
if(file_exists($root.'/.env')) Dotenv\Dotenv::createImmutable($root)->safeLoad();
date_default_timezone_set($_ENV['APP_TIMEZONE'] ?? 'UTC');
