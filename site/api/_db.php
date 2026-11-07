<?php
/* Leaderboard storage (MySQL). Secrets: ../../hap-secrets.php (above public_html) or ../private/secrets.php */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function hap_secrets(): array {
    foreach ([getenv('HAP_SECRETS') ?: '', dirname(__DIR__, 2) . '/hap-secrets.php', dirname(__DIR__) . '/private/secrets.php'] as $p) {
        if ($p && is_file($p)) return require $p;
    }
    return [];
}
function out($d, int $code = 200): void { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $s = hap_secrets();
    $d = ($s['db'] ?? []) + ['host' => '127.0.0.1', 'port' => 3306, 'name' => 'howamiprompting', 'user' => 'root', 'pass' => ''];
    $pdo = new PDO("mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset=utf8mb4", $d['user'], $d['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec("CREATE TABLE IF NOT EXISTS leaderboard (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        handle VARCHAR(40) NOT NULL, github VARCHAR(40) NULL, country CHAR(2) NULL,
        overall TINYINT UNSIGNED NOT NULL, scores TEXT NULL, persona VARCHAR(60) NULL, level VARCHAR(20) NULL, ai TINYINT(1) DEFAULT 0,
        prompts INT UNSIGNED DEFAULT 0, tools VARCHAR(255) NULL, median_words SMALLINT UNSIGNED NULL, version VARCHAR(20) NULL,
        ip_hash CHAR(64) NOT NULL, created_at DATETIME NOT NULL,
        INDEX(overall), INDEX(ip_hash), INDEX(created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    return $pdo;
}
function ip_hash(): string {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')[0] ?: ($_SERVER['REMOTE_ADDR'] ?? '');
    return hash('sha256', trim($ip) . '|' . (hap_secrets()['salt'] ?? 'hap'));
}
