import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import { config } from '../config.js';
import { AgenticInterviewer } from './AgenticInterviewer.js';

export function startRealtimeServer(apiBase: string): Promise<WebSocketServer | null> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: config.wsPort, host: '127.0.0.1' });

    wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Port ${config.wsPort} already in use — voice interviews unavailable. Stop the other process or change WS_PORT.`);
      } else {
        console.error('WebSocket server error:', err);
      }
      resolve(null);
    });

    wss.on('listening', () => {
      console.log(`🎙️  Realtime interview WebSocket on ws://127.0.0.1:${config.wsPort}`);
      console.log(`🔗 API base: ${apiBase}`);
      resolve(wss);
    });

    wss.on('connection', (clientWs) => {
    let interviewer: AgenticInterviewer | null = null;
    let realtimeWs: WebSocket | null = null;
    let isAISpeaking = false;
    let interviewId: string | number | null = null;
    let pendingUserTranscript = '';

    const clearInputBuffer = () => {
      if (realtimeWs?.readyState === WebSocket.OPEN) {
        realtimeWs.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      }
    };

    clientWs.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'init') {
          interviewId = data.interviewId;
          const userSkills = data.userSkills || [];
          const constraints = data.constraints || {};

          interviewer = new AgenticInterviewer(userSkills, interviewId!, constraints);

          realtimeWs = new WebSocket(
            `wss://api.openai.com/v1/realtime?model=${config.realtimeModel}`,
            { headers: { Authorization: `Bearer ${config.openaiApiKey}` } },
          );

          realtimeWs.on('open', () => {
            realtimeWs!.send(
              JSON.stringify({
                type: 'session.update',
                session: {
                  type: 'realtime',
                  model: config.realtimeModel,
                  instructions: interviewer!.getSystemInstructions(),
                  output_modalities: ['audio'],
                  audio: {
                    input: {
                      format: { type: 'audio/pcm', rate: 24000 },
                      transcription: { model: config.transcriptionModel },
                      turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 800,
                        create_response: true,
                      },
                    },
                    output: {
                      format: { type: 'audio/pcm', rate: 24000 },
                      voice: config.realtimeVoice,
                    },
                  },
                  tools: interviewer!.getFunctionDefinitions(),
                  tool_choice: 'auto',
                  max_output_tokens: 500,
                },
              }),
            );

            const allowed = constraints.allowedSkills || userSkills.map((s: { title: string }) => s.title);
            const kickoff =
              allowed.length === 1
                ? `Greet the candidate. They selected "${allowed[0]}" only — call select_skill and ask your first question.`
                : `Greet and ask which skill to practice from: ${allowed.join(', ')}`;

            setTimeout(() => {
              realtimeWs!.send(
                JSON.stringify({
                  type: 'conversation.item.create',
                  item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: kickoff }] },
                }),
              );
              realtimeWs!.send(JSON.stringify({ type: 'response.create' }));
            }, 1000);
          });

          realtimeWs.on('message', async (openaiMessage) => {
            const event = JSON.parse(openaiMessage.toString());
            const type = event.type;

            if (type === 'response.output_audio.delta') {
              if (!isAISpeaking) {
                isAISpeaking = true;
                clearInputBuffer();
              }
              if (event.delta) {
                clientWs.send(JSON.stringify({ type: 'audio', delta: event.delta }));
              }
            }

            if (type === 'response.output_audio.done') {
              isAISpeaking = false;
              clearInputBuffer();
              clientWs.send(JSON.stringify({ type: 'ai_finished_speaking' }));
            }

            if (type === 'response.done') isAISpeaking = false;

            if (type === 'conversation.item.input_audio_transcription.delta' && event.delta) {
              pendingUserTranscript += event.delta;
            }

            if (type === 'conversation.item.input_audio_transcription.completed') {
              const transcript = (event.transcript || pendingUserTranscript).trim();
              pendingUserTranscript = '';
              if (transcript) {
                interviewer!.logTurn('candidate', transcript);
                clientWs.send(JSON.stringify({ type: 'transcript', speaker: 'user', text: transcript }));
                clientWs.send(JSON.stringify({ type: 'stats_update', stats: interviewer!.getStats() }));
              }
            }

            if (type === 'response.output_audio_transcript.delta') {
              clientWs.send(JSON.stringify({ type: 'transcript_delta', speaker: 'ai', delta: event.delta }));
            }

            if (type === 'response.output_audio_transcript.done' && event.transcript?.trim()) {
              interviewer!.logTurn('interviewer', event.transcript);
              clientWs.send(JSON.stringify({ type: 'transcript', speaker: 'ai', text: event.transcript }));
            }

            if (type === 'response.function_call_arguments.done') {
              const result = await interviewer!.handleFunctionCall(event.name, JSON.parse(event.arguments || '{}'));
              realtimeWs!.send(
                JSON.stringify({
                  type: 'conversation.item.create',
                  item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify(result) },
                }),
              );
              realtimeWs!.send(JSON.stringify({ type: 'response.create' }));
              clientWs.send(JSON.stringify({ type: 'agent_action', action: event.name, args: JSON.parse(event.arguments || '{}'), result }));

              if (event.name === 'conclude_interview' && interviewId) {
                setTimeout(async () => {
                  try {
                    await axios.post(`${apiBase}/api/interviews/${interviewId}/save-conversation`, {
                      sessionId: data.sessionId,
                      conversation: interviewer!.conversationHistory,
                      stats: interviewer!.getStats(),
                    });
                    clientWs.send(JSON.stringify({ type: 'interview_complete', stats: interviewer!.getStats() }));
                  } catch (err) {
                    console.error('Failed to save conversation', err);
                  }
                }, 2000);
              }
            }

            if (type === 'error') {
              clientWs.send(JSON.stringify({ type: 'error', message: event.error?.message || 'OpenAI error' }));
            }
          });
        }

        if (data.type === 'audio' && realtimeWs?.readyState === WebSocket.OPEN && !isAISpeaking) {
          realtimeWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data.audio }));
        }

        if (data.type === 'commit_audio' && realtimeWs) {
          realtimeWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        }

        if (data.type === 'interrupt' && realtimeWs) {
          realtimeWs.send(JSON.stringify({ type: 'response.cancel' }));
          isAISpeaking = false;
        }
      } catch (err) {
        console.error('WS message error', err);
      }
    });

    clientWs.on('close', () => realtimeWs?.close());
    });
  });
}
