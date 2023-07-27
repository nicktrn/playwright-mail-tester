import { createTransport } from "nodemailer"
import type SMTPPool from "nodemailer/lib/smtp-pool"

const transport = createTransport({
  pool: true,
  maxConnections: Number(process.env.MAILTEST_POOL_MAX_CONNECTIONS) || 5,
  host: "localhost",
  port: process.env.SMTP_SERVER_PORT,
  logger: !!process.env.DEBUG,
  debug: process.env.DEBUG === "verbose",
} as SMTPPool.Options)

export const sendMail = async ({
  from,
  to,
  subject,
  text,
  html,
}: Record<string, string>) => {
  const messageOpts = {
    from: from ?? "from@example.com",
    to: to ?? "to@example.com",
    subject: subject ?? "Hi, Subject here!",
    text: text ?? "I'm just plain old text.",
    html:
      html ??
      '<p>This is a very important <a data-testid="cta-link" href="https://example.com">link</a></p>',
  }

  try {
    await transport.sendMail(messageOpts)
  } catch (error) {
    console.log("[NODEMAILER] Error:", error)
  }
}
