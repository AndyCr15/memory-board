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
            echo json_encode(['error' => 'Database connection failure']);
            exit;
        }
    }

    return $pdo;
}

function initializeDatabaseSchema(PDO $pdo): void {
    $sql = "CREATE TABLE IF NOT EXISTS memories (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        contentHtml LONGTEXT,
        contentText LONGTEXT,
        tags JSON,
        colorTheme VARCHAR(32) NOT NULL,
        isPinned TINYINT(1) DEFAULT 0,
        orderIndex INT DEFAULT 0,
        attachments JSON,
        createdAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        INDEX idx_pinned_order (isPinned DESC, orderIndex ASC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    $pdo->exec($sql);
}