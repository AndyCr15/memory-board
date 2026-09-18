<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

session_start();
header('Content-Type: application/json; charset=UTF-8');

// Reject unauthenticated requests
if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded or upload error']);
    exit;
}

$file = $_FILES['file'];
$maxBytes = 1024 * 1024; // 1 MB limit

// Strict size enforcement
if ($file['size'] > $maxBytes) {
    http_response_code(413);
    echo json_encode(['error' => 'File size exceeds maximum 1 MB limit']);
    exit;
}

// Server-side MIME validation using magic bytes
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

// Sanitize original file name and extract extension safely
$originalName = basename($file['name']);
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

// Whitelist of allowed extensions for additional protection
$disallowedExtensions = ['php', 'phtml', 'html', 'htm', 'js', 'sh', 'pl', 'cgi'];
if (in_array($extension, $disallowedExtensions, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Disallowed file format']);
    exit;
}

$uniqueId = bin2hex(random_bytes(16));
$storedFilename = $uniqueId . ($extension ? '.' . $extension : '');
$destination = __DIR__ . '/uploads/' . $storedFilename;

if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file to uploads folder']);
    exit;
}

echo json_encode([
    'id' => $uniqueId,
    'name' => $originalName,
    'size' => $file['size'],
    'mimeType' => $mimeType,
    'storedFilename' => $storedFilename,
]);