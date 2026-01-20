<?php

namespace App\Services;

use GuzzleHttp\Client;
use Illuminate\Support\Facades\Log;

class EmbeddingService
{
    protected $client;
    protected $apiKey;
    protected $model;

    public function __construct()
    {
        $this->client = new Client();
        $this->apiKey = env('OPENAI_API_KEY');
        $this->model = 'text-embedding-ada-002'; // 1536 dimensions
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
     * Find most similar items from a list
     *
     * @param array $queryEmbedding
     * @param array $items Array of items with 'embedding' key
     * @param int $topK Number of top results to return
     * @return array
     */
    public function findSimilar(array $queryEmbedding, array $items, int $topK = 10): array
    {
        $similarities = [];

        foreach ($items as $item) {
            if (!isset($item['embedding']) || !is_array($item['embedding'])) {
                continue;
            }

            $similarity = $this->cosineSimilarity($queryEmbedding, $item['embedding']);
            $item['similarity_score'] = $similarity;
            $similarities[] = $item;
        }

        // Sort by similarity score descending
        usort($similarities, function ($a, $b) {
            return $b['similarity_score'] <=> $a['similarity_score'];
        });

        // Return top K results
        return array_slice($similarities, 0, $topK);
    }
}
