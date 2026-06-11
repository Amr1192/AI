<?php

/**
 * Central AI model configuration.
 * Verified against OpenAI /v1/models for this project (Jun 2026).
 * Override via .env without code changes.
 */
return [
    'openai_api_key' => env('OPENAI_API_KEY'),

    // Chat / analysis — gpt-5-mini and gpt-4o-mini available on this key
    'chat_model' => env('OPENAI_CHAT_MODEL', 'gpt-4o-mini'),
    'analysis_model' => env('ANALYSIS_MODEL', 'gpt-5-mini'),

    // Embeddings — keep ada-002 to avoid re-indexing stored vectors (1536-dim)
    'embedding_model' => env('OPENAI_EMBEDDING_MODEL', 'text-embedding-ada-002'),

    // RAG — vector similarity matching (jobs ↔ candidates)
    'rag_model' => env('RAG_CHAT_MODEL', 'gpt-4o-mini'),
    // Minimum hybrid score (0–1) to include a match in results
    'rag_similarity_threshold' => (float) env('RAG_SIMILARITY_THRESHOLD', 0.65),
    // Hybrid weights: final = semantic * semantic_weight + skill_overlap * skill_weight
    'rag_semantic_weight' => (float) env('RAG_SEMANTIC_WEIGHT', 0.3),
    'rag_skill_weight' => (float) env('RAG_SKILL_WEIGHT', 0.7),
    // Require at least this fraction of job tech skills on the candidate profile
    'rag_min_skill_overlap' => (float) env('RAG_MIN_SKILL_OVERLAP', 0.2),
    // When a job has no extractable tech skills, use embedding-only with this floor
    'rag_semantic_only_threshold' => (float) env('RAG_SEMANTIC_ONLY_THRESHOLD', 0.78),
    // Set true to generate GPT explanations (slower; one API call per match)
    'rag_explanations' => env('RAG_EXPLANATIONS', false),

    // Realtime voice interview (node/server.js reads REALTIME_MODEL from its own .env)
    'realtime_model' => env('REALTIME_MODEL', 'gpt-realtime-mini'),
    'transcription_model' => env('OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-mini-transcribe'),
    'realtime_voice' => env('REALTIME_VOICE', 'alloy'),

    // Anthropic CV generation fallback chain
    'anthropic_model' => env('ANTHROPIC_MODEL', 'claude-3-5-haiku-20241022'),
];
