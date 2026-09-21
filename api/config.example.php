<?php
declare(strict_types=1);

// MariaDB Database Credentials
define('DB_HOST', 'localhost');
define('DB_NAME', 'youruser_memories');
define('DB_USER', 'youruser_memories_user');
define('DB_PASS', 'replace_with_actual_password');

/** Keep signed-in sessions for 30 days of activity. */
define('SESSION_LIFETIME_SECONDS', 60 * 60 * 24 * 30);

/**
 * Configure long-lived, HttpOnly session cookies before session_start().
 * Safe to call more than once; no-ops once a session is already active.
 */
function configureAppSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');
    ini_set('session.gc_maxlifetime', (string) SESSION_LIFETIME_SECONDS);
    ini_set('session.cookie_lifetime', (string) SESSION_LIFETIME_SECONDS);

    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';

    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME_SECONDS,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/**
 * Start the app session (or no-op) and slide the cookie expiry forward on
 * authenticated requests so intermittent use stays signed in.
 */
function startAppSession(): void {
    configureAppSession();

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    if (!empty($_SESSION['userId'])) {
        refreshAppSessionCookie();
    }
}

function refreshAppSessionCookie(): void {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return;
    }

    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie(session_name(), session_id(), [
        'expires' => time() + SESSION_LIFETIME_SECONDS,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
