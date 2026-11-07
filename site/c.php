<?php
/* Public share page: big card preview for X / LinkedIn / WhatsApp, then a nudge to try the tool. */
$id = preg_match('/^[a-f0-9]{12}$/', $_GET['id'] ?? '') ? $_GET['id'] : null;
if (!$id || !is_file(__DIR__ . "/cards/$id.png")) { header('Location: /'); exit; }
$score = null; $persona = '';
try {
    require_once __DIR__ . '/api/_db.php';
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: public, max-age=3600');
    $st = db()->prepare('SELECT overall, persona FROM cards WHERE id = ?'); $st->execute([$id]);
    if ($r = $st->fetch()) { $score = (int)$r['overall']; $persona = $r['persona']; }
} catch (Throwable $e) { header('Content-Type: text/html; charset=utf-8'); }
$base = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
$img = "$base/cards/$id.png";
$title = $score !== null ? "I scored $score/100 on How am I prompting? $persona" : 'How am I prompting?';
$desc = 'Spotify Wrapped for your AI coding prompts. Find out how well you prompt Claude Code, Codex & Cursor: npx howamiprompting';
$h = fn($s) => htmlspecialchars($s, ENT_QUOTES);
?><!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $h($title) ?></title>
<meta name="description" content="<?= $h($desc) ?>">
<meta property="og:type" content="website"><meta property="og:url" content="<?= $h("$base/c/$id") ?>">
<meta property="og:title" content="<?= $h($title) ?>"><meta property="og:description" content="<?= $h($desc) ?>">
<meta property="og:image" content="<?= $h($img) ?>"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="<?= $h($title) ?>"><meta name="twitter:description" content="<?= $h($desc) ?>"><meta name="twitter:image" content="<?= $h($img) ?>">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=JetBrains+Mono:wght@600&display=swap" rel="stylesheet">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-C56GETBTNW"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-C56GETBTNW');</script>
<style>body{margin:0;font-family:'Bricolage Grotesque',system-ui,sans-serif;background:#fff7e8;color:#16142b;text-align:center;padding:40px 18px}img{width:100%;max-width:900px;border:3px solid #16142b;border-radius:20px;box-shadow:8px 8px 0 #16142b}h1{font-size:clamp(30px,5vw,52px);letter-spacing:-.03em;margin:34px 0 10px}.t{display:inline-block;background:#16142b;color:#fff;font-family:'JetBrains Mono',monospace;font-size:22px;padding:14px 22px;border-radius:14px;margin:12px 0 24px}.t b{color:#2ee6a6}a.b{display:inline-block;font-weight:800;font-size:18px;border:3px solid #16142b;border-radius:14px;padding:12px 22px;background:#ffd84d;color:#16142b;text-decoration:none;box-shadow:4px 4px 0 #16142b;margin:6px}</style>
</head><body>
<img src="<?= $h($img) ?>" alt="<?= $h($title) ?>">
<h1>How well do <u>you</u> prompt?</h1>
<p style="font-size:19px">Run this in your terminal — free, 100% local, no sign-up:</p>
<div class="t"><b>$</b> npx howamiprompting</div><br>
<a class="b" href="/">Learn more</a><a class="b" style="background:#fff" href="https://github.com/theavijitsarkar/howamiprompting">⭐ GitHub</a>
</body></html>
