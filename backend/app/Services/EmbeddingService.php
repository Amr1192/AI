<?php

namespace App\Services;

use App\Support\HttpClientOptions;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\Log;

class EmbeddingService
{
    protected $client;
    protected $apiKey;
    protected $model;

    public function __construct()
    {
        $this->client = new Client(HttpClientOptions::guzzle());
        $this->apiKey = env('OPENAI_API_KEY');
        $this->model = config('ai.embedding_model', 'text-embedding-ada-002');
    }

    /**
     * Generate embedding for a given text
     *
     * @param string $text
     * @return array|null
     */
    public function generateEmbedding(string $text): ?array
    {
        try {
            $response = $this->client->post('https://api.openai.com/v1/embeddings', [
                'headers' => [
                    'Authorization' => 'Bearer ' . $this->apiKey,
                    'Content-Type' => 'application/json',
                ],
                'json' => [
                    'input' => $text,
                    'model' => $this->model,
                ],
            ]);

            $result = json_decode($response->getBody()->getContents(), true);
            return $result['data'][0]['embedding'];
        } catch (\Exception $e) {
            Log::error('Error generating embedding: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Calculate cosine similarity between two vectors
     *
     * @param array $vectorA
     * @param array $vectorB
     * @return float
     */
    public function cosineSimilarity(array $vectorA, array $vectorB): float
    {
        if (count($vectorA) !== count($vectorB)) {
            throw new \InvalidArgumentException('Vectors must have the same dimensions');
        }

        $dotProduct = 0.0;
        $magnitudeA = 0.0;
        $magnitudeB = 0.0;

        for ($i = 0; $i < count($vectorA); $i++) {
            $dotProduct += $vectorA[$i] * $vectorB[$i];
            $magnitudeA += $vectorA[$i] * $vectorA[$i];
            $magnitudeB += $vectorB[$i] * $vectorB[$i];
        }

        $magnitudeA = sqrt($magnitudeA);
        $magnitudeB = sqrt($magnitudeB);

        if ($magnitudeA == 0 || $magnitudeB == 0) {
            return 0.0;
        }

        return $dotProduct / ($magnitudeA * $magnitudeB);
    }

    /**
     * Normalize stored embedding (JSON string or array from Eloquent cast).
     */
    public function normalizeEmbedding(mixed $embedding): ?array
    {
        if (is_array($embedding)) {
            return $embedding;
        }

        if (is_string($embedding) && $embedding !== '') {
            $decoded = json_decode($embedding, true);
            return is_array($decoded) ? $decoded : null;
        }

        return null;
    }

    /**
     * Find most similar items from a list
     *
     * @param array $queryEmbedding
     * @param array $items Array of items with 'embedding' key
     * @param int $topK Number of top results to return
     * @param float|null $minSimilarity Optional minimum cosine similarity
     * @return array
     */
    public function findSimilar(
        array $queryEmbedding,
        array $items,
        int $topK = 10,
        ?float $minSimilarity = null
    ): array {
        $similarities = [];

        foreach ($items as $item) {
            $vector = $this->normalizeEmbedding($item['embedding'] ?? null);
            if ($vector === null) {
                continue;
            }

            $similarity = $this->cosineSimilarity($queryEmbedding, $vector);
            if ($minSimilarity !== null && $similarity < $minSimilarity) {
                continue;
            }

            $item['embedding'] = $vector;
            $item['similarity_score'] = $similarity;
            $similarities[] = $item;
        }

        usort($similarities, fn ($a, $b) => $b['similarity_score'] <=> $a['similarity_score']);

        return array_slice($similarities, 0, $topK);
    }
}
