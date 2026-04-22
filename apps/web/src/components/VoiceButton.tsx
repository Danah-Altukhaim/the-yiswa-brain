import { useRef, useState } from "react";
import { useAuth } from "../state/auth.js";
import { Icon } from "./Icon.js";

export function VoiceButton({
  sessionId,
  onTranscript,
}: {
  sessionId: string;
  onTranscript: (text: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size > 25 * 1024 * 1024) {
        return; // 25MB limit
      }
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", blob, "voice.webm");
        const token = useAuth.getState().token;
        const resp = await fetch(`/api/v1/voice/transcribe?sessionId=${sessionId}`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: fd,
        });
        const json = await resp.json();
        if (json.success) onTranscript(json.data.text);
      } finally {
        setBusy(false);
      }
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setRecording(true);
  }

  function stop() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  const base = "inline-flex items-center justify-center rounded-apple w-11 h-11 transition-all duration-150";
  const cls = busy
    ? `${base} bg-surface-secondary text-apple-tertiary cursor-not-allowed`
    : recording
      ? `${base} bg-apple-red text-white shadow-apple animate-pulse-critical`
      : `${base} bg-surface-secondary text-apple-secondary hover:bg-pair-light hover:text-pair`;

  return (
    <button
      onClick={recording ? stop : start}
      disabled={busy}
      className={cls}
      title={recording ? "Stop recording" : "Voice note"}
      aria-label={recording ? "Stop recording" : "Start voice recording"}
    >
      {busy ? (
        <Icon name="refresh" size={16} className="animate-spin" />
      ) : recording ? (
        <Icon name="close" size={14} />
      ) : (
        <Icon name="microphone" size={16} />
      )}
    </button>
  );
}
