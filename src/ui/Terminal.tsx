import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/store";

export default function Terminal() {
  const lines = useAppStore((state) => state.lines);
  const runCommand = useAppStore((state) => state.runCommand);
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  return (
    <section className="terminal">
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
          if (input.length > 0) runCommand(input);
          setValue("");
        }}
      >
        <span className="terminal-prompt">$</span>
        <input
          className="terminal-field"
          value={value}
          onChange={(event) => setValue(event.target.value)}
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
