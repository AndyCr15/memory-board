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
            initializeDatabaseSchema($pdo);
        } catch (PDOException $e) {
            http_response_code(500);
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode(['error' => 'Database connection failure']);
            exit;
        }
    }

    return $pdo;
}

/**
 * Returns the authenticated tenant id or exits with HTTP 401.
 */
function requireAuthenticatedUserId(): int {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    if (empty($_SESSION['userId'])) {
        http_response_code(401);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    return (int) $_SESSION['userId'];
}

function initializeDatabaseSchema(PDO $pdo): void {
    // Purely idempotent table creation. Never drops tables at runtime.
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
            colorTheme VARCHAR(32) NOT NULL DEFAULT 'pastel-yellow',
            isPinned TINYINT(1) DEFAULT 0,
            orderIndex INT DEFAULT 0,
            createdAt BIGINT NOT NULL,
            updatedAt BIGINT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_memories (userId, isPinned, updatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}