<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

session_start();
header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // Check if the current session is valid
    $isAuthenticated = !empty($_SESSION['authenticated']) && $_SESSION['authenticated'] === true;
    echo json_encode(['authenticated' => $isAuthenticated]);
    exit;
}

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);
    $submittedPassword = $payload['password'] ?? '';

    if (password_verify($submittedPassword, AUTH_PASSWORD_HASH)) {
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
        echo json_encode(['authenticated' => true]);
        exit;
    }

    http_response_code(401);
    echo json_encode(['error' => 'Invalid password']);
    exit;
}

if ($method === 'DELETE') {
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();
    echo json_encode(['authenticated' => false]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);