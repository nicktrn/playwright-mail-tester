import { simpleParser } from "mailparser"
import type {
  AddressObject,
  HeaderValue,
  Headers,
  ParsedMail,
} from "mailparser"
import { nanoid } from "nanoid"
import { EventEmitter } from "node:events"
import WebSocket from "ws"
import { NamespaceMode } from "./mail-server"

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

type CustomProps = {
  [propName: string]: any
}

type Email = {
  subject: string
  to: string[]
  from: string
  html: string
  text: string
} & CustomProps

const objectToAddress = (object: AddressObject) => object.value[0].address || ""

const createEmail = (parsed: ParsedMail): Email => {
  const to = parsed.to ? [parsed.to].flat().map(objectToAddress) : []
  const from = parsed.from ? [parsed.from].flat().map(objectToAddress)[0] : ""

  const getCustomProp = (
    key: string,
    val: HeaderValue,
    props: Record<string, string>
  ) => {
    const normalised = key.toLowerCase()
    if (!normalised.startsWith("x-mailtest-prop-")) return

    const propName = normalised.replace("x-mailtest-prop-", "")
    if (!propName) return

    if (parsed.hasOwnProperty(propName) || props.hasOwnProperty(propName)) {
      console.log("WARNING! Duplicate prop detected - skipping:", key)
      return
    }

    if (typeof val !== "string") {
      console.log(
        `WARNING! Skipping prop ${propName}, expected string, got '${typeof val}'`
      )
      return
    }

    return { [propName]: val }
  }

  const getCustomProps = (headers: Headers) =>
    [...headers].reduce(
      (obj, [key, val]) => ({ ...obj, ...getCustomProp(key, val, obj) }),
      {} as CustomProps
    )

  const customProps = getCustomProps(parsed.headers)

  return {
    subject: parsed.subject || "",
    to,
    from,
    html: parsed.html || "",
    text: parsed.text ?? "",
    ...customProps,
  }
}

class MailClient extends EventEmitter {
  private ws: WebSocket | null = null
  private emails = new Map<string, Email>()
  private gotMail = Symbol()
  private id = nanoid()
  private namespace: string
  private mode: string

  private debug = (...args: Parameters<typeof console.log>) => {
    if (process.env.DEBUG) {
      console.log(`[MailClient] (${this.id})`, ...args)
    }
  }

  constructor(namespace?: string, mode?: NamespaceMode) {
    super()
    this.namespace = namespace ?? ""
    this.mode = mode ?? ""
  }

  start() {
    return new Promise((res) => {
      this.ws = new WebSocket(
        `ws://localhost:${WS_SERVER_PORT}/?id=${this.id}&ns=${this.namespace}&mode=${this.mode}`
      )

      this.ws.once("open", () => res("mail client started"))

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
          this.emit(this.gotMail, email)
        })
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

  getOne(opts: string | Record<string, string>, { timeout = 5000 } = {}) {
    return new Promise((resolve, reject) => {
      const filter = typeof opts === "string" ? { to: opts } : opts

      const passesFilters = (email: Email) =>
        Object.keys(filter).every((key) => {
          if (key === "to") {
            return email[key].includes(filter[key])
          } else {
            return email[key] === filter[key]
          }
        })

      for (const [recipient, email] of this.emails) {
        if (passesFilters(email)) {
          this.emails.delete(recipient)
          return resolve(email)
        }
      }

      const onEmail = (
        email: Email,
        timeoutId?: Parameters<typeof clearTimeout>[0]
      ) => {
        if (passesFilters(email)) {
          this.removeAllListeners(this.gotMail)
          if (typeof timeoutId !== "undefined") {
            clearTimeout(timeoutId)
          }
          resolve(email)
        }
      }

      // wait forever
      if (timeout === 0) {
        this.on(this.gotMail, onEmail)
        return
      }

      const timeoutId = setTimeout(() => {
        this.removeListener(this.gotMail, onEmail)
        reject(`No email for ${filter}`)
      }, timeout)

      const onEmailWithTimeout = (email: Email) => {
        onEmail(email, timeoutId)
      }

      this.on(this.gotMail, onEmailWithTimeout)
    })
  }

  waitForEmail(recipient: string, { timeout = 0 } = {}): Promise<Email> {
    return new Promise((resolve, reject) => {
      if (this.emails.has(recipient)) {
        const email = this.emails.get(recipient) as Email
        this.emails.delete(recipient)
        return resolve(email)
      }

      const onRecipient = (email: Email) => {
        this.removeAllListeners(recipient)
        resolve(email)
      }

      // wait forever
      if (timeout === 0) {
        this.on(recipient, onRecipient)
        return
      }

      const timeoutId = setTimeout(() => {
        this.removeListener(recipient, onRecipient)
        reject(`No email for ${recipient}`)
      }, timeout)

      const onRecipientWithTimeout = (email: Email) => {
        clearTimeout(timeoutId)
        onRecipient(email)
      }

      this.on(recipient, onRecipientWithTimeout)
    })
  }

  waitForEmails(recipients: string[], { timeout = 0 } = {}) {
    return Promise.all(
      recipients.map((recipient) => this.waitForEmail(recipient, { timeout }))
    )
  }
}

export default MailClient
