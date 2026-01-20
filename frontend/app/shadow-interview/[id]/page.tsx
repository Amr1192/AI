"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff,
  PhoneOff,
  Activity,
  Brain,
  MessageSquare,
  Sparkles,
  Loader2,
  Volume2,
  VolumeX,
  Signal,
  AlertCircle,
  CheckCircle,
  Timer,
  Play,
  Square,
  X
} from "lucide-react";
import Header from "@/components/header";
import { Progress } from "@/components/ui/progress";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8081";

interface Message {
  speaker: 'ai' | 'user';
  text: string;
  timestamp: Date;
}

interface AgentAction {
  action: string;
  args: any;
  result: any;
  timestamp: Date;
}

interface InterviewStats {
  questionsAsked: number;
  maxQuestions: number;
  topicsCovered: string[];
  conversationTurns: number;
}

export default function AgenticInterviewPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = params?.id as string;
  const [isCapturingAudio, setIsCapturingAudio] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Track if we're currently ending the interview
  const [isEnding, setIsEnding] = useState(false);

  // WebSocket & Media References
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  // Track if user is manually scrolling
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Audio Queue System for smooth playback
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  // Audio Worklet References (for capture only)
  const audioCaptureNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Video Analysis System
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoFramesRef = useRef<string[]>([]);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // State - Connection & Media
  const [isConnected, setIsConnected] = useState(false);
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  // State - Interview Data
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [interviewStats, setInterviewStats] = useState<InterviewStats>({
    questionsAsked: 0,
    maxQuestions: 8,
    topicsCovered: [],
    conversationTurns: 0
  });

  // State - User & Skills
  const [userSkills, setUserSkills] = useState<any[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);
  const [userId, setUserId] = useState<number | null>(null);

  // State - UI
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'poor' | 'disconnected'>('disconnected');
  const [interviewStartTime, setInterviewStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);

  // Detect user scrolling
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setIsUserScrolling(true);
      
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 2000);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll only if user isn't manually scrolling
  useEffect(() => {
    if (!isUserScrolling && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUserScrolling]);

  // Timer
  useEffect(() => {
    if (!interviewStartTime || isComplete) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - interviewStartTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [interviewStartTime, isComplete]);

  // Load interview data
  useEffect(() => {
    if (!interviewId) {
      setError("No interview ID provided");
      setIsLoading(false);
      return;
    }

    const loadInterview = async () => {
      try {
        console.log('📡 Loading interview:', interviewId);
        
        const res = await fetch(`${API_BASE}/api/interviews/${interviewId}`);
        
        if (!res.ok) {
          throw new Error(`Failed to load interview: ${res.status}`);
        }

        const data = await res.json();
        console.log('✅ Interview data:', data);
        
        if (!data.user_id) {
          throw new Error('Interview data missing user_id');
        }

        setUserId(data.user_id);

        // Get selected skill IDs from interview with proper typing
        let skillIds: number[] = [];
        
        if (data.selected_skill_ids) {
          if (Array.isArray(data.selected_skill_ids)) {
            skillIds = data.selected_skill_ids.map((id: any) => Number(id));
          } else if (typeof data.selected_skill_ids === 'string') {
            try {
              const parsed = JSON.parse(data.selected_skill_ids);
              skillIds = Array.isArray(parsed) ? parsed.map((id: any) => Number(id)) : [];
            } catch (e) {
              console.error('Failed to parse selected_skill_ids:', e);
              skillIds = [];
            }
          }
          
          setSelectedSkillIds(skillIds);
          console.log('✅ Selected skill IDs:', skillIds);
        }

        // Get user skills
        const skillsRes = await fetch(`${API_BASE}/api/users/${data.user_id}/skills`);
        
        if (!skillsRes.ok) {
          throw new Error(`Failed to load skills: ${skillsRes.status}`);
        }
        
        const skillsData = await skillsRes.json();
        console.log('✅ All skills loaded:', skillsData.skills?.length || 0);
        
        // Filter to only selected skills
        const allSkills = skillsData.skills || [];
        const selectedSkills = skillIds.length > 0 
          ? allSkills.filter((skill: any) => skillIds.includes(Number(skill.id)))
          : allSkills;
        
        console.log('✅ Filtered to selected skills:', selectedSkills.length);
        setUserSkills(selectedSkills);
        setIsLoading(false);
        
      } catch (e: any) {
        console.error('❌ Load error:', e);
        setError(e.message);
        setIsLoading(false);
      }
    };

    loadInterview();
  }, [interviewId]);

  // Initialize media devices
  const initializeMedia = useCallback(async () => {
    try {
      console.log('🎥 Initializing media devices...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        }
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            console.log('✅ Video feed started successfully');
          }).catch((err) => {
            console.error('❌ Video play error:', err);
          });
        };
      }

      return stream;
    } catch (err: any) {
      console.error('❌ Media access error:', err);
      throw new Error(`Camera/Mic access denied: ${err.message}`);
    }
  }, []);

  // Initialize audio worklets
  const initializeAudioWorklets = useCallback(async (stream: MediaStream) => {
    try {
      console.log('🎵 Initializing audio system...');

      const audioContext = new AudioContext({ 
        sampleRate: 24000,
        latencyHint: 'interactive'
      });
      audioContextRef.current = audioContext;

      nextPlayTimeRef.current = audioContext.currentTime;

      await audioContext.audioWorklet.addModule('/audio-capture-processor.js');

      const captureNode = new AudioWorkletNode(audioContext, 'audio-capture-processor');
      const micSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      micSource.connect(analyser);
      analyser.connect(captureNode);

      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average);
        setIsCapturingAudio(average > 5);
        
        if (isInterviewActive) {
          requestAnimationFrame(checkLevel);
        }
      };
      checkLevel();
      
      audioCaptureNodeRef.current = captureNode;
      micSourceRef.current = micSource;

      console.log('✅ Audio system initialized');
      return { captureNode };

    } catch (err: any) {
      console.error('❌ Audio initialization error:', err);
      throw new Error(`Audio initialization failed: ${err.message}`);
    }
  }, [isInterviewActive]);

  // Capture video frames
  const captureVideoFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isCameraOn) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.8);
  }, [isCameraOn]);

  // Start capturing frames
  useEffect(() => {
    if (isInterviewActive && isCameraOn) {
      console.log('📸 Starting video frame capture...');
      
      captureIntervalRef.current = setInterval(() => {
        const frame = captureVideoFrame();
        if (frame) {
          videoFramesRef.current.push(frame);
          console.log(`📸 Captured frame ${videoFramesRef.current.length}`);
          
          if (videoFramesRef.current.length > 20) {
            videoFramesRef.current.shift();
          }
        }
      }, 3000);
    }

    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, [isInterviewActive, isCameraOn, captureVideoFrame]);

  // Play AI audio chunk
  const playAudioChunk = useCallback((base64Audio: string) => {
    if (!audioContextRef.current || !isSpeakerOn) return;

    try {
      const audioContext = audioContextRef.current;

      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const float32Array = new Float32Array(int16Array.length);
      
      for (let i = 0; i < int16Array.length; i++) {
        const sample = int16Array[i];
        float32Array[i] = sample / (sample < 0 ? 32768 : 32767);
      }

      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const currentTime = audioContext.currentTime;
      const startTime = Math.max(currentTime, nextPlayTimeRef.current);
      
      source.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;
      audioQueueRef.current.push(source);
      
      source.onended = () => {
        const index = audioQueueRef.current.indexOf(source);
        if (index > -1) {
          audioQueueRef.current.splice(index, 1);
        }
        
        if (audioQueueRef.current.length === 0) {
          isPlayingRef.current = false;
          setAiSpeaking(false);
        }
      };

      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        setAiSpeaking(true);
      }

    } catch (err) {
      console.error('❌ Error playing audio:', err);
    }
  }, [isSpeakerOn]);

  // Connect to WebSocket with skill constraints
  const connectWebSocket = useCallback(async (captureNode: AudioWorkletNode) => {
    return new Promise<WebSocket>((resolve, reject) => {
      console.log('🔌 Connecting to interview server...');

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        console.log('✅ Connected to interview server');
        setIsConnected(true);
        setConnectionQuality('good');

        const selectedSkillTitles = userSkills.map(s => s.title);
        
        ws.send(JSON.stringify({
          type: 'init',
          sessionId: `session-${Date.now()}`,
          interviewId: interviewId,
          userSkills: userSkills,
          selectedSkillIds: selectedSkillIds,
          constraints: {
            allowedSkills: selectedSkillTitles,
            strictMode: true,
            message: `IMPORTANT: You MUST ONLY ask questions about these specific skills: ${selectedSkillTitles.join(', ')}. Do NOT ask about any other skills or topics outside of this list. Stay strictly within these selected skills.`
          }
        }));

        console.log('📤 Sent skill constraints:', selectedSkillTitles);

        resolve(ws);
      };

      ws.onmessage = (event) => {
        handleWebSocketMessage(event.data);
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('❌ WebSocket error:', error);
        setConnectionQuality('poor');
        reject(error);
      };

      ws.onclose = () => {
        console.log('🔴 Disconnected from interview server');
        setIsConnected(false);
        setConnectionQuality('disconnected');
      };

      captureNode.port.onmessage = (event) => {
        if (event.data.type === 'audio' && ws.readyState === WebSocket.OPEN && isMicOn) {
          const audioData = event.data.data;
          const base64Audio = arrayBufferToBase64(audioData);
          ws.send(JSON.stringify({
            type: 'audio',
            audio: base64Audio
          }));
        }
      };
    });
  }, [interviewId, userSkills, selectedSkillIds, isMicOn]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data: string) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'audio':
          if (message.delta && message.delta.length > 0) {
            playAudioChunk(message.delta);
          }
          break;

        case 'response.audio.done':
        case 'ai_finished_speaking':
          console.log('🔚 AI finished speaking');
          break;

        case 'transcript':
          addMessage(
            message.speaker === 'ai' ? 'ai' : 'user',
            message.text
          );
          break;

        case 'agent_action':
          handleAgentAction(message);
          break;

        case 'interview_complete':
          handleInterviewComplete(message.stats);
          break;

        case 'error':
          console.error('❌ Server error:', message.message);
          setError(message.message);
          break;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  }, [playAudioChunk]);

  // Add message to conversation
  const addMessage = useCallback((speaker: 'ai' | 'user', text: string) => {
    setMessages(prev => [...prev, {
      speaker,
      text,
      timestamp: new Date()
    }]);
  }, []);

  // Handle agent action
  const handleAgentAction = useCallback((message: any) => {
    const action: AgentAction = {
      action: message.action,
      args: message.args,
      result: message.result,
      timestamp: new Date()
    };

    setAgentActions(prev => [...prev, action]);
    setCurrentAction(message.action);

    if (message.result.count !== undefined) {
      setInterviewStats(prev => ({
        ...prev,
        questionsAsked: message.result.count
      }));
    }

    if (message.result.topics_covered) {
      setInterviewStats(prev => ({
        ...prev,
        topicsCovered: message.result.topics_covered
      }));
    }

    setTimeout(() => setCurrentAction(null), 3000);
  }, []);

  // Handle interview completion
  const handleInterviewComplete = useCallback((stats: InterviewStats) => {
    setIsComplete(true);
    setInterviewStats(stats);
    setIsInterviewActive(false);
  }, []);

  // Start interview
  const startInterview = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const stream = await initializeMedia();
      const { captureNode } = await initializeAudioWorklets(stream);
      await connectWebSocket(captureNode);

      setIsInterviewActive(true);
      setInterviewStartTime(new Date());
      setIsLoading(false);

      console.log('🎬 Interview started successfully');

    } catch (err: any) {
      console.error('❌ Start interview error:', err);
      setError(err.message);
      setIsLoading(false);
    }
  };

  // Save conversation history
  const saveConversationHistory = useCallback(async () => {
    try {
      console.log('💾 Saving conversation history...');
      
      const conversationHistory = messages.map(msg => ({
        timestamp: msg.timestamp.toISOString(),
        speaker: msg.speaker === 'user' ? 'candidate' : 'interviewer',
        message: msg.text,
        metadata: {}
      }));

      const response = await fetch(`${API_BASE}/api/interviews/${interviewId}/save-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: `session-${Date.now()}`,
          conversation: conversationHistory,
          stats: interviewStats
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save conversation: ${response.status}`);
      }

      console.log('✅ Conversation history saved');
      return true;
    } catch (err) {
      console.error('❌ Failed to save conversation:', err);
      return false;
    }
  }, [interviewId, messages, interviewStats]);

  // End interview
  const endInterview = useCallback(async () => {
    if (isEnding) {
      console.log('⚠️ Already ending interview, ignoring duplicate call');
      return;
    }

    setIsEnding(true);
    console.log('🛑 Ending interview...');

    // Stop video capture
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
    }

    // Stop all audio playback
    audioQueueRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setAiSpeaking(false);

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Stop media streams
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setIsInterviewActive(false);

    // Save conversation history
    if (messages.length > 0) {
      await saveConversationHistory();
    } else {
      console.log('⚠️ No messages to save');
    }

    // Send video frames if available
    if (videoFramesRef.current.length > 0) {
      try {
        console.log(`📤 Sending ${videoFramesRef.current.length} video frames...`);
        
        await fetch(`${API_BASE}/api/interviews/${interviewId}/save-video-frames`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            frames: videoFramesRef.current,
            frameCount: videoFramesRef.current.length
          })
        });
        
        console.log('✅ Video frames sent');
      } catch (err) {
        console.error('❌ Failed to send video frames:', err);
      }
    }

    // Navigate to report
    const reportUrl = `/interview-report/${interviewId}`;
    console.log('📍 Navigating to:', reportUrl);
    
    router.push(reportUrl);
  }, [isEnding, interviewId, router, messages, saveConversationHistory]);

  // Toggle controls
  const toggleMic = useCallback(() => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
        console.log(`🎤 Mic ${audioTrack.enabled ? 'ON' : 'OFF'}`);
      }
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
        console.log(`📹 Camera ${videoTrack.enabled ? 'ON' : 'OFF'}`);
      }
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn(prev => {
      const newValue = !prev;
      
      if (!newValue) {
        audioQueueRef.current.forEach(source => {
          try {
            source.stop();
          } catch (e) {}
        });
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        setAiSpeaking(false);
        
        if (audioContextRef.current) {
          nextPlayTimeRef.current = audioContextRef.current.currentTime;
        }
      }
      
      console.log(`🔊 Speaker ${newValue ? 'ON' : 'OFF'}`);
      return newValue;
    });
  }, []);

  // Helper functions
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Loading state
  if (isLoading && !isInterviewActive) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Card className="p-8 max-w-md w-full">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-center text-lg">
            {isInterviewActive ? 'Connecting to AI interviewer...' : 'Preparing your interview...'}
          </p>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Card className="p-8 max-w-md w-full">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-center mb-2">Error</h2>
          <p className="text-muted-foreground text-center mb-6">{error}</p>
          <Button
            onClick={() => router.push('/interview-setup')}
            variant="outline"
            className="w-full"
          >
            Back to Setup
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Header />

      <div className="flex flex-1 overflow-hidden pt-16">
        {/* Sidebar */}
        <aside className="w-1/4 min-w-[320px] border-r border-border bg-card p-6 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Interview Status */}
            <div className="mb-6 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm font-semibold">
                  {isInterviewActive ? 'Interview in Progress' : 'Not Started'}
                </span>
              </div>

              {interviewStartTime && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  <span className="text-sm font-mono">{formatTime(elapsedTime)}</span>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Badge variant={connectionQuality === 'good' ? 'default' : 'destructive'} className="flex items-center gap-1">
                  <Signal className="h-3 w-3" />
                  {connectionQuality}
                </Badge>

                {aiSpeaking && (
                  <Badge className="bg-purple-500 flex items-center gap-1 animate-pulse">
                    <Volume2 className="h-3 w-3" />
                    AI Speaking
                  </Badge>
                )}
              </div>
            </div>

            {/* Progress */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 tracking-wider">
                Interview Progress
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Questions Asked</span>
                    <span className="font-semibold">{interviewStats.questionsAsked}/{interviewStats.maxQuestions}</span>
                  </div>
                  <Progress 
                    value={(interviewStats.questionsAsked / interviewStats.maxQuestions) * 100}
                    className="h-2"
                  />
                </div>
              </div>
            </div>

            {/* Topics Covered */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 tracking-wider">
                Topics Covered
              </h3>
              <div className="flex flex-wrap gap-2">
                {interviewStats.topicsCovered.length === 0 ? (
                  <span className="text-muted-foreground text-sm">No topics yet</span>
                ) : (
                  interviewStats.topicsCovered.map((topic, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="bg-purple-500/20 text-purple-700 dark:text-purple-300"
                    >
                      {topic}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            {/* Selected Skills */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 tracking-wider">
                Selected Skills
              </h3>
              <div className="space-y-2">
                {userSkills.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No skills selected</p>
                ) : (
                  userSkills.map((skill, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-sm bg-muted p-3 rounded-lg"
                    >
                      <span className="font-medium">{skill.title}</span>
                      <Badge variant="outline" className="capitalize text-xs">
                        {skill.proficiency_level}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* AI Decision Log */}
            <div>
              <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 tracking-wider flex items-center gap-2">
                <Brain className="h-4 w-4" />
                AI Decision Log
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {agentActions.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    AI decisions will appear here...
                  </p>
                ) : (
                  agentActions.slice().reverse().slice(0, 5).map((action, idx) => (
                    <div
                      key={idx}
                      className="bg-muted border border-border rounded-lg p-2"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                        <span className="text-xs font-semibold uppercase truncate">
                          {action.action.replace(/_/g, ' ')}
                        </span>
                      </div>
                      
                      {action.args.question && (
                        <p className="text-xs text-muted-foreground ml-5 line-clamp-2">
                          "{action.args.question}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 grid grid-cols-3 gap-6 overflow-hidden">
          {/* Video Section */}
          <div className="col-span-2 flex flex-col">
            <div className="bg-gray-900 rounded-xl flex-1 flex flex-col justify-center items-center relative overflow-hidden">
              {/* Progress Bar */}
              <div className="absolute top-0 left-0 w-full h-2 bg-gray-700 z-10">
                <div 
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${(interviewStats.questionsAsked / interviewStats.maxQuestions) * 100}%` }}
                ></div>
              </div>

              {/* Video Feed */}
              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el && mediaStreamRef.current && el.srcObject !== mediaStreamRef.current) {
                    console.log('🎥 Attaching stream to video element');
                    el.srcObject = mediaStreamRef.current;
                    el.play()
                      .then(() => console.log('✅ Video playing'))
                      .catch(err => console.error('❌ Video play error:', err));
                  }
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                onLoadedMetadata={(e) => {
                  console.log('📹 Video metadata loaded');
                  const video = e.currentTarget;
                  video.play().catch(console.error);
                }}
              />
              
              <canvas ref={canvasRef} className="hidden" />
              
              {!isCameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <div className="text-center">
                    <VideoOff className="h-16 w-16 text-white/50 mx-auto mb-2" />
                    <p className="text-white/50">Camera Off</p>
                  </div>
                </div>
              )}

              {currentAction && (
                <div className="absolute top-6 left-6 bg-purple-500/90 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2 animate-pulse z-10">
                  <Brain className="h-4 w-4 text-white" />
                  <span className="text-white text-sm font-medium">
                    {currentAction.replace(/_/g, ' ')}
                  </span>
                </div>
              )}

              {isInterviewActive && (
                <div className="absolute top-6 right-6 bg-red-500/90 backdrop-blur-sm px-4 py-2 rounded-lg z-10">
                  <div className="flex items-center gap-2 text-white text-sm font-semibold">
                    <Activity className="h-4 w-4 animate-pulse" />
                    <span>LIVE</span>
                  </div>
                </div>
              )}

              {isCapturingAudio && isInterviewActive && (
                <div className="absolute bottom-24 left-6 bg-green-500/90 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2 z-10">
                  <Mic className="h-4 w-4 text-white animate-pulse" />
                  <span className="text-white text-sm font-medium">Speaking...</span>
                  <div className="w-20 h-2 bg-white/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all"
                      style={{ width: `${Math.min(100, audioLevel * 2)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="absolute bottom-6 flex items-center gap-4 z-10">
                <button
                  onClick={toggleMic}
                  disabled={!isInterviewActive || isEnding}
                  className={`p-3 rounded-full transition ${
                    isMicOn 
                      ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
                </button>

                {!isInterviewActive ? (
                  <Button
                    onClick={startInterview}
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 text-white px-8 rounded-full"
                    disabled={isLoading || isEnding}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-5 w-5" />
                        Start Interview
                      </>
                    )}
                  </Button>
                ) : (
                  <button
                    onClick={endInterview}
                    disabled={isEnding}
                    className={`p-4 rounded-full text-white transition ${
                      isEnding 
                        ? 'bg-gray-500 cursor-not-allowed' 
                        : 'bg-red-500 hover:bg-red-600'
                    }`}
                    title="End Interview"
                  >
                    {isEnding ? <Loader2 size={24} className="animate-spin" /> : <PhoneOff size={24} />}
                  </button>
                )}

                <button
                  onClick={toggleCamera}
                  disabled={!isInterviewActive || isEnding}
                  className={`p-3 rounded-full transition ${
                    isCameraOn 
                      ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isCameraOn ? <Video size={24} /> : <VideoOff size={24} />}
                </button>

                <button
                  onClick={toggleSpeaker}
                  disabled={!isInterviewActive || isEnding}
                  className={`p-3 rounded-full transition ${
                    isSpeakerOn 
                      ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSpeakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
                </button>
              </div>
            </div>

            {/* Current Question Display */}
            <Card className="mt-4 p-4">
              <h3 className="font-semibold text-lg mb-2">Current Question:</h3>
              <p className="text-muted-foreground leading-relaxed">
                {messages.length > 0 && messages[messages.length - 1].speaker === 'ai'
                  ? messages[messages.length - 1].text
                  : 'Waiting for AI interviewer...'}
              </p>
            </Card>

            {/* End Interview Button */}
            {isInterviewActive && (
              <div className="mt-4 flex gap-3">
                <Button
                  onClick={endInterview}
                  disabled={isEnding}
                  size="lg"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isEnding ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Saving & Generating Report...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-5 w-5" />
                      Finish & See Report
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={() => router.push('/interview-setup')}
                  variant="outline"
                  size="lg"
                  disabled={isEnding}
                >
                  <X className="mr-2 h-5 w-5" />
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Live Transcript Panel */}
          <aside className="bg-card rounded-xl p-6 flex flex-col overflow-hidden border border-border">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold">Live Transcript</h3>
            </div>

            <div 
              ref={transcriptContainerRef}
              className="flex-1 overflow-y-auto space-y-4 scroll-smooth pr-2"
              style={{ scrollBehavior: 'smooth' }}
            >
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-center text-base">
                    {isInterviewActive ? 'Conversation will appear here...' : 'Start the interview to begin'}
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-3 rounded-lg ${
                        msg.speaker === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold opacity-90">
                          {msg.speaker === 'user' ? 'You' : 'AI Interviewer'}
                        </span>
                        <span className="text-xs opacity-60">
                          {msg.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-base leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}