// Sending email. For now emails are printed in the terminal running the
// app (npm run dev), so sign-in codes can be read from there. A real
// email service (e.g. Resend) will be another Mailer.
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
