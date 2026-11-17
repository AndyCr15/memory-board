<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=UTF-8');

$userId = requireAuthenticatedUserId();
$pdo = getDatabaseConnection();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($method) {
    case 'GET':
        handleListMemories($pdo, $userId, (string) ($_GET['view'] ?? '') === 'trash');
        break;
    case 'POST':
    case 'PUT':
        $action = (string) ($_GET['action'] ?? '');
        if ($action === 'batch') {
            handleBatchImport($pdo, $userId);
        } elseif ($action === 'restore') {
            handleRestoreMemory($pdo, $userId);
        } elseif ($action === 'empty-trash') {
            handleEmptyTrash($pdo, $userId);
        } elseif ($action === 'rename-tag') {
            handleRenameTag($pdo, $userId);
        } else {
            handleUpsertMemory($pdo, $userId);
        }
        break;
    case 'DELETE':
        if ((string) ($_GET['permanent'] ?? '') === '1') {
            handleDeleteMemory($pdo, $userId);
        } else {
            handleSoftDeleteMemory($pdo, $userId);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        break;
}

function handleListMemories(PDO $pdo, int $userId, bool $trash): void {
    $deletedClause = $trash ? 'deletedAt IS NOT NULL' : 'deletedAt IS NULL';
    $stmt = $pdo->prepare(
        "SELECT * FROM memories WHERE userId = :userId AND {$deletedClause} ORDER BY isPinned DESC, updatedAt DESC"
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
        $row['deletedAt'] = isset($row['deletedAt']) && $row['deletedAt'] !== null
            ? (int) $row['deletedAt']
            : null;
        $row['contentText'] = (string) ($row['contentText'] ?? '');
        $row['colorTheme'] = (string) ($row['colorTheme'] ?? 'note-paper');
        return $row;
    }, $rows);

    echo json_encode($memories);
}

function handleSoftDeleteMemory(PDO $pdo, int $userId): void {
    $id = (string) ($_GET['id'] ?? '');
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing memory id']);
        exit;
    }

    $stmt = $pdo->prepare(
        'UPDATE memories SET deletedAt = :deletedAt WHERE id = :id AND userId = :userId AND deletedAt IS NULL'
    );
    $deletedAt = (int) round(microtime(true) * 1000);
    $stmt->bindValue(':deletedAt', $deletedAt, PDO::PARAM_INT);
    $stmt->bindValue(':id', $id, PDO::PARAM_STR);
    $stmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        $exists = $pdo->prepare('SELECT id FROM memories WHERE id = :id AND userId = :userId LIMIT 1');
        $exists->bindValue(':id', $id, PDO::PARAM_STR);
        $exists->bindValue(':userId', $userId, PDO::PARAM_INT);
        $exists->execute();
        if ($exists->fetch() === false) {
            http_response_code(404);
            echo json_encode(['error' => 'Memory not found']);
            exit;
        }
    }

    echo json_encode(['success' => true, 'deletedAt' => $deletedAt]);
}

function handleRestoreMemory(PDO $pdo, int $userId): void {
    $raw = file_get_contents('php://input');
    $data = json_decode(is_string($raw) ? $raw : '', true);
    $id = is_array($data) ? (string) ($data['id'] ?? '') : '';
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing memory id']);
        exit;
    }

    $stmt = $pdo->prepare(
        'UPDATE memories SET deletedAt = NULL WHERE id = :id AND userId = :userId'
    );
    $stmt->bindValue(':id', $id, PDO::PARAM_STR);
    $stmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Memory not found']);
        exit;
    }

    echo json_encode(['success' => true]);
}

function handleEmptyTrash(PDO $pdo, int $userId): void {
    $stmt = $pdo->prepare(
        'SELECT id, attachments FROM memories WHERE userId = :userId AND deletedAt IS NOT NULL'
    );
    $stmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll();

    foreach ($rows as $record) {
        deleteStoredAttachments($record);
    }

    $deleteStmt = $pdo->prepare(
        'DELETE FROM memories WHERE userId = :userId AND deletedAt IS NOT NULL'
    );
    $deleteStmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    $deleteStmt->execute();

    echo json_encode(['success' => true, 'count' => count($rows)]);
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
    $colorTheme = (string) ($data['colorTheme'] ?? 'note-paper');
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

    deleteStoredAttachments($record);

    $deleteStmt = $pdo->prepare(
        'DELETE FROM memories WHERE id = :id AND userId = :userId'
    );
    $deleteStmt->bindValue(':id', $id, PDO::PARAM_STR);
    $deleteStmt->bindValue(':userId', $userId, PDO::PARAM_INT);
    $deleteStmt->execute();

    echo json_encode(['success' => true]);
}

function deleteStoredAttachments(array $record): void {
    if (empty($record['attachments'])) {
        return;
    }

    $attachments = json_decode((string) $record['attachments'], true) ?: [];
    $uploadDir = realpath(__DIR__ . '/uploads');
    if (!is_string($uploadDir)) {
        return;
    }

    foreach ($attachments as $att) {
        if (empty($att['storedFilename']) || !is_string($att['storedFilename'])) {
            continue;
        }
        $targetPath = $uploadDir . DIRECTORY_SEPARATOR . basename($att['storedFilename']);
        if (str_starts_with($targetPath, $uploadDir) && file_exists($targetPath)) {
            unlink($targetPath);
        }
    }
}

