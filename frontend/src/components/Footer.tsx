export function Footer() {
  return (
    <footer className="w-full max-w-3xl border-t border-[var(--line)] py-8 text-sm text-[var(--muted)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          No popups. No fake buttons. No tracking.{" "}
          <a className="link-sweep" href="https://github.com/OWNER/savevidai">
            Open source
          </a>
          .
        </p>
        <a className="link-sweep text-[var(--muted)]" href="https://ko-fi.com/OWNER">
          Support this project
        </a>
      </div>
    </footer>
  );
}
