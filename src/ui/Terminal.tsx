import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/store";

export default function Terminal() {
  const lines = useAppStore((state) => state.lines);
  const runCommand = useAppStore((state) => state.runCommand);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  return (
    <section
      className="terminal"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="terminal-lines" ref={scrollRef}>
        {lines.map((line, index) => (
          <p key={index} className={`terminal-line terminal-${line.kind}`}>
            {line.kind === "input" ? `$ ${line.text}` : line.text || "\u00a0"}
          </p>
        ))}
      </div>
      <form
        className="terminal-form"
        onSubmit={(event) => {
          event.preventDefault();
          const input = value.trim();
          if (input.length > 0) {
            runCommand(input);
            setHistory((prev) => [...prev, input]);
            setHistoryIndex(null);
          }
          setValue("");
        }}
      >
        <span className="terminal-prompt">$</span>
        <input
          ref={inputRef}
          className="terminal-field"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (history.length === 0) return;
              const nextIndex =
                historyIndex === null
                  ? history.length - 1
                  : Math.max(0, historyIndex - 1);
              setHistoryIndex(nextIndex);
              setValue(history[nextIndex] ?? "");
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              if (historyIndex === null) return;
              const nextIndex = historyIndex + 1;
              if (nextIndex >= history.length) {
                setHistoryIndex(null);
                setValue("");
              } else {
                setHistoryIndex(nextIndex);
                setValue(history[nextIndex] ?? "");
              }
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoFocus
          aria-label="git command"
        />
      </form>
    </section>
  );
}
