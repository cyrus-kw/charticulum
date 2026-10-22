// Sending email. With RESEND_API_KEY and EMAIL_FROM set (see CLAUDE.md),
// emails go out through Resend; without them (npm run dev) they're
// printed in the terminal running the app, so sign-in codes can be read
// from there.
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.log(`\n──── Email to ${to} ────\nSubject: ${subject}\n\n${text}\n────────────────────\n`);
  },
};

// Resend (resend.com) sends email for us. Its API is one web request, so
// no extra package is needed. `from` must be an address on a domain
// verified in Resend, e.g. "Charticulum <codes@charticulum.app>".
// `fetchFn` is only there so tests can pretend to be Resend.
export function resendMailer(apiKey: string, from: string, fetchFn: typeof fetch = fetch): Mailer {
  return {
    async send({ to, subject, text }) {
      const response = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!response.ok) {
        // Resend explains what went wrong (bad key, unverified domain...)
        // in the reply; keep it for the server log.
        throw new Error(`Resend refused the email (${response.status}): ${await response.text()}`);
      }
    },
  };
}

// A mailer that can't send, for a setup mistake. It fails only when an
// email is actually sent, so every other page keeps working.
const brokenMailer = (problem: string): Mailer => ({
  async send() {
    throw new Error(problem);
  },
});

// Picks the mailer from the environment. A live site with no email set up
// must not quietly print codes into its log (nobody could sign in), so in
// production that's an error that says what to set.
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  const apiKey = env.RESEND_API_KEY;
  if (apiKey) {
    if (!env.EMAIL_FROM) {
      return brokenMailer('RESEND_API_KEY is set but EMAIL_FROM isn\'t (e.g. "Charticulum <codes@your-domain>").');
    }
    return resendMailer(apiKey, env.EMAIL_FROM);
  }
  if (env.NODE_ENV === "production") {
    return brokenMailer("No email service is set up. Set RESEND_API_KEY and EMAIL_FROM.");
  }
  return consoleMailer;
}
