<?php
/* Stores a share-card PNG (scores only) and returns a public link whose preview image is the card. */
require __DIR__ . '/_db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST only'], 405);
$b = json_decode(file_get_contents('php://input') ?: '', true);
$png = (string)($b['png'] ?? '');
if (!str_starts_with($png, 'data:image/png;base64,')) out(['error' => 'PNG required'], 400);
$bin = base64_decode(substr($png, 22), true);
if ($bin === false || strlen($bin) > 1800000 || substr($bin, 0, 8) !== "\x89PNG\r\n\x1a\n") out(['error' => 'Bad image'], 400);
$info = @getimagesizefromstring($bin);
if (!$info || $info[0] !== 1200 || $info[1] !== 630) out(['error' => 'Bad image size'], 400);
try {
    $db = db();
    $db->exec("CREATE TABLE IF NOT EXISTS cards (id CHAR(12) PRIMARY KEY, overall TINYINT UNSIGNED, persona VARCHAR(80), ip_hash CHAR(64), created_at DATETIME NOT NULL, INDEX(ip_hash)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ih = ip_hash();
    $st = $db->prepare('SELECT COUNT(*) FROM cards WHERE ip_hash = ? AND created_at > ?');
    $st->execute([$ih, gmdate('Y-m-d H:i:s', time() - 86400)]);
    if ((int)$st->fetchColumn() >= 20) out(['error' => 'Too many cards today — try tomorrow'], 429);
    $id = bin2hex(random_bytes(6));
    $dir = dirname(__DIR__) . '/cards';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    if (file_put_contents("$dir/$id.png", $bin) === false) throw new Exception('cards/ folder is not writable');
    $persona = mb_substr(trim(preg_replace('/[^\p{L}\p{N}\p{So} ._\-]/u', '', (string)($b['emoji'] ?? '') . ' ' . (string)($b['persona'] ?? ''))), 0, 80);
    $db->prepare('INSERT INTO cards (id, overall, persona, ip_hash, created_at) VALUES (?,?,?,?,?)')
       ->execute([$id, max(0, min(100, (int)($b['overall'] ?? 0))), $persona, $ih, gmdate('Y-m-d H:i:s')]);
    $base = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/');
    out(['ok' => true, 'id' => $id, 'url' => "$base/c/$id", 'image' => "$base/cards/$id.png"]);
} catch (Throwable $e) {
    error_log('[hap card] ' . $e->getMessage());
    out(['error' => 'Share service is temporarily unavailable'], 503);
}
