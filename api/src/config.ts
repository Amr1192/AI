import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 8000),
  wsPort: Number(process.env.WS_PORT || 8081),
  storagePath: process.env.STORAGE_PATH || './storage',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  analysisModel: process.env.ANALYSIS_MODEL || 'gpt-4o-mini',
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
  ragModel: process.env.RAG_CHAT_MODEL || 'gpt-4o-mini',
  ragSimilarityThreshold: Number(process.env.RAG_SIMILARITY_THRESHOLD || 0.65),
  ragSemanticWeight: Number(process.env.RAG_SEMANTIC_WEIGHT || 0.3),
  ragSkillWeight: Number(process.env.RAG_SKILL_WEIGHT || 0.7),
  ragMinSkillOverlap: Number(process.env.RAG_MIN_SKILL_OVERLAP || 0.2),
  ragSemanticOnlyThreshold: Number(process.env.RAG_SEMANTIC_ONLY_THRESHOLD || 0.78),
  ragExplanations: process.env.RAG_EXPLANATIONS === 'true',
  realtimeModel: process.env.REALTIME_MODEL || 'gpt-realtime-mini',
  transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  realtimeVoice: process.env.REALTIME_VOICE || 'alloy',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
};
