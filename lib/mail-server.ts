import { nanoid } from "nanoid"
import { createServer } from "node:http"
import type { IncomingMessage } from "node:http"
import { SMTPServer } from "smtp-server"
import type { SMTPServerEnvelope, SMTPServerOptions } from "smtp-server"
import { WebSocket, WebSocketServer } from "ws"

export type NamespacedWebSocket = WebSocket & {
  id?: string
  namespace?: string
}

const parseEnvelope = (envelope: SMTPServerEnvelope) => ({
  from: envelope.mailFrom ? envelope.mailFrom.address : "",
  to: envelope.rcptTo.map((rcpt) => rcpt.address),
})

export class MailServer {
  smtpServer: SMTPServer
  wsServer: WebSocketServer

  WS_SERVER_PORT: string | number
  SMTP_SERVER_PORT: string | number

  private stats = {
    received: 0,
    forwarded: 0,
  }

  private debug = (...args: Parameters<typeof console.log>) => {
    if (process.env.DEBUG) {
      console.log("[MailServer]", ...args)
    }
  }

  private onSmtpData: SMTPServerOptions["onData"] = (
    stream,
    session,
    callback
  ) => {
    this.debug(`SMTP ${session.id} data tx start`)
    const chunks: Buffer[] = []
    stream.on("data", (chunk) => {
      chunks.push(chunk)
    })
    stream.on("end", () => {
      this.stats.received++
      const buffer = Buffer.concat(chunks)
      const envelope = parseEnvelope(session.envelope)
      envelope.to.forEach((to) => {
        ;[...this.wsServer.clients]
          .filter((client: NamespacedWebSocket) => {
            if (!(typeof client.namespace === "string")) return
            return to.startsWith(client.namespace)
          })
          .forEach((client: NamespacedWebSocket) => {
            if (client.readyState === WebSocket.OPEN) {
              this.stats.forwarded++
              this.debug(
                `SMTP ${session.id} -> ${envelope.to[0]} -> WS (${client.id}) [${client.namespace}]`
              )
              client.send(buffer)
            }
          })
      })

      this.debug(`SMTP ${session.id} data tx end`)
      callback()
    })
  }

  private onWebSocketConnection = (
    ws: NamespacedWebSocket,
    req: IncomingMessage
  ) => {
    const debug = (...args: Parameters<typeof console.log>) =>
      this.debug(`(${ws.id})`, ...args)

    const url = new URL(req.url ?? "", `ws://localhost:${this.WS_SERVER_PORT}`)

    ws.id = url.searchParams.get("id") ?? nanoid()
    ws.namespace = url.searchParams.get("ns") ?? ""

    debug("client connected on port", req.socket.remotePort)

    ws.on("close", (code, reason) => {
      debug("client disconnected", { code, reason: reason.toString() })
      debug({ stats: this.stats })
    })
    ws.on("error", (err) => console.error("WebSocket error", err))
    ws.on("message", (data) => {
      const message = data.toString()
      debug("received:", message)
    })
  }

  constructor(smtpPort: string | number) {
    this.SMTP_SERVER_PORT = Number(smtpPort)
    this.WS_SERVER_PORT = this.SMTP_SERVER_PORT + 1

    // start websocket server
    const server = createServer((req, res) => {
      res.end() // send 200 status to help playwright detect when server is up
    })
    this.wsServer = new WebSocketServer({ server })
    server.listen(this.WS_SERVER_PORT)
    this.debug("WebSocket listening")

    // add listeners
    this.wsServer.on("connection", this.onWebSocketConnection)

    // start smtp server
    this.smtpServer = new SMTPServer({
      disabledCommands: ["AUTH", "STARTTLS"],
      onData: this.onSmtpData,
      disableReverseLookup: true,
      logger: !!process.env.DEBUG,
    })
    this.smtpServer.listen(this.SMTP_SERVER_PORT)
    this.debug("SMTP listening")
  }
}
