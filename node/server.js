#!/usr/bin/env node
import 'dotenv/config';
import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import { AgenticInterviewer } from './AgenticInterviewer.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LARAVEL_API_BASE = process.env.LARAVEL_API_BASE || 'http://127.0.0.1:8000';
const REALTIME_MODEL = process.env.REALTIME_MODEL || 'gpt-realtime-mini';
const PORT = process.env.PORT || 8081;

if (!OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY');
  process.exit(1);
}

const wss = new WebSocketServer({ port: PORT });
console.log(`🎙️  Agentic Interview Server Started`);
console.log(`📡 WebSocket: ws://127.0.0.1:${PORT}`);
console.log(`🔗 Laravel API: ${LARAVEL_API_BASE}\n`);

const activeSessions = new Map();

wss.on('connection', async (clientWs, req) => {
  console.log('🟢 Client connected');

  let sessionId = null;
  let interviewer = null;
  let realtimeWs = null;
  let isAISpeaking = false;
  let pendingAudioChunks = [];

  clientWs.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'init') {
        sessionId = data.sessionId;
        const interviewId = data.interviewId;
        const userSkills = data.userSkills;

        console.log(`🎬 Initializing session ${sessionId} for interview ${interviewId}`);

        interviewer = new AgenticInterviewer(userSkills, interviewId);

        realtimeWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });

        realtimeWs.on('open', () => {
          console.log('✅ Connected to OpenAI Realtime API');

          realtimeWs.send(JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              instructions: interviewer.getSystemInstructions(),
              voice: 'alloy',
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
              input_audio_transcription: { model: 'whisper-1' },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 800,
                create_response: true
              },
              tools: interviewer.getFunctionDefinitions(),
              tool_choice: 'auto',
              temperature: 0.9, // ✅ INCREASED: More variety in questions (was 0.7)
              max_response_output_tokens: 500
            }
          }));

          // Natural greeting that prompts skill selection
          setTimeout(() => {
            realtimeWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{
                  type: 'input_text',
                  text: 'Start the interview by greeting the candidate and asking which skill they want to practice. Be creative and friendly.'
                }]
              }
            }));

            realtimeWs.send(JSON.stringify({ type: 'response.create' }));
          }, 1000);
        });

        realtimeWs.on('message', async (openaiMessage) => {
          try {
            const event = JSON.parse(openaiMessage.toString());

            // Track when AI starts/stops speaking
            if (event.type === 'response.audio.delta') {
              isAISpeaking = true;
              
              // ✅ Validate delta exists
              if (event.delta && event.delta.length > 0) {
                clientWs.send(JSON.stringify({
                  type: 'audio',
                  delta: event.delta
                }));
              }
            }

            if (event.type === 'response.audio.done' || event.type === 'response.done') {
              isAISpeaking = false;
              console.log('🤐 AI finished speaking');
              
              // Notify client AI is done speaking
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'ai_finished_speaking'
                }));
              }
            }

            // Handle input audio transcription (user speaking)
            if (event.type === 'conversation.item.input_audio_transcription.completed') {
              const transcript = event.transcript;
              
              if (transcript && transcript.trim().length > 0) {
                console.log('👤 User said:', transcript);
                
                interviewer.logTurn('candidate', transcript);

                clientWs.send(JSON.stringify({
                  type: 'transcript',
                  speaker: 'user',
                  text: transcript
                }));
              }
            }

            // Handle AI transcript
            if (event.type === 'response.audio_transcript.delta') {
              clientWs.send(JSON.stringify({
                type: 'transcript_delta',
                speaker: 'ai',
                delta: event.delta
              }));
            }

            if (event.type === 'response.audio_transcript.done') {
              const transcript = event.transcript;
              
              if (transcript && transcript.trim().length > 0) {
                console.log('🤖 AI said:', transcript);
                
                interviewer.logTurn('interviewer', transcript);

                clientWs.send(JSON.stringify({
                  type: 'transcript',
                  speaker: 'ai',
                  text: transcript
                }));
              }
            }

            // Handle function calls
            if (event.type === 'response.function_call_arguments.done') {
              const functionName = event.name;
              const args = JSON.parse(event.arguments);

              console.log(`🔧 Function called: ${functionName}`, args);

              const result = await interviewer.handleFunctionCall(functionName, args);

              // Send function result back
              realtimeWs.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: event.call_id,
                  output: JSON.stringify(result)
                }
              }));

              // Create response after function call
              realtimeWs.send(JSON.stringify({
                type: 'response.create'
              }));

              clientWs.send(JSON.stringify({
                type: 'agent_action',
                action: functionName,
                args,
                result
              }));

              // Check if interview concluded
              if (functionName === 'conclude_interview') {
                setTimeout(async () => {
                  try {
                    await axios.post(`${LARAVEL_API_BASE}/api/interviews/${interviewId}/save-conversation`, {
                      sessionId,
                      conversation: interviewer.conversationHistory,
                      stats: interviewer.getStats()
                    });

                    clientWs.send(JSON.stringify({
                      type: 'interview_complete',
                      stats: interviewer.getStats()
                    }));
                  } catch (err) {
                    console.error('❌ Failed to save conversation:', err.message);
                  }
                }, 2000);
              }
            }

            // Handle errors
            if (event.type === 'error') {
              console.error('❌ OpenAI error:', event.error);
              clientWs.send(JSON.stringify({
                type: 'error',
                message: event.error.message
              }));
            }

            // Log conversation updates
            if (event.type === 'conversation.item.created') {
              console.log('📝 Conversation item created:', event.item.type);
            }

          } catch (err) {
            console.error('Error handling OpenAI message:', err);
          }
        });

        realtimeWs.on('error', (err) => {
          console.error('❌ OpenAI WebSocket error:', err);
          clientWs.send(JSON.stringify({
            type: 'error',
            message: 'Connection to AI failed'
          }));
        });

        realtimeWs.on('close', () => {
          console.log('🔴 OpenAI connection closed');
        });

        activeSessions.set(sessionId, { interviewer, realtimeWs, clientWs });
      }

      // Forward audio to OpenAI
      if (data.type === 'audio' && realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
        if (isAISpeaking) {
          // Buffer audio while AI is speaking
          pendingAudioChunks.push(data.audio);
          
          if (pendingAudioChunks.length > 20) {
            pendingAudioChunks.shift();
          }
        } else {
          // Send buffered audio first, then current
          if (pendingAudioChunks.length > 0) {
            console.log(`📤 Sending ${pendingAudioChunks.length} buffered audio chunks`);
            for (const chunk of pendingAudioChunks) {
              realtimeWs.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: chunk
              }));
            }
            pendingAudioChunks = [];
          }

          realtimeWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: data.audio
          }));
        }
      }

      // Manual commit audio buffer
      if (data.type === 'commit_audio') {
        console.log('✅ Committing audio buffer');
        realtimeWs.send(JSON.stringify({
          type: 'input_audio_buffer.commit'
        }));
      }

      // Cancel AI response (for interruption)
      if (data.type === 'interrupt') {
        console.log('✋ User interrupted AI');
        realtimeWs.send(JSON.stringify({
          type: 'response.cancel'
        }));
        isAISpeaking = false;
      }

    } catch (err) {
      console.error('Error processing client message:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('🔴 Client disconnected');
    if (sessionId && activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      if (session.realtimeWs) {
        session.realtimeWs.close();
      }
      activeSessions.delete(sessionId);
    }
  });

  clientWs.on('error', (err) => {
    console.error('Client WebSocket error:', err);
  });
});

console.log('✅ Server ready for connections\n');