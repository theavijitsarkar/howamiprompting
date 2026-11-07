<?php
require __DIR__ . '/_db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST only'], 405);
$b = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($b)) out(['error' => 'Bad JSON'], 400);
$clean = fn($s, $n) => mb_substr(trim(preg_replace('/[^\p{L}\p{N} ._\-]/u', '', (string)$s)), 0, $n);
$handle = $clean($b['handle'] ?? '', 40);
if (mb_strlen($handle) < 2) out(['error' => 'Nickname must be at least 2 characters'], 400);
$github = preg_match('/^[A-Za-z0-9-]{1,39}$/', (string)($b['github'] ?? '')) ? $b['github'] : null;
$overall = (int)($b['overall'] ?? -1);
if ($overall < 0 || $overall > 100) out(['error' => 'Bad score'], 400);
$scores = [];
foreach (['clarity', 'context', 'specificity', 'structure', 'efficiency', 'english'] as $k) $scores[$k] = max(0, min(100, (int)($b['scores'][$k] ?? 0)));
try {
    $db = db();
    $ih = ip_hash();
    $st = $db->prepare('SELECT COUNT(*) FROM leaderboard WHERE ip_hash = ? AND created_at > ?');
    $st->execute([$ih, gmdate('Y-m-d H:i:s', time() - 86400)]);
    if ((int)$st->fetchColumn() >= 5) out(['error' => 'Daily publish limit reached — try tomorrow'], 429);
    $db->prepare('INSERT INTO leaderboard (handle, github, country, overall, scores, persona, level, ai, prompts, tools, median_words, version, ip_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
       ->execute([$handle, $github, preg_match('/^[A-Z]{2}$/', (string)($b['country'] ?? '')) ? $b['country'] : null, $overall, json_encode($scores),
           $clean($b['persona'] ?? '', 60), $clean($b['level'] ?? '', 20), !empty($b['ai']) ? 1 : 0, max(0, (int)($b['prompts'] ?? 0)),
           mb_substr(implode(', ', array_map(fn($t) => $clean($t, 30), array_slice((array)($b['tools'] ?? []), 0, 8))), 0, 255),
           max(0, min(65535, (int)($b['median_words'] ?? 0))), $clean($b['version'] ?? '', 20), $ih, gmdate('Y-m-d H:i:s')]);
    $rank = (int)$db->query('SELECT COUNT(DISTINCT handle) FROM leaderboard WHERE overall > ' . $overall)->fetchColumn() + 1;
    out(['ok' => true, 'rank' => $rank, 'url' => 'https://howamiprompting.com/#leaderboard']);
} catch (Throwable $e) {
    error_log('[hap publish] ' . $e->getMessage());
    out(['error' => 'Leaderboard is temporarily unavailable'], 503);
}
