<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

session_start();
header('Content-Type: application/json; charset=UTF-8');

// Enforce session authentication
if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$pdo = getDatabaseConnection();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($method) {
    case 'GET':
        $stmt = $pdo->query('SELECT * FROM memories ORDER BY isPinned DESC, orderIndex ASC');
        $rows = $stmt->fetchAll();

        // Convert JSON columns back into native arrays
        $memories = array_map(static function (array $row): array {
            $row['tags'] = json_decode($row['tags'] ?? '[]', true);
            $row['attachments'] = json_decode($row['attachments'] ?? '[]', true);
            $row['isPinned'] = (bool) $row['isPinned'];
            $row['orderIndex'] = (int) $row['orderIndex'];
            $row['createdAt'] = (int) $row['createdAt'];
            $row['updatedAt'] = (int) $row['updatedAt'];
            return $row;
        }, $rows);

        echo json_encode($memories);
        break;

    case 'POST':
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);

        if (!isset($data['id'], $data['title'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields: id or title']);
            exit;
        }

        $sql = "INSERT INTO memories (
                    id, title, contentHtml, contentText, tags, colorTheme, 
                    isPinned, orderIndex, attachments, createdAt, updatedAt
                ) VALUES (
                    :id, :title, :contentHtml, :contentText, :tags, :colorTheme, 
                    :isPinned, :orderIndex, :attachments, :createdAt, :updatedAt
                ) ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    contentHtml = VALUES(contentHtml),
                    contentText = VALUES(contentText),
                    tags = VALUES(tags),
                    colorTheme = VALUES(colorTheme),
                    isPinned = VALUES(isPinned),
                    orderIndex = VALUES(orderIndex),
                    attachments = VALUES(attachments),
                    updatedAt = VALUES(updatedAt)";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':id'          => $data['id'],
            ':title'       => $data['title'],
            ':contentHtml' => $data['contentHtml'] ?? '',
            ':contentText' => $data['contentText'] ?? '',
            ':tags'        => json_encode($data['tags'] ?? []),
            ':colorTheme'  => $data['colorTheme'] ?? 'pastel-yellow',
            ':isPinned'    => !empty($data['isPinned']) ? 1 : 0,
            ':orderIndex'  => (int) ($data['orderIndex'] ?? 0),
            ':attachments' => json_encode($data['attachments'] ?? []),
            ':createdAt'   => (int) ($data['createdAt'] ?? time() * 1000),
            ':updatedAt'   => (int) ($data['updatedAt'] ?? time() * 1000),
        ]);

        echo json_encode(['success' => true, 'id' => $data['id']]);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? '';
        if ($id === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Missing memory id']);
            exit;
        }

        // Clean up stored attachments on disk first
        $selectStmt = $pdo->prepare('SELECT attachments FROM memories WHERE id = :id');
        $selectStmt->execute([':id' => $id]);
        $record = $selectStmt->fetch();

        if ($record && !empty($record['attachments'])) {
            $attachments = json_decode($record['attachments'], true) ?: [];
            $uploadDir = realpath(__DIR__ . '/uploads');

            foreach ($attachments as $att) {
                if (!empty($att['storedFilename']) && $uploadDir) {
                    $targetPath = $uploadDir . DIRECTORY_SEPARATOR . basename($att['storedFilename']);
                    if (str_starts_with($targetPath, $uploadDir) && file_exists($targetPath)) {
                        unlink($targetPath);
                    }
                }
            }
        }

        $deleteStmt = $pdo->prepare('DELETE FROM memories WHERE id = :id');
        $deleteStmt->execute([':id' => $id]);

        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        break;
}