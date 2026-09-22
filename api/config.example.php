<?php
declare(strict_types=1);

// MariaDB Database Credentials
define('DB_HOST', 'localhost');
define('DB_NAME', 'youruser_memories');
define('DB_USER', 'youruser_memories_user');
define('DB_PASS', 'replace_with_actual_password');

/** Keep signed-in sessions for 30 days. */
define('SESSION_LIFETIME_SECONDS', 60 * 60 * 24 * 30);

/** Long-lived remember-me cookie (survives shared-host session GC). */
define('AUTH_COOKIE_NAME', 'memoryboard_auth');

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
 * Private session directory so other sites on the same host cannot garbage-collect
 * our session files with a short default gc_maxlifetime (~24 minutes).
 */
function appSessionSavePath(): string {
    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'sessions';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $deny = $dir . DIRECTORY_SEPARATOR . '.htaccess';
    if (!is_file($deny)) {
        @file_put_contents($deny, "Require all denied\n");
    }
    return $dir;
}

function appCookieOptions(int $expires): array {
    return [
        'expires' => $expires,
        'path' => '/',
        'secure' => isAppRequestHttps(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function setAppCookie(string $name, string $value, int $expires): void {
    if (PHP_VERSION_ID >= 70300) {
        setcookie($name, $value, appCookieOptions($expires));
        return;
    }
    setcookie(
        $name,
        $value,
        $expires,
        '/',
        '',
        isAppRequestHttps(),
        true
    );
}

function clearAppCookie(string $name): void {
    setAppCookie($name, '', time() - 42000);
}

/**
 * Configure a persistent HttpOnly session cookie in an isolated save path.
 */
function startAppSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $lifetime = SESSION_LIFETIME_SECONDS;
    $secure = isAppRequestHttps();
    $savePath = appSessionSavePath();

    if (is_dir($savePath) && is_writable($savePath)) {
        session_save_path($savePath);
    }

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
    clearAppCookie(session_name());
}
