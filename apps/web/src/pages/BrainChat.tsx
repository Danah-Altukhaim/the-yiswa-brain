import { useEffect, useRef, useState } from "react";
import { PreviewCard, type ParsedAction } from "../components/PreviewCard.js";
import { VoiceButton } from "../components/VoiceButton.js";
import { Icon } from "../components/Icon.js";
import { api } from "../lib/api.js";
import { useAuth } from "../state/auth.js";

type Turn = { role: "user" | "assistant"; content: string };

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SUGGESTIONS = [
  "Add an Eid promo across all branches",
  "Update Friday hours for Souq Salmiya",
  "Close Awtad Khaitan on April 20",
  "What are the birthday packages?",
];

export function BrainChat() {
  const [sessionId] = useState(() => uuid());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [card, setCard] = useState<ParsedAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const brandName = useAuth((s) => s.tenant?.name) ?? "The Brain";

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, card]);

  async function send(text?: string) {
    const utterance = (text ?? input).trim();
    if (!utterance) return;
    setBusy(true);
    setErr(null);
    setInput("");
    setTurns((t) => [...t, { role: "user", content: utterance }]);
    try {
      const data = await api<{ card: ParsedAction }>("/api/v1/chat/parse", {
        method: "POST",
        body: JSON.stringify({ sessionId, utterance }),
      });
      setCard(data.card);
      setTurns((t) => [...t, { role: "assistant", content: JSON.stringify(data.card) }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(finalCard: ParsedAction) {
    await api("/api/v1/chat/confirm", {
      method: "POST",
      body: JSON.stringify({ sessionId, action: finalCard }),
    });
    setCard(null);
  }

  const empty = turns.length === 0 && !card;

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100dvh-7rem)] sm:h-[calc(100dvh-8rem)]">
      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 animate-fade-in">
          <div className="w-14 h-14 rounded-apple-xl bg-pair flex items-center justify-center shadow-apple-lg mb-5">
            <Icon name="sparkles" size={22} className="text-white" />
          </div>
          <h2 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] text-apple-text">
            Ask {brandName} anything
          </h2>
          <p className="text-[14px] text-apple-secondary mt-2 max-w-md">
            Parse a customer request, update a branch, add a promotion, or surface a policy, all in
            plain English or Arabic.
          </p>
          <div className="grid sm:grid-cols-2 gap-2 w-full max-w-full sm:max-w-xl mt-7">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={busy}
                className="card-hover px-4 py-3 text-[13px] text-left text-apple-text"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={feedRef} className="flex-1 overflow-y-auto px-1 py-2 space-y-3">
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  t.role === "user"
                    ? "bg-pair text-white rounded-apple-lg rounded-br-sm px-4 py-2.5 max-w-[92%] sm:max-w-[80%] text-[14px] leading-relaxed shadow-apple-sm"
                    : "card px-4 py-2.5 max-w-[92%] sm:max-w-[80%] text-[14px] leading-relaxed text-apple-text"
                }
              >
                {t.role === "assistant" && isJson(t.content) ? (
                  <span className="text-apple-secondary">Preview card ready →</span>
                ) : (
                  <span className="whitespace-pre-wrap">{t.content}</span>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="card px-4 py-2.5 text-[14px] text-apple-secondary animate-pulse-soft">
                Thinking…
              </div>
            </div>
          )}
          {card && (
            <div className="animate-slide-in">
              <PreviewCard action={card} onConfirm={confirm} onCancel={() => setCard(null)} />
            </div>
          )}
          {err && (
            <p className="text-[13px] text-apple-red bg-apple-red/10 rounded-apple px-3 py-2">
              {err}
            </p>
          )}
        </div>
      )}

      <div className="sticky bottom-0 pt-2 sm:pt-3 pb-[env(safe-area-inset-bottom)]">
        <div className="card shadow-apple flex items-end gap-1.5 sm:gap-2 p-1.5 sm:p-2">
          <textarea
            className="flex-1 resize-none bg-transparent outline-none px-2.5 sm:px-3 py-2 text-[14px] text-apple-text placeholder:text-apple-tertiary min-h-[40px] max-h-[120px] sm:max-h-[160px]"
            placeholder="Add a promo, update hours, close a branch…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={busy}
            rows={1}
          />
          <VoiceButton sessionId={sessionId} onTranscript={(t) => setInput(t)} />
          <button
            onClick={() => send()}
            disabled={busy || !input.trim()}
            className="btn-primary !px-3 !py-2"
            aria-label="Send"
          >
            <Icon name="send" size={16} />
          </button>
        </div>
        <p className="text-[11px] text-apple-tertiary text-center mt-2">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

function isJson(s: string) {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}
