<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=UTF-8');

$userId = requireAuthenticatedUserId();
$pdo = getDatabaseConnection();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($method) {
    case 'GET':
        handleListMemories($pdo, $userId);
        break;
    case 'POST':
    case 'PUT':
        handleUpsertMemory($pdo, $userId);
        break;
    case 'DELETE':
        handleDeleteMemory($pdo, $userId);
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        break;
}

function handleListMemories(PDO $pdo, int $userId): void {
    $stmt = $pdo->prepare(
        'SELECT * FROM memories WHERE userId = :userId ORDER BY isPinned DESC, updatedAt DESC'
    );
    $stmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll();

    $memories = array_map(static function (array $row) use ($userId): array {
        // Never expose another tenant — the query already filters, but the
        // response still must not rewrite userId.
        $row['userId'] = $userId;
        $row['tags'] = json_decode((string) ($row['tags'] ?? '[]'), true) ?: [];
        $row['attachments'] = json_decode((string) ($row['attachments'] ?? '[]'), true) ?: [];
        $row['isPinned'] = (bool) $row['isPinned'];
        $row['orderIndex'] = (int) ($row['orderIndex'] ?? 0);
        $row['createdAt'] = (int) $row['createdAt'];
        $row['updatedAt'] = (int) $row['updatedAt'];
        $row['contentText'] = (string) ($row['contentText'] ?? '');
        $row['colorTheme'] = (string) ($row['colorTheme'] ?? 'pastel-yellow');
        return $row;
    }, $rows);

    echo json_encode($memories);
}

function handleUpsertMemory(PDO $pdo, int $userId): void {
    $raw = file_get_contents('php://input');
    $data = json_decode(is_string($raw) ? $raw : '', true);

    if (!is_array($data) || !isset($data['id'], $data['title'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: id or title']);
        exit;
    }

    $id = (string) $data['id'];
    if ($id === '' || strlen($id) > 36) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid memory id']);
        exit;
    }

    $ownerStmt = $pdo->prepare('SELECT userId FROM memories WHERE id = :id LIMIT 1');
    $ownerStmt->bindValue(':id', $id, PDO::PARAM_STR);
    $ownerStmt->execute();
    $existing = $ownerStmt->fetch();

    if ($existing !== false && (int) $existing['userId'] !== $userId) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }

    $title = (string) $data['title'];
    $contentHtml = (string) ($data['contentHtml'] ?? '');
    $contentText = (string) ($data['contentText'] ?? '');
    $tagsJson = json_encode($data['tags'] ?? []) ?: '[]';
    $attachmentsJson = json_encode($data['attachments'] ?? []) ?: '[]';
    $colorTheme = (string) ($data['colorTheme'] ?? 'pastel-yellow');
    $isPinned = !empty($data['isPinned']) ? 1 : 0;
    $orderIndex = (int) ($data['orderIndex'] ?? 0);
    $createdAt = (int) ($data['createdAt'] ?? (int) round(microtime(true) * 1000));
    $updatedAt = (int) ($data['updatedAt'] ?? (int) round(microtime(true) * 1000));

    if ($existing === false) {
        $sql = 'INSERT INTO memories (
                    id, userId, title, contentHtml, contentText, tags, attachments,
                    colorTheme, isPinned, orderIndex, createdAt, updatedAt
                ) VALUES (
                    :id, :userId, :title, :contentHtml, :contentText, :tags, :attachments,
                    :colorTheme, :isPinned, :orderIndex, :createdAt, :updatedAt
                )';
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':userId', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':createdAt', $createdAt, PDO::PARAM_INT);
    } else {
        // Ownership already verified. userId is never written on update.
        $sql = 'UPDATE memories SET
                    title = :title,
                    contentHtml = :contentHtml,
                    contentText = :contentText,
                    tags = :tags,
                    attachments = :attachments,
                    colorTheme = :colorTheme,
                    isPinned = :isPinned,
                    orderIndex = :orderIndex,
                    updatedAt = :updatedAt
                WHERE id = :id AND userId = :userId';
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    }

    $stmt->bindValue(':id', $id, PDO::PARAM_STR);
    $stmt->bindValue(':title', $title, PDO::PARAM_STR);
    $stmt->bindValue(':contentHtml', $contentHtml, PDO::PARAM_STR);
    $stmt->bindValue(':contentText', $contentText, PDO::PARAM_STR);
    $stmt->bindValue(':tags', $tagsJson, PDO::PARAM_STR);
    $stmt->bindValue(':attachments', $attachmentsJson, PDO::PARAM_STR);
    $stmt->bindValue(':colorTheme', $colorTheme, PDO::PARAM_STR);
    $stmt->bindValue(':isPinned', $isPinned, PDO::PARAM_INT);
    $stmt->bindValue(':orderIndex', $orderIndex, PDO::PARAM_INT);
    $stmt->bindValue(':updatedAt', $updatedAt, PDO::PARAM_INT);
    $stmt->execute();

    echo json_encode(['success' => true, 'id' => $id]);
}

function handleDeleteMemory(PDO $pdo, int $userId): void {
    $id = (string) ($_GET['id'] ?? '');
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing memory id']);
        exit;
    }

    $selectStmt = $pdo->prepare(
        'SELECT attachments FROM memories WHERE id = :id AND userId = :userId LIMIT 1'
    );
    $selectStmt->bindValue(':id', $id, PDO::PARAM_STR);
    $selectStmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    $selectStmt->execute();
    $record = $selectStmt->fetch();

    if ($record === false) {
        http_response_code(404);
        echo json_encode(['error' => 'Memory not found']);
        exit;
    }

    if (!empty($record['attachments'])) {
        $attachments = json_decode((string) $record['attachments'], true) ?: [];
        $uploadDir = realpath(__DIR__ . '/uploads');

        foreach ($attachments as $att) {
            if (!empty($att['storedFilename']) && is_string($uploadDir)) {
                $targetPath = $uploadDir . DIRECTORY_SEPARATOR . basename((string) $att['storedFilename']);
                if (str_starts_with($targetPath, $uploadDir) && file_exists($targetPath)) {
                    unlink($targetPath);
                }
            }
        }
    }

    $deleteStmt = $pdo->prepare(
        'DELETE FROM memories WHERE id = :id AND userId = :userId'
    );
    $deleteStmt->bindValue(':id', $id, PDO::PARAM_STR);
    $deleteStmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    $deleteStmt->execute();

    echo json_encode(['success' => true]);
}
