# Playwright Mail Tester

## Purpose

Provide simple, fast, local-first e2e email testing with full parallel support.

## Design

```mermaid
sequenceDiagram
    participant Client
    box Server
    participant WebSocket
    participant SMTP
    end
    participant Mailer

    Client-)WebSocket: subscribe
    Note right of Client: namespaced
    Mailer-)SMTP: send mail
    SMTP->>+WebSocket: get subscribers
    WebSocket-->>-SMTP: subscribers[ ]
    loop every subscriber
    SMTP-)WebSocket: forward mail
    end
    WebSocket-)Client: forward mail
    Note right of Client: namespaced
```

## Demo

```sh
[ ! -f .env ] && cp .env.example .env
yarn && yarn test
```

Optional:

- adjust workers with the `--workers <number>` flag
- set `DEBUG=1` for a nice wall of text (and useful debugging info)
- change `SMTP_SERVER_PORT` to avoid collisions

## Built with

- [mailparser](https://github.com/nodemailer/mailparser)
- [nanoid](https://github.com/ai/nanoid)
- [smtp-server](https://github.com/nodemailer/smtp-server)
- [ws](https://github.com/websockets/ws)
