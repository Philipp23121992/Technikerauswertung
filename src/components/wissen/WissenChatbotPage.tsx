"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatSource = { title: string; excerpt: string };
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
};

export function WissenChatbotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hallo! Frage gezielt nach Teilenummern oder Fehlercodes – dann antworte ich knapp und direkt. Allgemeine Fragen beantworte ich mit dem passenden Ausschnitt aus der Wissensdatenbank.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/wissen/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Antwort fehlgeschlagen.");
        return;
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
    }
  }

  return (
    <div className="wissen-chat">
      <header className="section-header">
        <div>
          <h1>Chatbot</h1>
          <p>
            Gezielte Antworten: Teilenummer → nur PN; Fehlercode → Code mit Erläuterung
          </p>
        </div>
      </header>

      <div className="wissen-chat-panel">
        <div className="wissen-chat-messages" role="log" aria-live="polite">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`wissen-bubble is-${message.role}`}
            >
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
          {busy ? <p className="wissen-typing">Suche in der Wissensdatenbank…</p> : null}
          <div ref={endRef} />
        </div>

        <form className="wissen-chat-input" onSubmit={onSend}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="z. B. Teilenummer Left cover / Fehlercode 42.49"
            disabled={busy}
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
