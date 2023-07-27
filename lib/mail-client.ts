import { simpleParser } from "mailparser"
import type { AddressObject, ParsedMail } from "mailparser"
import { nanoid } from "nanoid"
import { EventEmitter } from "node:events"
import WebSocket from "ws"

if (!process.env.SMTP_SERVER_PORT) {
  throw new Error(
    "SMTP_SERVER_PORT env var is required to start test mail server."
  )
}
const SMTP_SERVER_PORT = Number(process.env.SMTP_SERVER_PORT)
if (isNaN(SMTP_SERVER_PORT)) {
  throw new Error("SMTP_SERVER_PORT env var needs to be a number.")
}

const WS_SERVER_PORT = SMTP_SERVER_PORT + 1

const objectToAddress = (object: AddressObject) => object.value[0].address || ""

const createEmail = (parsed: ParsedMail) => {
  const to = parsed.to ? [parsed.to].flat().map(objectToAddress) : []
  const from = parsed.from ? [parsed.from].flat().map(objectToAddress)[0] : ""
  return {
    subject: parsed.subject || "",
    to,
    from,
    html: parsed.html || "",
    text: parsed.text ?? "",
  }
}

type Email = ReturnType<typeof createEmail>

class MailClient extends EventEmitter {
  private ws: WebSocket | null = null
  private emails = new Map<string, Email>()
  private id = nanoid()
  private namespace: string

  private debug = (...args: Parameters<typeof console.log>) => {
    if (process.env.DEBUG) {
      console.log(`[MailClient] (${this.id})`, ...args)
    }
  }

  constructor(namespace?: string) {
    super()
    this.namespace = namespace ?? ""
  }

  start() {
    this.ws = new WebSocket(
      `ws://localhost:${WS_SERVER_PORT}/?id=${this.id}&ns=${this.namespace}`
    )

    this.ws.on("error", console.error)

    this.ws.on("message", async (buffer) => {
      const parsed = await simpleParser(buffer.toString())
      const email = createEmail(parsed)
      const { html, ...rest } = email
      this.debug("you've got mail:", rest.to[0])
      email.to.forEach((recipient) => {
        if (this.emails.has(recipient)) {
          this.debug("WARN: overwriting email for", recipient)
        }
        this.emails.set(recipient, email)
        this.emit(recipient, email)
      })
    })
  }

  stop() {
    return new Promise((res) => {
      this.ws?.close()
      this.emails.clear()
      res("mail client stopped")
    })
  }

  waitForEmail(recipient: string, { timeout = 0 } = {}): Promise<Email> {
    return new Promise((resolve, reject) => {
      if (this.emails.has(recipient)) {
        const email = this.emails.get(recipient) as Email
        this.emails.delete(recipient)
        return resolve(email)
      }

      const onEmail = (email: Email) => {
        this.removeAllListeners(recipient)
        resolve(email)
      }

      // wait forever
      if (timeout === 0) {
        this.on(recipient, onEmail)
        return
      }

      const timeoutId = setTimeout(() => {
        this.removeListener(recipient, onEmail)
        reject(`No email for ${recipient}`)
      }, timeout)

      const onEmailWithTimeout = (email: Email) => {
        clearTimeout(timeoutId)
        onEmail(email)
      }

      this.on(recipient, onEmailWithTimeout)
    })
  }

  waitForEmails(recipients: string[], { timeout = 0 } = {}) {
    return Promise.all(
      recipients.map((recipient) => this.waitForEmail(recipient, { timeout }))
    )
  }
}

export default MailClient
