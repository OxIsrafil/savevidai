import { useState, type FormEvent } from "react";
import { motion, useAnimationControls } from "motion/react";
import { login, type LoginResult } from "../lib/api";
import { Spinner } from "./Spinner";
import { Wordmark } from "./Wordmark";
import { CARD, cn, PRIMARY_BUTTON } from "./styles";

const MESSAGES: Record<Exclude<LoginResult, "ok">, string> = {
  wrong: "Wrong password",
  limited: "Too many tries. Wait a minute",
  error: "Could not reach the server",
};

/** Centred 384px column: wordmark, then the sign-in card. A wrong password shakes the card. */
export function LoginView({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Exclude<LoginResult, "ok"> | null>(null);
  const shake = useAnimationControls();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setError(null);
    const result = await login(password);
    setPending(false);
    if (result === "ok") {
      setPassword("");
      onSignedIn();
      return;
    }
    setError(result);
    if (result === "wrong") void shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
  }

  const wrong = error === "wrong";
  return (
    <main className="grid min-h-svh place-items-center px-[clamp(20px,4vw,48px)] py-12">
      <div className="w-full max-w-sm">
        <Wordmark />
        <motion.div animate={shake} className={cn(CARD, "mt-10 p-6 shadow-raised sm:p-8")}>
          <p className="kicker mb-2">Admin</p>
          <h1 className="text-[clamp(20px,1.8vw,24px)] leading-tight font-semibold tracking-[-0.01em] text-text-primary">Sign in</h1>
          <p className="mt-1.5 text-[13px] text-text-muted">Traffic, downloads and site controls for SaveVid AI</p>
          <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-2">
            <label htmlFor="admin-password" className="text-[13px] text-text-secondary">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={wrong || undefined}
              aria-describedby="admin-password-message"
              className={cn(
                "h-11 w-full rounded-field border bg-white/[0.04] px-4 text-base text-text-primary outline-none transition-colors focus:ring-[3px] focus:ring-brand/40",
                wrong ? "border-danger" : "border-line-strong focus:border-brand",
              )}
            />
            <p id="admin-password-message" role="alert" className="min-h-5 text-xs text-danger">
              {error ? MESSAGES[error] : ""}
            </p>
            <button type="submit" disabled={!password || pending} className={cn(PRIMARY_BUTTON, "mt-2")}>
              {pending ? <Spinner /> : null}
              Sign in
            </button>
          </form>
        </motion.div>
      </div>
    </main>
  );
}
