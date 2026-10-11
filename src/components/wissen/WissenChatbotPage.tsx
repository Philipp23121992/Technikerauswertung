"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatSource = { title: string; excerpt: string };
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
};

const FALLBACK_MODELS = ["CX725", "CX727", "MS725", "MS821", "XC4140"];
const SYMPTOM_SUGGESTIONS = ["wird nicht warm", "Papierstau", "Fuser", "121.05"];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Welches Modell hast du vor dir?\nBitte das Typenschild nennen, z. B. CX725, MS821 oder XC4140.",
};

export function WissenChatbotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [knownModels, setKnownModels] = useState<string[]>(FALLBACK_MODELS);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    inputRef.current?.focus();
    void fetch("/api/wissen/chat", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { models?: string[] }) => {
        if (Array.isArray(data.models) && data.models.length) {
          setKnownModels(data.models.slice(0, 16));
        }
      })
      .catch(() => undefined);
  }, []);

  function resetChat() {
    setMessages([WELCOME]);
    setModel(null);
    setError("");
    setInput("");
    inputRef.current?.focus();
  }

  async function send(text: string) {
    const value = text.trim();
    if (!value || busy) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: value,
    };
    const payload = [...messages.filter((item) => item.id !== "welcome"), userMessage].map((item) => ({
      role: item.role,
      content: item.text,
    }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/wissen/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, messages: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Antwort fehlgeschlagen.");
        return;
      }
      if (typeof data.model === "string" && data.model.trim()) {
        setModel(data.model.trim().toUpperCase());
      }
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.answer || "Keine Antwort.",
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
      ]);
    } catch {
      setError("Netzwerkfehler beim Chat.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onSend(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  const chips = model ? SYMPTOM_SUGGESTIONS : knownModels;

  return (
    <div className="wissen-chat">
      <header className="section-header">
        <div>
          <h1>Diagnose-Chatbot</h1>
          <p>
            Beim Start immer zuerst das Modell. Danach Fehlercode oder Symptom – Ersatzteile und
            Anleitung kommen aus Manual und Alttickets.
          </p>
        </div>
        <div className="wissen-chat-head-actions">
          {model ? (
            <span className="wissen-model-badge" title="Aktives Modell für dieses Gespräch">
              Modell {model}
            </span>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={resetChat}>
            Neues Gespräch
          </button>
        </div>
      </header>

      <div className="wissen-chat-panel">
        <div className="wissen-chat-messages" role="log" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`wissen-bubble is-${message.role}`}>
              <p>{message.text}</p>
              {message.sources && message.sources.length > 0 ? (
                <div className="wissen-sources">
                  <strong>Quellen</strong>
                  {message.sources.map((source, index) => (
                    <div key={`${message.id}-${index}`} className="wissen-source">
                      <span>{source.title}</span>
                      <p>{source.excerpt}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {busy ? <p className="wissen-typing">Prüfe Manual, Teileliste und Alttickets…</p> : null}
          <div ref={endRef} />
        </div>

        <form className="wissen-chat-input wissen-chat-input-diag" onSubmit={onSend}>
          <div className="wissen-chat-suggestions">
            {chips.map((item) => (
              <button
                key={item}
                type="button"
                className="wissen-chip"
                disabled={busy}
                onClick={() => void send(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              model
                ? `Symptom oder Fehlercode für ${model}`
                : "Modell eingeben, z. B. CX725"
            }
            disabled={busy}
            rows={2}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
            Senden
          </button>
        </form>
        {error ? <p className="wissen-error">{error}</p> : null}
      </div>
    </div>
  );
}
