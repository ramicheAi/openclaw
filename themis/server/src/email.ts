// Outbound email — Resend in prod, console fallback in dev.
// When RESEND_API_KEY is set we POST to https://api.resend.com/emails;
// otherwise we log the message to stdout so dev/local users can still grab
// the magic link from the terminal. Never fails closed — auth always
// works even if email delivery is down (the operator can read the log).

interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const FROM = process.env.THEMIS_EMAIL_FROM ?? "Themis <login@themis.law>";

export interface SendResult {
  delivered: boolean;
  via: "resend" | "console";
  id?: string;
  error?: string;
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Console fallback: log the message in a clearly framed block so the
    // operator can copy-paste the magic link out of the terminal.
    console.log("\n──────── EMAIL (console fallback — set RESEND_API_KEY) ────────");
    console.log(`To:      ${args.to}`);
    console.log(`Subject: ${args.subject}`);
    console.log("");
    console.log(args.text);
    console.log("────────────────────────────────────────────────────────────────\n");
    return { delivered: true, via: "console" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [args.to],
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { delivered: false, via: "resend", error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { delivered: true, via: "resend", id: data.id };
  } catch (err) {
    return { delivered: false, via: "resend", error: err instanceof Error ? err.message : String(err) };
  }
}

export function magicLinkEmail(args: { to: string; url: string; ip: string }): SendArgs {
  const { to, url, ip } = args;
  return {
    to,
    subject: "Your Themis sign-in link",
    text: [
      "Sign in to Themis",
      "",
      "Click the link below to sign in. It will expire in 15 minutes and can only be used once.",
      "",
      url,
      "",
      `Requested from IP: ${ip || "(unknown)"}.`,
      "If you didn't request this, you can ignore this email — no account was created.",
      "",
      "— Themis",
    ].join("\n"),
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f1a14">
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;margin:0 0 16px;color:#1f1a14">Sign in to Themis</h1>
  <p style="font-size:14px;line-height:1.55;margin:0 0 20px;color:#1f1a14">Click the button below to sign in. The link expires in 15 minutes and can only be used once.</p>
  <p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#8a5a1f;color:#f4ecda;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Open Themis</a></p>
  <p style="font-size:11.5px;color:#5b5141;line-height:1.55;margin:0 0 6px">Or paste this URL into your browser:</p>
  <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#5b5141;word-break:break-all;margin:0 0 24px">${url}</p>
  <hr style="border:none;border-top:1px solid #d6caa8;margin:20px 0">
  <p style="font-size:11px;color:#8a7f6c;line-height:1.5;margin:0">Requested from IP: ${ip || "(unknown)"}. If you didn't request this, you can ignore this email — no account was created.</p>
</div>`,
  };
}
