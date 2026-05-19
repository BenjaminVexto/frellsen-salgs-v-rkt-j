import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { MentionableUser } from "@/lib/mentions";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  users: MentionableUser[];
  placeholder?: string;
  rows?: number;
  className?: string;
}

/**
 * Textarea with an @mention autocomplete dropdown.
 * Inserts "@Firstname " when a colleague is picked.
 */
export function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  rows = 3,
  className,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [tokenStart, setTokenStart] = useState<number>(-1);

  const filtered = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return users
      .filter(
        (u) =>
          u.first_name.toLowerCase().startsWith(q) ||
          u.full_name.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [query, users]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    const caret = e.target.selectionStart ?? next.length;
    // Find the nearest preceding "@" with no whitespace between it and caret
    const before = next.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) {
      setQuery(null);
      return;
    }
    const tok = before.slice(at + 1);
    if (/^[A-Za-zÆØÅæøåÉéÄäÖöÜü\-]*$/.test(tok)) {
      const charBefore = at === 0 ? " " : before[at - 1];
      if (/[\s\n.,;:!?(]/.test(charBefore) || at === 0) {
        setQuery(tok);
        setTokenStart(at);
        return;
      }
    }
    setQuery(null);
  }

  function pick(u: MentionableUser) {
    if (tokenStart < 0) return;
    const before = value.slice(0, tokenStart);
    const afterCaret = value.slice(
      (ref.current?.selectionStart ?? value.length),
    );
    const inserted = `@${u.first_name} `;
    const next = before + inserted + afterCaret;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(filtered[active]);
    } else if (e.key === "Escape") {
      setQuery(null);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
      />
      {/* Rendered preview overlay disabled; styling of @mentions happens via
          the read-only renderer below the input for display surfaces. */}
      {query !== null && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-64 max-h-60 overflow-auto rounded-md border bg-popover shadow-md">
          {filtered.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2",
                i === active && "bg-accent",
              )}
            >
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-medium">
                {u.first_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="font-medium">{u.first_name}</span>
              <span className="text-muted-foreground text-xs truncate">
                {u.full_name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render note text where @Firstname tokens are highlighted blue. */
export function NoteWithMentions({ text }: { text: string }) {
  const parts = text.split(
    /(@[A-Za-zÆØÅæøåÉéÄäÖöÜü][A-Za-zÆØÅæøåÉéÄäÖöÜü\-]*)/g,
  );
  return (
    <p className="text-sm whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="text-primary font-medium">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}
