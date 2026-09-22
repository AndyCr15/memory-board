<?php
declare(strict_types=1);

// MariaDB Database Credentials
define('DB_HOST', 'localhost');
define('DB_NAME', 'youruser_memories');
define('DB_USER', 'youruser_memories_user');
define('DB_PASS', 'replace_with_actual_password');

/** Keep signed-in sessions for 30 days. */
define('SESSION_LIFETIME_SECONDS', 60 * 60 * 24 * 30);

function isAppRequestHttps(): bool {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    if (isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443') {
        return true;
    }
    $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return $forwarded === 'https';
}

/**
 * Configure a persistent HttpOnly session cookie, then start the session.
 * Cookie lifetime is applied only via session_set_cookie_params (before start)
 * so hosts do not receive conflicting Set-Cookie headers.
 */
function startAppSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $lifetime = SESSION_LIFETIME_SECONDS;
    $secure = isAppRequestHttps();

    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_secure', $secure ? '1' : '0');
    ini_set('session.cookie_samesite', 'Lax');
    ini_set('session.cookie_lifetime', (string) $lifetime);
    ini_set('session.gc_maxlifetime', (string) $lifetime);

    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => $lifetime,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    } else {
        session_set_cookie_params($lifetime, '/; samesite=Lax', '', $secure, true);
    }

    session_start();
}

function clearAppSessionCookie(): void {
    $secure = isAppRequestHttps();
    $name = session_name();

    if (PHP_VERSION_ID >= 70300) {
        setcookie($name, '', [
            'expires' => time() - 42000,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    } else {
        setcookie($name, '', time() - 42000, '/', '', $secure, true);
    }
}
