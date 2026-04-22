import nodemailer from "nodemailer";

// Email sends are NOT idempotent — do not retry automatically or the recipient
// may get duplicate messages. Timeouts are set low enough to fail fast.
const transporter = process.env.SMTP_URL
  ? nodemailer.createTransport(process.env.SMTP_URL, {
      connectionTimeout: 10_000,
      greetingTimeout: 5_000,
      socketTimeout: 20_000,
    })
  : null;

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}) {
  if (!transporter) {
    console.log(`[email:stub] to=${args.to} subject=${args.subject}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "brain@pairai.com",
    to: args.to,
    subject: args.subject,
    text: args.text,
    attachments: args.attachments,
  });
}