function normaliseTag(string $raw): string {
    $tag = strtolower(trim($raw));
    $collapsed = preg_replace('/\s+/', '-', $tag);
    return is_string($collapsed) ? $collapsed : $tag;
}

function handleRenameTag(PDO $pdo, int $userId): void {
    $raw = file_get_contents('php://input');
    $data = json_decode(is_string($raw) ? $raw : '', true);
    $from = is_array($data) ? normaliseTag((string) ($data['from'] ?? '')) : '';
    $to = is_array($data) ? normaliseTag((string) ($data['to'] ?? '')) : '';

    if ($from === '' || $to === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Both tag names are required']);
        exit;
    }

    if ($from === $to) {
        echo json_encode(['success' => true, 'count' => 0]);
        return;
    }

    $select = $pdo->prepare('SELECT id, tags FROM memories WHERE userId = :userId');
    $select->bindValue(':userId', $userId, PDO::PARAM_INT);
    $select->execute();
    $rows = $select->fetchAll();

    $update = $pdo->prepare(
        'UPDATE memories SET tags = :tags, updatedAt = :updatedAt WHERE id = :id AND userId = :userId'
    );
    $updatedAt = (int) round(microtime(true) * 1000);
    $count = 0;

    try {
        $pdo->beginTransaction();
        foreach ($rows as $row) {
            $tags = json_decode((string) ($row['tags'] ?? '[]'), true);
            if (!is_array($tags) || !in_array($from, $tags, true)) {
                continue;
            }
            $next = [];
            foreach ($tags as $tag) {
                if (!is_string($tag)) {
                    continue;
                }
                $value = $tag === $from ? $to : $tag;
                if (!in_array($value, $next, true)) {
                    $next[] = $value;
                }
            }
            $update->bindValue(':tags', json_encode($next) ?: '[]', PDO::PARAM_STR);
            $update->bindValue(':updatedAt', $updatedAt, PDO::PARAM_INT);
            $update->bindValue(':id', (string) $row['id'], PDO::PARAM_STR);
            $update->bindValue(':userId', $userId, PDO::PARAM_INT);
            $update->execute();
            $count++;
        }
        $pdo->commit();
        echo json_encode(['success' => true, 'count' => $count]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['error' => 'Tag rename failed']);
    }
}

function handleBatchImport(PDO $pdo, int $userId): void {
    $raw = file_get_contents('php://input');
    $payload = json_decode(is_string($raw) ? $raw : '', true);

    if (!is_array($payload) || !array_key_exists('memories', $payload) || !is_array($payload['memories'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Malformed input: memories array required']);
        exit;
    }

    /** @var list<array<string, mixed>> $memories */
    $memories = [];
    foreach ($payload['memories'] as $row) {
        if (is_array($row)) {
            $memories[] = $row;
        }
    }

    usort(
        $memories,
        static fn (array $a, array $b): int => strcmp((string) ($a['id'] ?? ''), (string) ($b['id'] ?? ''))
    );

    $sql = "
        INSERT INTO memories (id, userId, title, contentHtml, contentText, tags, attachments, colorTheme, isPinned, orderIndex, createdAt, updatedAt)
        VALUES (:id, :userId, :title, :contentHtml, :contentText, :tags, :attachments, :colorTheme, :isPinned, :orderIndex, :createdAt, :updatedAt)
        ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            contentHtml = VALUES(contentHtml),
            contentText = VALUES(contentText),
            tags = VALUES(tags),
            attachments = VALUES(attachments),
            colorTheme = VALUES(colorTheme),
            isPinned = VALUES(isPinned),
            orderIndex = VALUES(orderIndex),
            updatedAt = VALUES(updatedAt)
    ";

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare($sql);

        foreach ($memories as $memory) {
            $id = (string) ($memory['id'] ?? '');
            if ($id === '') {
                throw new InvalidArgumentException('Memory id is required');
            }

            $now = (int) round(microtime(true) * 1000);
            $stmt->execute([
                ':id'          => $id,
                ':userId'      => $userId,
                ':title'       => (string) ($memory['title'] ?? ''),
                ':contentHtml' => (string) ($memory['contentHtml'] ?? ''),
                ':contentText' => (string) ($memory['contentText'] ?? ''),
                ':tags'        => json_encode($memory['tags'] ?? []) ?: '[]',
                ':attachments' => json_encode($memory['attachments'] ?? []) ?: '[]',
                ':colorTheme'  => (string) ($memory['colorTheme'] ?? 'note-paper'),
                ':isPinned'    => !empty($memory['isPinned']) ? 1 : 0,
                ':orderIndex'  => (int) ($memory['orderIndex'] ?? 0),
                ':createdAt'   => (int) ($memory['createdAt'] ?? $now),
                ':updatedAt'   => (int) ($memory['updatedAt'] ?? $now),
            ]);
        }

        $pdo->commit();
        echo json_encode(['success' => true, 'count' => count($memories)]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['error' => 'Batch transaction failed']);
    }
}
