<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function getDatabaseConnection(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME);

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode(['error' => 'Database connection failure']);
            exit;
        }

        // Schema setup must not take down the whole API if one table fails.
        try {
            initializeDatabaseSchema($pdo);
        } catch (Throwable $e) {
            // Core tables may already exist; remember-token table is optional.
        }
    }

    return $pdo;
}

/**
 * Returns the authenticated tenant id or exits with HTTP 401.
 */
function requireAuthenticatedUserId(): int {
    ensureAuthenticatedSession();

    if (empty($_SESSION['userId'])) {
        http_response_code(401);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    return (int) $_SESSION['userId'];
}

/**
 * Start the PHP session and, if needed, restore login from the remember cookie.
 */
function ensureAuthenticatedSession(): void {
    startAppSession();

    if (!empty($_SESSION['userId'])) {
        touchRememberedLogin();
        return;
    }

    try {
        restoreRememberedLogin();
    } catch (Throwable $e) {
        // Never block the request if remember-me restore fails.
    }
}

/**
 * Establish a normal PHP session login. Remember-me is best-effort only.
 */
function establishUserSession(int $userId, string $username): void {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        startAppSession();
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_regenerate_id(true);
    }

    $_SESSION['userId'] = $userId;
    $_SESSION['username'] = $username;

    try {
        issueRememberedLogin($userId, $username);
    } catch (Throwable $e) {
        // Login still succeeds via the PHP session alone.
    }
}

/**
 * Issue a DB-backed remember-me cookie. Throws on DB errors (caller catches).
 */
function issueRememberedLogin(int $userId, string $username): void {
    $pdo = getDatabaseConnection();
    ensureAuthTokensTable($pdo);

    $rawToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $rawToken);
    $expiresAt = time() + SESSION_LIFETIME_SECONDS;

    try {
        $pdo->prepare('DELETE FROM auth_tokens WHERE expiresAt < :now')
            ->execute([':now' => time()]);
    } catch (Throwable $e) {
        // ignore cleanup failures
    }

    $insert = $pdo->prepare(
        'INSERT INTO auth_tokens (userId, tokenHash, expiresAt) VALUES (:userId, :tokenHash, :expiresAt)'
    );
    $insert->execute([
        ':userId' => $userId,
        ':tokenHash' => $tokenHash,
        ':expiresAt' => $expiresAt,
    ]);

    setAppCookie(AUTH_COOKIE_NAME, $rawToken, $expiresAt);
    $_SESSION['authTokenHash'] = $tokenHash;
}

function restoreRememberedLogin(): bool {
    $rawToken = (string) ($_COOKIE[AUTH_COOKIE_NAME] ?? '');
    if ($rawToken === '' || !preg_match('/^[a-f0-9]{64}$/', $rawToken)) {
        return false;
    }

    $pdo = getDatabaseConnection();
    ensureAuthTokensTable($pdo);

    $tokenHash = hash('sha256', $rawToken);
    $stmt = $pdo->prepare(
        'SELECT t.expiresAt, u.id AS userId, u.username
         FROM auth_tokens t
         INNER JOIN users u ON u.id = t.userId
         WHERE t.tokenHash = :tokenHash
         LIMIT 1'
    );
    $stmt->execute([':tokenHash' => $tokenHash]);
    $row = $stmt->fetch();

    if ($row === false || (int) $row['expiresAt'] < time()) {
        clearAppCookie(AUTH_COOKIE_NAME);
        if ($row !== false) {
            try {
                $pdo->prepare('DELETE FROM auth_tokens WHERE tokenHash = :tokenHash')
                    ->execute([':tokenHash' => $tokenHash]);
            } catch (Throwable $e) {
                // ignore
            }
        }
        return false;
    }

    $newExpiry = time() + SESSION_LIFETIME_SECONDS;
    try {
        $pdo->prepare('UPDATE auth_tokens SET expiresAt = :expiresAt WHERE tokenHash = :tokenHash')
            ->execute([
                ':expiresAt' => $newExpiry,
                ':tokenHash' => $tokenHash,
            ]);
        setAppCookie(AUTH_COOKIE_NAME, $rawToken, $newExpiry);
    } catch (Throwable $e) {
        // Still restore the session below.
    }

    $_SESSION['userId'] = (int) $row['userId'];
    $_SESSION['username'] = (string) $row['username'];
    $_SESSION['authTokenHash'] = $tokenHash;
    return true;
}

