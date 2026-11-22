<?php
require 'vendor/autoload.php';
use Aws\S3\S3Client;
use Aws\Exception\AwsException;

$bucket = getenv('BUCKET');
$key = getenv('OBJETO');

// Las credenciales salen de las variables de entorno, no del codigo
$s3 = new S3Client(['region' => 'us-east-2', 'version' => 'latest']);

try {
    $r = $s3->getObject(['Bucket' => $bucket, 'Key' => $key]);
    echo "Cifrado: " . $r['ServerSideEncryption'] . " | Clave: " . basename($r['SSEKMSKeyId']) . "\n";
    echo $r['Body'];
} catch (AwsException $e) {
    echo "Error: " . $e->getAwsErrorCode() . " - sin permiso en la clave KMS\n";
}
