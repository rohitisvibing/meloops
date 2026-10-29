"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { parseMediaUrl } from "@/lib/media/parse-url";

/** The blue capture block: paste a YouTube or Spotify song link and jump into the editor. */
export function PasteDeck({ title = "Caught a moment?", playlistId }: { title?: string; playlistId?: string }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (input: string) => {
    const parsed = parseMediaUrl(input);
    if (!parsed.ok) return setError(parsed.message);
    const params = new URLSearchParams({ provider: parsed.provider, id: parsed.mediaId });
    if (parsed.startMs !== null) params.set("t", String(parsed.startMs));
    if (playlistId) params.set("playlist", playlistId);
    router.push(`/create?${params}`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(value);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text);
      setError(null);
      go(text);
    } catch {
      setError("Couldn't read the clipboard. Long-press the box and choose Paste.");
    }
  };

  return (
    <form className="deck" onSubmit={submit} noValidate>
      <label htmlFor={id} className="deck-title display" style={{ display: "block" }}>
        {title}
      </label>
      <input
        id={id}
        className="deck-input"
        type="url"
        inputMode="url"
        autoComplete="off"
        placeholder="Paste a YouTube or Spotify link"
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : `${id}-hint`}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      {error ? (
        <p id={`${id}-err`} className="field-error" role="alert" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} style={{ marginTop: 8, fontSize: "var(--t-sm)", opacity: 0.9 }}>
          YouTube and YouTube Music songs play right here.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <button type="button" className="btn btn-shell" onClick={pasteFromClipboard}>
          Paste link
        </button>
        <button type="submit" className="btn btn-shell" disabled={!value.trim()}>
          Add song
        </button>
      </div>
    </form>
  );
}