function touchRememberedLogin(): void {
    $rawToken = (string) ($_COOKIE[AUTH_COOKIE_NAME] ?? '');
    if ($rawToken === '' || !preg_match('/^[a-f0-9]{64}$/', $rawToken)) {
        return;
    }
    if (empty($_SESSION['userId'])) {
        return;
    }

    try {
        $pdo = getDatabaseConnection();
        ensureAuthTokensTable($pdo);
        $tokenHash = hash('sha256', $rawToken);
        $newExpiry = time() + SESSION_LIFETIME_SECONDS;
        $updated = $pdo->prepare(
            'UPDATE auth_tokens SET expiresAt = :expiresAt
             WHERE tokenHash = :tokenHash AND userId = :userId AND expiresAt >= :now'
        );
        $updated->execute([
            ':expiresAt' => $newExpiry,
            ':tokenHash' => $tokenHash,
            ':userId' => (int) $_SESSION['userId'],
            ':now' => time(),
        ]);
        if ($updated->rowCount() > 0) {
            setAppCookie(AUTH_COOKIE_NAME, $rawToken, $newExpiry);
        }
    } catch (Throwable $e) {
        // Non-fatal.
    }
}

function clearRememberedLogin(): void {
    $rawToken = (string) ($_COOKIE[AUTH_COOKIE_NAME] ?? '');
    clearAppCookie(AUTH_COOKIE_NAME);

    try {
        $pdo = getDatabaseConnection();
        ensureAuthTokensTable($pdo);
        if ($rawToken !== '' && preg_match('/^[a-f0-9]{64}$/', $rawToken)) {
            $pdo->prepare('DELETE FROM auth_tokens WHERE tokenHash = :tokenHash')
                ->execute([':tokenHash' => hash('sha256', $rawToken)]);
        } elseif (!empty($_SESSION['authTokenHash'])) {
            $pdo->prepare('DELETE FROM auth_tokens WHERE tokenHash = :tokenHash')
                ->execute([':tokenHash' => (string) $_SESSION['authTokenHash']]);
        }
    } catch (Throwable $e) {
        // Best-effort cleanup.
    }
}

function ensureAuthTokensTable(PDO $pdo): void {
    static $ready = false;
    if ($ready) {
        return;
    }

    // No FOREIGN KEY: some shared hosts reject extra FKs or differ on engine.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS auth_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            userId INT NOT NULL,
            tokenHash CHAR(64) NOT NULL,
            expiresAt INT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_auth_token_hash (tokenHash),
            INDEX idx_auth_user (userId),
            INDEX idx_auth_expires (expiresAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

function initializeDatabaseSchema(PDO $pdo): void {
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            passwordHash VARCHAR(255) NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS memories (
            id VARCHAR(36) PRIMARY KEY,
            userId INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            contentHtml LONGTEXT NOT NULL,
            contentText LONGTEXT NOT NULL,
            tags JSON NOT NULL,
            attachments JSON NOT NULL,
            colorTheme VARCHAR(32) NOT NULL DEFAULT 'note-paper',
            isPinned TINYINT(1) DEFAULT 0,
            orderIndex INT DEFAULT 0,
            createdAt BIGINT NOT NULL,
            updatedAt BIGINT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_memories (userId, isPinned, updatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    try {
        ensureAuthTokensTable($pdo);
    } catch (Throwable $e) {
        // Optional for login; required only for long-lived remember cookies.
    }
}
