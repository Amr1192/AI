#!/usr/bin/env node
import 'dotenv/config';
import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import { AgenticInterviewer } from './AgenticInterviewer.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LARAVEL_API_BASE = process.env.LARAVEL_API_BASE || 'http://127.0.0.1:8000';
const REALTIME_MODEL = process.env.REALTIME_MODEL || 'gpt-realtime-mini';
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
const REALTIME_VOICE = process.env.REALTIME_VOICE || 'alloy';
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

function clearInputAudioBuffer(realtimeWs) {
  if (realtimeWs?.readyState === WebSocket.OPEN) {
    realtimeWs.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
  }
}

wss.on('connection', async (clientWs, req) => {
  console.log('🟢 Client connected');

  let sessionId = null;
  let interviewer = null;
  let realtimeWs = null;
  let isAISpeaking = false;

  clientWs.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'init') {
        sessionId = data.sessionId;
        const interviewId = data.interviewId;
        const userSkills = data.userSkills;
        const constraints = data.constraints || {};

        console.log(`🎬 Initializing session ${sessionId} for interview ${interviewId}`);
        console.log(`🎯 Allowed skills:`, constraints.allowedSkills || userSkills.map((s) => s.title));

        interviewer = new AgenticInterviewer(userSkills, interviewId, constraints);

        realtimeWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          }
        });

        realtimeWs.on('open', () => {
          console.log('✅ Connected to OpenAI Realtime API');

          realtimeWs.send(JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              model: REALTIME_MODEL,
              instructions: interviewer.getSystemInstructions(),
              output_modalities: ['audio'],
              audio: {
                input: {
                  format: { type: 'audio/pcm', rate: 24000 },
                  transcription: { model: TRANSCRIPTION_MODEL },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 800,
                    create_response: true
                  }
                },
                output: {
                  format: { type: 'audio/pcm', rate: 24000 },
                  voice: REALTIME_VOICE
                }
              },
              tools: interviewer.getFunctionDefinitions(),
              tool_choice: 'auto',
              max_output_tokens: 500
            }
          }));

          // Natural greeting that prompts skill selection
          setTimeout(() => {
            const allowedSkills = constraints.allowedSkills || userSkills.map((s) => s.title);
            const kickoffText = allowedSkills.length === 1
              ? `Start the interview by greeting the candidate. They selected only "${allowedSkills[0]}" — do not ask which skill to practice. Call select_skill for "${allowedSkills[0]}" and then ask your first question about it.`
              : `Start the interview by greeting the candidate and asking which skill they want to practice from ONLY these options: ${allowedSkills.join(', ')}. Be creative and friendly.`;

            realtimeWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{
                  type: 'input_text',
                  text: kickoffText
                }]
              }
            }));

            realtimeWs.send(JSON.stringify({ type: 'response.create' }));
          }, 1000);
        });

        realtimeWs.on('message', async (openaiMessage) => {
          try {
            const event = JSON.parse(openaiMessage.toString());

            // Track when AI starts/stops speaking — discard mic input while AI talks (prevents echo loop)
            if (event.type === 'response.output_audio.delta') {
              if (!isAISpeaking) {
                isAISpeaking = true;
                clearInputAudioBuffer(realtimeWs);
                console.log('🔇 AI started speaking — input buffer cleared');
              }

              if (event.delta && event.delta.length > 0) {
                clientWs.send(JSON.stringify({
                  type: 'audio',
                  delta: event.delta
                }));
              }
            }

            if (event.type === 'response.output_audio.done') {
              isAISpeaking = false;
              clearInputAudioBuffer(realtimeWs);
              console.log('🤐 AI finished speaking — input buffer cleared');

              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'ai_finished_speaking' }));
              }
            }

            if (event.type === 'response.done') {
              isAISpeaking = false;
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

                clientWs.send(JSON.stringify({
                  type: 'stats_update',
                  stats: interviewer.getStats()
                }));
              }
            }

            // Handle AI transcript
            if (event.type === 'response.output_audio_transcript.delta') {
              clientWs.send(JSON.stringify({
                type: 'transcript_delta',
                speaker: 'ai',
                delta: event.delta
              }));
            }

            if (event.type === 'response.output_audio_transcript.done') {
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
              realtimeWs.send(JSON.stringify({ type: 'response.create' }));

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
            if (event.type === 'conversation.item.added' || event.type === 'conversation.item.created') {
              console.log('📝 Conversation item created:', event.item?.type);
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

      // Forward user mic audio only while AI is silent (never buffer/replay — that caused echo loops)
      if (data.type === 'audio' && realtimeWs && realtimeWs.readyState === WebSocket.OPEN && !isAISpeaking) {
        realtimeWs.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: data.audio
        }));
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