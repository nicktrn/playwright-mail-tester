import { MailServer } from "./lib/mail-server"

if (!process.env.SMTP_SERVER_PORT) {
  throw new Error(
    "SMTP_SERVER_PORT env var is required to start test mail server."
  )
}

new MailServer(process.env.SMTP_SERVER_PORT)
