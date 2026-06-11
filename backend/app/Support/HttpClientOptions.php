<?php

namespace App\Support;

/**
 * SSL options for outbound HTTP on Windows/dev machines missing a system CA bundle.
 */
class HttpClientOptions
{
    public static function caBundle(): ?string
    {
        $path = env('SSL_CA_BUNDLE') ?: storage_path('certs/cacert.pem');

        return ($path && is_readable($path)) ? $path : null;
    }

    /** @return array<string, mixed> */
    public static function guzzle(): array
    {
        $bundle = self::caBundle();

        return $bundle ? ['verify' => $bundle] : [];
    }
}
