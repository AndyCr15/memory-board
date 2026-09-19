<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=UTF-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (!empty($_SESSION['userId'])) {
        http_response_code(200);
        echo json_encode([
            'authenticated' => true,
            'username' => (string) ($_SESSION['username'] ?? ''),
            'userId' => (int) $_SESSION['userId'],
        ]);
        exit;
    }

    http_response_code(401);
    echo json_encode(['authenticated' => false]);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$payload = readAuthPayload();
$action = (string) ($payload['action'] ?? '');

switch ($action) {
    case 'register':
        handleRegister($payload);
        break;
    case 'login':
        handleLogin($payload);
        break;
    case 'logout':
        handleLogout();
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        break;
}

/**
 * Accepts JSON bodies or classic form posts (honeypot field may arrive either way).
 *
 * @return array<string, mixed>
 */
function readAuthPayload(): array {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    return $_POST;
}

/**
 * @param array<string, mixed> $payload
 */
function handleRegister(array $payload): void {
    $website = trim((string) ($payload['website'] ?? ($_POST['website'] ?? '')));
    if ($website !== '') {
        // Honeypot tripped — pretend success and do not insert.
        http_response_code(200);
        echo json_encode(['success' => true]);
        exit;
    }

    $username = trim((string) ($payload['username'] ?? ''));
    $password = (string) ($payload['password'] ?? '');

    if (preg_match('/^[a-zA-Z0-9_]{3,50}$/', $username) !== 1) {
        http_response_code(400);
        echo json_encode(['error' => 'Username must be 3–50 characters (letters, numbers, underscore).']);
        exit;
    }

    if (strlen($password) < 8) {
        http_response_code(400);
        echo json_encode(['error' => 'Password must be at least 8 characters.']);
        exit;
    }

    $pdo = getDatabaseConnection();

    $exists = $pdo->prepare('SELECT id FROM users WHERE username = :username LIMIT 1');
    $exists->bindValue(':username', $username, PDO::PARAM_STR);
    $exists->execute();
    if ($exists->fetch() !== false) {
        http_response_code(409);
        echo json_encode(['error' => 'Username already taken']);
        exit;
    }

    $insert = $pdo->prepare(
        'INSERT INTO users (username, passwordHash) VALUES (:username, :passwordHash)'
    );
    $insert->bindValue(':username', $username, PDO::PARAM_STR);
    $insert->bindValue(':passwordHash', password_hash($password, PASSWORD_DEFAULT), PDO::PARAM_STR);
    $insert->execute();

    session_regenerate_id(true);
    $_SESSION['userId'] = (int) $pdo->lastInsertId();
    $_SESSION['username'] = $username;

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'username' => $username,
        'userId' => (int) $_SESSION['userId'],
    ]);
}

/**
 * @param array<string, mixed> $payload
 */
function handleLogin(array $payload): void {
    $username = trim((string) ($payload['username'] ?? ''));
    $password = (string) ($payload['password'] ?? '');

    $pdo = getDatabaseConnection();
    $stmt = $pdo->prepare(
        'SELECT id, username, passwordHash FROM users WHERE username = :username LIMIT 1'
    );
    $stmt->bindValue(':username', $username, PDO::PARAM_STR);
    $stmt->execute();
    $user = $stmt->fetch();

    if (
        $user === false
        || !password_verify($password, (string) $user['passwordHash'])
    ) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid username or password']);
        exit;
    }

    session_regenerate_id(true);
    $_SESSION['userId'] = (int) $user['id'];
    $_SESSION['username'] = (string) $user['username'];

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'username' => $user['username'],
        'userId' => (int) $user['id'],
    ]);
}

function handleLogout(): void {
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            (bool) $params['secure'],
            (bool) $params['httponly']
        );
    }

    session_destroy();

    http_response_code(200);
    echo json_encode(['success' => true]);
}
