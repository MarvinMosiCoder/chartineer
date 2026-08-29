<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Gzips JSON API responses. The market endpoints return large normalized
 * payloads — a 5000-candle /api/klines response is ~483KB of raw JSON and a
 * 20000-candle Replay load is ~1.94MB — and nothing in the stack compressed
 * them, so every symbol/timeframe switch paid full transfer cost even though
 * the client already advertised gzip support.
 *
 * Level 1, not the default 6: measured on a real 5000-candle payload, level 1
 * costs 7.5ms for a 70% reduction (483KB -> 143KB) while level 6 costs 28ms for
 * 75% (119KB) and level 9 costs 69ms for ~1KB beyond level 6. The extra 24KB is
 * not worth 4x the CPU on an endpoint this hot.
 *
 * Responses that already carry Content-Encoding pass through untouched, which
 * is what lets MarketDataController::klines() serve its pre-compressed cache
 * entries directly without being compressed a second time.
 */
class CompressResponse
{
    /**
     * Below this, gzip's framing overhead and CPU cost outweigh the savings.
     */
    private const MINIMUM_BYTES = 1024;

    private const COMPRESSION_LEVEL = 1;

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (!$this->shouldCompress($request, $response)) {
            return $response;
        }

        $content = $response->getContent();

        if ($content === false || strlen($content) < self::MINIMUM_BYTES) {
            // Still advertise that the representation varies, so a shared cache
            // never serves this uncompressed body to a client that asked for gzip.
            $response->headers->set('Vary', 'Accept-Encoding');

            return $response;
        }

        $compressed = gzencode($content, self::COMPRESSION_LEVEL);

        if ($compressed === false || strlen($compressed) >= strlen($content)) {
            return $response;
        }

        $response->setContent($compressed);
        $response->headers->set('Content-Encoding', 'gzip');
        $response->headers->set('Vary', 'Accept-Encoding');
        $response->headers->set('Content-Length', (string) strlen($compressed));

        return $response;
    }

    private function shouldCompress(Request $request, Response $response): bool
    {
        if (!function_exists('gzencode')) {
            return false;
        }

        // Streamed and file responses have no in-memory body to compress, and
        // buffering one here would defeat the point of streaming it.
        if ($response instanceof StreamedResponse || $response instanceof BinaryFileResponse) {
            return false;
        }

        // Already encoded — either by an upstream layer or by a controller
        // serving a pre-compressed cache entry. Compressing again corrupts it.
        if ($response->headers->has('Content-Encoding')) {
            return false;
        }

        if (!str_contains(strtolower($request->headers->get('Accept-Encoding', '')), 'gzip')) {
            return false;
        }

        if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
            return false;
        }

        return str_contains(strtolower($response->headers->get('Content-Type', '')), 'json');
    }
}
