// Login screen — only rendered when auth is required and there's no
// session. Email → magic link → "check your inbox". If the server is in
// console-fallback mode (RESEND_API_KEY unset), the returned URL is shown
// directly so a self-hoster can click through without checking the log.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Tau } from "../components/BrandMark";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const send = useMutation({ mutationFn: (e: string) => api.requestMagicLink(e) });
  const result = send.data;

  return (
    <div className="grid min-h-screen w-full place-items-center bg-paper px-6 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-ink">
            <Tau size={28} tone="ink" />
          </div>
          <h1 className="mt-4 font-display text-[28px] font-semibold leading-tight text-ink">Themis</h1>
          <div className="mt-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
            Evidence Intelligence
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_64px_-32px_rgba(31,26,20,0.18)]">
          {!result ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) send.mutate(email.trim());
              }}
            >
              <label className="block">
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">
                  Email
                </span>
                <input
                  type="email"
                  autoFocus
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@firm.com"
                  className="mt-1.5 w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-ink outline-none focus:border-brass"
                />
              </label>
              <p className="mt-2 text-[11.5px] text-ink-soft">
                We'll email you a one-tap sign-in link. No password needed.
              </p>
              {send.error && (
                <div className="mt-3 rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
                  {send.error instanceof Error ? send.error.message : "Could not send the link."}
                </div>
              )}
              <button
                type="submit"
                disabled={send.isPending || email.trim().length === 0}
                className="mt-5 w-full rounded-md bg-brass px-3 py-2 text-[13.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
              >
                {send.isPending ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          ) : (
            <div>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-verify-wash text-verify">✓</div>
              <h2 className="mt-3 font-display text-[18px] font-semibold leading-tight text-ink">
                Check your inbox
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                We sent a sign-in link to <strong className="font-semibold text-ink">{email}</strong>. It expires in 15 minutes and can only be used once.
              </p>
              {result.via === "console" && result.url && (
                <div className="mt-4 rounded-md border border-brass-soft bg-brass-wash p-3 text-[11.5px]">
                  <div className="font-mono font-semibold uppercase tracking-wider text-brass-deep">
                    Dev mode · email delivery disabled
                  </div>
                  <p className="mt-1 text-ink-soft">
                    RESEND_API_KEY isn't set on this server. Use this link to sign in:
                  </p>
                  <a
                    href={result.url}
                    className="mt-2 block break-all rounded border border-line bg-paper p-2 font-mono text-[10.5px] text-info hover:underline"
                  >
                    {result.url}
                  </a>
                </div>
              )}
              <button
                onClick={() => send.reset()}
                className="mt-4 w-full rounded-md border border-line bg-paper px-3 py-2 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[10.5px] text-ink-faint">
          By signing in you agree to Themis's terms. We never share your matter data outside your firm.
        </p>
      </div>
    </div>
  );
}
