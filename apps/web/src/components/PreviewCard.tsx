import { useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "./Icon.js";

export type ParsedAction = {
  action: string;
  module: string;
  fields?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  set?: Record<string, unknown>;
  match?: Record<string, unknown>;
  publish_at?: string;
};

type Props = {
  action: ParsedAction;
  onConfirm: (finalAction: ParsedAction) => Promise<void>;
  onCancel: () => void;
};

const ACTION_TONE: Record<string, string> = {
  CREATE: "badge-green",
  UPDATE: "badge-blue",
  DELETE: "badge-red",
  SCHEDULE: "badge-purple",
  BULK_UPDATE: "badge-orange",
};

export function PreviewCard({ action, onConfirm, onCancel }: Props) {
  const [draft, setDraft] = useState<ParsedAction>(action);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [question, setQuestion] = useState("What's your latest promo?");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fields: Record<string, unknown> = draft.fields ?? draft.changes ?? draft.set ?? {};
  const isDelete = draft.action === "DELETE";

  function updateField(key: string, value: string) {
    const bucket = draft.fields ? "fields" : draft.changes ? "changes" : "set";
    setDraft({ ...draft, [bucket]: { ...(draft[bucket] ?? {}), [key]: value } });
  }

  async function testIt() {
    setBusy(true);
    try {
      const d = await api<{ botResponse: string }>("/api/v1/chat/test-it", {
        method: "POST",
        body: JSON.stringify({ module: draft.module, fields, question, locale: "en" }),
      });
      setTestResult(d.botResponse);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 sm:p-5 space-y-4 shadow-apple animate-scale-in">
      <div className="flex items-center gap-2 text-[13px] flex-wrap">
        <span className={`badge ${ACTION_TONE[draft.action] ?? "badge-gray"}`}>{draft.action}</span>
        <span className="text-apple-secondary font-mono text-[12px] truncate">{draft.module}</span>
        {draft.publish_at && (
          <span className="badge badge-orange ml-auto">
            <Icon name="calendar-check" size={11} />
            {new Date(draft.publish_at).toLocaleString()}
          </span>
        )}
      </div>

      {isDelete ? (
        <p className="text-[13px] text-apple-secondary bg-apple-red/5 rounded-apple p-3 border border-apple-red/20">
          Delete entry matching{" "}
          <code className="font-mono text-apple-text">{JSON.stringify(draft.match)}</code>.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {Object.entries(fields).map(([k, v]) => (
            <label key={k} className="block">
              <span className="label">{k}</span>
              <input
                className="input-apple"
                value={typeof v === "string" ? v : JSON.stringify(v)}
                onChange={(e) => updateField(k, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      {!isDelete && (
        <div className="border-t border-apple-separator-light pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="magic-stick" size={14} className="text-pair" />
            <span className="label !mb-0">Test It</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input-apple flex-1"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask the bot a question to preview the response…"
            />
            <button onClick={testIt} disabled={busy} className="btn-secondary w-full sm:w-auto">
              {busy ? "Testing…" : "Test It"}
            </button>
          </div>
          {testResult && (
            <div className="bg-surface-tertiary rounded-apple p-3 text-[13px] text-apple-text whitespace-pre-wrap border border-apple-separator-light">
              {testResult}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
        <button onClick={onCancel} className="btn-ghost">
          <Icon name="close" size={14} />
          Cancel
        </button>
        {isDelete && !confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="btn-danger">
            <Icon name="trash" size={14} />
            Delete…
          </button>
        ) : (
          <button
            onClick={() => onConfirm(draft)}
            className={isDelete ? "btn-danger" : "btn-primary"}
          >
            {isDelete ? <Icon name="trash" size={14} /> : <Icon name="check" size={14} />}
            {isDelete ? "Confirm delete" : "Confirm & publish"}
          </button>
        )}
      </div>
    </div>
  );
}
