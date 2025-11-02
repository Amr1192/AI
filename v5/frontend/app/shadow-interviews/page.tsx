"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Mic, MicOff, Video, VideoOff, Square, Play } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export default function InterviewPractice() {
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [interviewId, setInterviewId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<any[]>([]);
  const [final, setFinal] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const stopFlagRef = useRef(false);

  const question =
    "Tell me about a time you had to work with a difficult colleague. How did you handle the situation?";

  // 🧹 reset state
  function resetUi() {
    setTranscript("");
    setFeedback([]);
    setFinal(null);
  }

  // 🛑 stop media tracks
  function stopMedia() {
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    mediaStreamRef.current = null;
  }

  // 🚀 create interview + RT session
  async function startInterviewOnServer() {
    const r1 = await fetch(`${API_BASE}/api/interviews/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const { id } = await r1.json();

    const r2 = await fetch(`${API_BASE}/api/interviews/${id}/rt/start`, {
      method: "POST",
    });
    const { sessionId } = await r2.json();

    console.log("🎯 Session created:", { id, sessionId });
    await new Promise((r) => setTimeout(r, 400));

    await startRecording(id, sessionId);

    const es = new EventSource(`${API_BASE}/api/interviews/${id}/rt/stream/${sessionId}`);
    eventSourceRef.current = es;

    es.addEventListener("partial", (e) => {
      const d = JSON.parse(e.data);
      if (d.text)
        setTranscript((t) => (t ? `${t} ${d.text}`.trim() : d.text.trim()));
      if (d.analysis) setFeedback((f) => [...f, d.analysis]);
    });

    es.addEventListener("final", (e) => {
      const d = JSON.parse(e.data);
      setFinal(d);
      es.close();
      eventSourceRef.current = null;
    });

    setInterviewId(id);
    setSessionId(sessionId);
  }

  // 🎙️ Chunked recording loop (restart MediaRecorder every 4 s)
  async function startRecording(id: number, sid: string) {
    console.log("🎬 Starting recording:", id, sid);
    stopFlagRef.current = false;
    setIsRecording(true);

    const fullStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    mediaStreamRef.current = fullStream;
    if (videoRef.current) videoRef.current.srcObject = fullStream;

    const audioOnly = new MediaStream(fullStream.getAudioTracks());

    while (!stopFlagRef.current) {
      const blob = await recordSingleChunk(audioOnly);
      if (stopFlagRef.current || !blob || blob.size < 3000) break;

      const fd = new FormData();
      fd.append("sessionId", sid);
      fd.append("file", blob, `chunk_${Date.now()}.webm`);

      try {
        const res = await fetch(`${API_BASE}/api/interviews/${id}/rt/chunk`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          console.error(`❌ Upload failed`, await res.text());
        } else {
          console.log(`✅ Uploaded chunk (${(blob.size / 1024).toFixed(1)} KB)`);
        }
      } catch (err) {
        console.error("❌ Network error during upload:", err);
      }
    }

    fullStream.getTracks().forEach((t) => t.stop());
    console.log("🛑 Recording loop ended.");
  }

  async function recordSingleChunk(stream: MediaStream): Promise<Blob> {
    return new Promise((resolve) => {
      const mr = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 128000,
      });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
      mr.start();
      setTimeout(() => {
        if (mr.state === "recording") mr.stop();
      }, 4000); // 4 sec chunks
    });
  }

  // ⏹ stop recording + close session
  async function stopRecording() {
    console.log("🛑 Stopping interview...");
    stopFlagRef.current = true;
    stopMedia();
    setIsRecording(false);

    if (interviewId && sessionId) {
      await fetch(`${API_BASE}/api/interviews/${interviewId}/rt/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      console.log("🧹 Session closed.");
    }
  }

  async function handleStart() {
    if (isRecording) return;
    resetUi();
    try {
      await startInterviewOnServer();
    } catch (err) {
      console.error("❌ Failed to start:", err);
      stopMedia();
    }
  }

  function toggleMic() {
    const stream = mediaStreamRef.current;
    if (stream) stream.getAudioTracks().forEach((t) => (t.enabled = !isMicOn));
    setIsMicOn((v) => !v);
  }

  function toggleVideo() {
    const stream = mediaStreamRef.current;
    if (stream) stream.getVideoTracks().forEach((t) => (t.enabled = !isVideoOn));
    setIsVideoOn((v) => !v);
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="text-primary size-7">
            <svg fill="none" viewBox="0 0 48 48">
              <path
                d="M8.6 8.6C5.5 11.6 3.4 15.5 2.6 19.7C1.8 23.9 2.2 28.4 3.9 32.3C5.5 36.3 8.3 39.7 11.9 42.1C15.5 44.5 19.7 45.8 24 45.8C28.3 45.8 32.5 44.5 36.1 42.1C39.7 39.7 42.5 36.3 44.1 32.3C45.8 28.4 46.2 23.9 45.4 19.7C44.5 15.5 42.5 11.6 39.4 8.6L24 24L8.6 8.6Z"
                fill="currentColor"
              ></path>
            </svg>
          </div>
          <h1 className="text-lg font-bold">AI Interview Practice</h1>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-8 gap-8">
        <div className="flex-1 flex flex-col">
          <div className="bg-gray-900 rounded-xl flex-1 flex flex-col justify-center items-center relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!isVideoOn ? "hidden" : ""}`}
            />
            {!isVideoOn && (
              <img
                src="/interview-video-placeholder.jpg"
                alt="Video"
                className="w-full h-full object-cover opacity-40"
              />
            )}

            <div className="absolute bottom-6 flex items-center gap-6">
              <button
                onClick={toggleMic}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-3 rounded-full text-white transition"
              >
                {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
              </button>

              <button
                onClick={isRecording ? stopRecording : handleStart}
                className={`p-4 rounded-full text-white transition ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {isRecording ? <Square size={24} /> : <Play size={24} />}
              </button>

              <button
                onClick={toggleVideo}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm p-3 rounded-full text-white transition"
              >
                {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
              </button>
            </div>
          </div>

          <Card className="mt-4 p-4">
            <h3 className="font-semibold text-lg mb-2">Transcript:</h3>
            <p className="text-muted-foreground whitespace-pre-wrap text-sm">
              {transcript || (isRecording ? "Listening..." : "—")}
            </p>
          </Card>
        </div>

        <aside className="w-96 bg-card rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-bold mb-4">Real-Time Feedback</h3>
          <div className="space-y-3 overflow-auto">
            {feedback.map((f, i) => (
              <div key={i} className="text-sm border-b pb-2">
                <p>
                  <b>Note:</b> {f.note ?? "—"}
                </p>
                <p>
                  <b>Filler:</b> {f.fillerWords ?? 0} | <b>Pace:</b>{" "}
                  {f.pace ?? "good"}
                </p>
              </div>
            ))}
          </div>

          {final && (
            <div className="mt-4 border-t pt-3">
              <h4 className="font-semibold mb-1">Final Evaluation</h4>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                {JSON.stringify(final.analysis, null, 2)}
              </pre>
            </div>
          )}

          <Button
            type="button"
            onClick={() => setShowModal(true)}
            variant="outline"
            className="w-full mt-auto"
          >
            View Full Report
          </Button>
        </aside>
      </main>

      {showModal && final && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-card">
              <h3 className="text-xl font-bold">Feedback Summary</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground transition"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="font-semibold mb-2">Summary:</p>
              <p className="text-sm mb-4">{final.analysis?.summary}</p>
              <p className="font-semibold mb-2">Tips:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                {(final.analysis?.tips ?? []).map((tip: string, i: number) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
