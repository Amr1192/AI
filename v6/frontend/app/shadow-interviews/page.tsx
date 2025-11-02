"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MicOff, Video, VideoOff, Play, Square } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type Feedback = { note: string; fillerWords: number; pace: string };
type FinalAnalysis = { clarity: number; confidence: number; structure: number; summary: string; tips: string[] };

export default function ShadowInterviewPage() {
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  const [interviewId, setInterviewId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [transcript, setTranscript] = useState<string>("");

  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [overall, setOverall] = useState<any>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopFlagRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // -----------------------------------------------------
  // 🟢 Flow: Start → Record → Stop → Next → Finalize
  // -----------------------------------------------------

  async function startInterview() {
    resetUi();

    // Step 1: Create interview with predefined questions
    const startRes = await fetch(`${API_BASE}/api/interviews/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: 1 }),
    });
    const startData = await startRes.json();
    setInterviewId(startData.id);

    // Step 2: Fetch first question
    const qRes = await fetch(`${API_BASE}/api/interviews/${startData.id}/next-question`);
    const qData = await qRes.json();
    if (qData.done) throw new Error("No questions found");
    setCurrentQuestion(qData.question);
    setQuestionIndex(qData.index);
    setTotalQuestions(qData.total);

    // Step 3: Start real-time session
    const sRes = await fetch(`${API_BASE}/api/interviews/${startData.id}/rt/start`, { method: "POST" });
    const { sessionId } = await sRes.json();
    setSessionId(sessionId);

    // Step 4: Start recording and SSE
    startRecording(startData.id, sessionId);
    startEvents(startData.id, sessionId);
  }

  async function nextQuestion() {
    if (!interviewId || !sessionId) return;
    await stopRecording();

    const qRes = await fetch(`${API_BASE}/api/interviews/${interviewId}/next-question`);
    const qData = await qRes.json();

    if (qData.done) {
      const finRes = await fetch(`${API_BASE}/api/interviews/${interviewId}/finalize`, { method: "POST" });
      const finData = await finRes.json();
      setOverall(finData.summary);
      setIsRecording(false);
      return;
    }

    setCurrentQuestion(qData.question);
    setQuestionIndex(qData.index);

    // restart recording session
    await startRecording(interviewId, sessionId);
  }

  // -----------------------------------------------------
  // 🎙️ Recording logic (chunks every 4s)
  // -----------------------------------------------------
  async function startRecording(id: number, sid: string) {
    stopFlagRef.current = false;
    setIsRecording(true);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideoOn,
    });
    mediaStreamRef.current = stream;
    if (videoRef.current && isVideoOn) videoRef.current.srcObject = stream;

    const audioOnly = new MediaStream(stream.getAudioTracks());

    while (!stopFlagRef.current) {
      const blob = await recordChunk(audioOnly);
      if (stopFlagRef.current || !blob || blob.size < 3000) break;

      const fd = new FormData();
      fd.append("sessionId", sid);
      fd.append("file", blob, `chunk_${Date.now()}.webm`);

      try {
        const res = await fetch(`${API_BASE}/api/interviews/${id}/rt/chunk`, { method: "POST", body: fd });
        if (!res.ok) console.warn("Chunk upload failed:", await res.text());
      } catch (err) {
        console.error("Upload error:", err);
      }
    }

    stream.getTracks().forEach((t) => t.stop());
    console.log("🎬 Recording stopped.");
  }

  function recordChunk(stream: MediaStream): Promise<Blob> {
    return new Promise((resolve) => {
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
      mr.start();
      setTimeout(() => mr.stop(), 4000);
    });
  }

  async function stopRecording() {
    stopFlagRef.current = true;
    stopMedia();
    setIsRecording(false);
    if (interviewId && sessionId) {
      await fetch(`${API_BASE}/api/interviews/${interviewId}/rt/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    }
  }

  // -----------------------------------------------------
  // 🔄 SSE event stream
  // -----------------------------------------------------
  function startEvents(id: number, sid: string) {
    eventSourceRef.current?.close();
    const es = new EventSource(`${API_BASE}/api/interviews/${id}/rt/stream/${sid}`);
    eventSourceRef.current = es;

    es.addEventListener("partial", (e) => {
      const d = JSON.parse(e.data);
      if (d.text) setTranscript((t) => `${t} ${d.text}`.trim());
      if (d.analysis) setFeedback((f) => [...f, d.analysis]);
    });

    es.addEventListener("final", (e) => {
      const d = JSON.parse(e.data);
      setAnswers((a) => [...a, d]);
      setTranscript("");
      setFeedback([]);
    });

    es.onerror = () => {
      console.warn("SSE connection dropped — reconnecting...");
      setTimeout(() => startEvents(id, sid), 1500);
    };

    es.onopen = () => console.log("✅ SSE connected");
  }

  // -----------------------------------------------------
  // 🎛 Controls & Cleanup
  // -----------------------------------------------------
  function resetUi() {
    setTranscript("");
    setFeedback([]);
    setAnswers([]);
    setOverall(null);
  }

  function stopMedia() {
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    mediaStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
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

  useEffect(() => {
    return () => {
      stopMedia();
      eventSourceRef.current?.close();
    };
  }, []);

  // -----------------------------------------------------
  // 🖥️ Render
  // -----------------------------------------------------
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-lg font-bold">AI Interview Practice</h1>
        <Button
          onClick={isRecording ? nextQuestion : startInterview}
          className={isRecording ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}
        >
          {isRecording ? "Next Question" : "Start Interview"}
        </Button>
      </header>

      <main className="flex flex-1 gap-6 p-6">
        <div className="flex-1 flex flex-col">
          <Card className="p-4 mb-4">
            <h2 className="font-semibold text-lg">Question {questionIndex + 1}</h2>
            <p className="text-sm text-muted-foreground">{currentQuestion || "—"}</p>
          </Card>

          <div className="bg-black/90 flex-1 rounded-xl relative overflow-hidden grid place-items-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!isVideoOn ? "hidden" : ""}`}
            />
            {!isVideoOn && <div className="text-white/60">Camera Off</div>}

            <div className="absolute bottom-6 flex items-center gap-6">
              <button
                onClick={toggleMic}
                className="bg-white/20 hover:bg-white/30 p-3 rounded-full text-white"
              >
                {isMicOn ? <Mic size={22} /> : <MicOff size={22} />}
              </button>

              <button
                onClick={isRecording ? nextQuestion : startInterview}
                className={`p-4 rounded-full text-white ${
                  isRecording ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {isRecording ? <Square size={22} /> : <Play size={22} />}
              </button>

              <button
                onClick={toggleVideo}
                className="bg-white/20 hover:bg-white/30 p-3 rounded-full text-white"
              >
                {isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
              </button>
            </div>
          </div>

          <Card className="mt-4 p-4">
            <h3 className="font-semibold mb-2">Transcript</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {transcript || (isRecording ? "Listening…" : "—")}
            </p>
          </Card>
        </div>

        <aside className="w-[380px] flex flex-col gap-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Real-Time Feedback</h3>
            <div className="space-y-2 max-h-[40vh] overflow-auto">
              {feedback.length > 0 ? (
                feedback.map((p, i) => (
                  <div key={i} className="text-sm border-b pb-2">
                    <div><b>Note:</b> {p.note ?? "—"}</div>
                    <div><b>Filler:</b> {p.fillerWords ?? 0} | <b>Pace:</b> {p.pace ?? "good"}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">—</div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold mb-2">Answers So Far</h3>
            <div className="space-y-3 max-h-[35vh] overflow-auto">
              {answers.length > 0 ? (
                answers.map((a, i) => (
                  <div key={i} className="text-xs border rounded p-2">
                    <div className="font-semibold">Q{i + 1}</div>
                    <div className="mt-1 text-muted-foreground">{a.transcript || "No text"}</div>
                    <pre className="mt-2 bg-muted p-2 rounded overflow-auto text-xs">
                      {JSON.stringify(a.analysis, null, 2)}
                    </pre>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">—</div>
              )}
            </div>
          </Card>

          {overall && (
            <Card className="p-4">
              <h3 className="font-semibold mb-2">Final Summary</h3>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                {JSON.stringify(overall, null, 2)}
              </pre>
              <Button
                className="mt-3 w-full"
                onClick={() =>
                  (window.location.href = `/interviews/${interviewId}/report`)
                }
              >
                View Full Report
              </Button>
            </Card>
          )}
        </aside>
      </main>
    </div>
  );
}
