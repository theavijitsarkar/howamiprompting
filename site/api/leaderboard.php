<?php
require __DIR__ . '/_db.php';
header('Cache-Control: public, max-age=60');
try {
    $rows = db()->query('SELECT handle, github, overall, scores, persona, level, ai, prompts, tools, created_at FROM leaderboard ORDER BY overall DESC, created_at ASC LIMIT 500')->fetchAll();
    $seen = []; $top = [];
    foreach ($rows as $r) {
        $k = mb_strtolower($r['handle']);
        if (isset($seen[$k])) continue;
        $seen[$k] = true;
        $r['scores'] = json_decode((string)$r['scores'], true);
        $r['ai'] = (bool)$r['ai'];
        $top[] = $r;
        if (count($top) >= 50) break;
    }
    $total = (int)db()->query('SELECT COUNT(DISTINCT handle) FROM leaderboard')->fetchColumn();
    out(['total' => $total, 'top' => $top]);
} catch (Throwable $e) {
    out(['total' => 0, 'top' => [], 'error' => 'unavailable'], 200);
}
