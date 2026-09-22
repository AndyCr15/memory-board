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
 * Prefer an app-private session directory when it is actually writable.
 * Falls back to the host default if not — never blocks login.
 */
function configureSessionSavePath(): void {
    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'sessions';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    if (!is_dir($dir)) {
        return;
    }

    $deny = $dir . DIRECTORY_SEPARATOR . '.htaccess';
    if (!is_file($deny)) {
        @file_put_contents($deny, "Require all denied\n");
    }

    $probe = $dir . DIRECTORY_SEPARATOR . '.write_probe';
    if (@file_put_contents($probe, 'ok') === false) {
        return;
    }
    @unlink($probe);
    session_save_path($dir);
}

function setAppCookie(string $name, string $value, int $expires): void {
    $secure = isAppRequestHttps();
    if (PHP_VERSION_ID >= 70300) {
        setcookie($name, $value, [
            'expires' => $expires,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        return;
    }
    setcookie($name, $value, $expires, '/', '', $secure, true);
}

function clearAppCookie(string $name): void {
    setAppCookie($name, '', time() - 42000);
}

function startAppSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $lifetime = SESSION_LIFETIME_SECONDS;
    $secure = isAppRequestHttps();

    configureSessionSavePath();

    @ini_set('session.use_only_cookies', '1');
    @ini_set('session.use_strict_mode', '0');
    @ini_set('session.cookie_httponly', '1');
    @ini_set('session.cookie_secure', $secure ? '1' : '0');
    @ini_set('session.cookie_samesite', 'Lax');
    @ini_set('session.cookie_lifetime', (string) $lifetime);
    @ini_set('session.gc_maxlifetime', (string) $lifetime);

    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => $lifetime,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    } else {
        session_set_cookie_params($lifetime, '/', '', $secure, true);
    }

    @session_start();
}

function clearAppSessionCookie(): void {
    clearAppCookie(session_name());
}
