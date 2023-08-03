import { faker } from "@faker-js/faker"
import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import escapeStringRegexp from "escape-string-regexp"

import MailClient from "../lib/mail-client"
import { DEFAULT_NAMESPACE_MODE, NamespaceMode } from "../lib/mail-server"

const DEFAULT_EMAIL_TIMEOUT = 5000

export const parallelWorkerNamespace = `${process.env.TEST_WORKER_INDEX}-${process.env.TEST_PARALLEL_INDEX}`

export const generateNamespacedEmailAddress = (mode: NamespaceMode) => {
  switch (mode) {
    case "prepend":
      return `${parallelWorkerNamespace}${faker.internet.email()}`
    case "subdomain":
      return faker.internet.email({
        provider: `${parallelWorkerNamespace}.${faker.internet.domainName()}`,
      })
  }
}

export class EmailsFixture {
  constructor(page: Page, namespaced = true, mode?: NamespaceMode) {
    this.namespace = namespaced ? parallelWorkerNamespace : ""
    this.namespaceMode = mode ?? DEFAULT_NAMESPACE_MODE
    this.mailClient = new MailClient(this.namespace, this.namespaceMode)
    this.page = page
  }

  private mailClient: MailClient
  private namespace: string
  private namespaceMode: NamespaceMode
  private page: Page

  start = () => this.mailClient.start()
  stop = () => this.mailClient.stop()

  generateAddress = () =>
    generateNamespacedEmailAddress(this.namespaceMode).toLowerCase()

  getOne = (
    opts: string | Record<string, string>,
    { timeout = DEFAULT_EMAIL_TIMEOUT } = {}
  ) => this.mailClient.getOne(opts, { timeout })

  waitForOne = async (
    recipient: string,
    { timeout = DEFAULT_EMAIL_TIMEOUT } = {}
  ) => {
    // TODO: ability to search for more than just recipient
    const email = await this.mailClient.waitForEmail(recipient, { timeout })
    let hasBeenOpened = false

    return {
      ...email,
      getCallToAction: () => {
        const cta = this.page.getByTestId("cta-link")
        cta.click = async () => {
          expect(hasBeenOpened).toBeTruthy()
          const ctaHref = await cta.getAttribute("href")
          expect(ctaHref).not.toBeNull()
          await this.page.goto(ctaHref as string)
          // TODO: simulate real click (probably not as performant)
          // const popupPromise = this.page.waitForEvent("popup");
          // await this.page.getByTestId("cta-link").click();
          // return popupPromise;
        }
        return cta
      },
      // quick way to get a link via partial string match, e.g. findHref("verify") -> "https://example.com/verify-email"
      findHref: (partial: string) =>
        email.text.match(
          new RegExp(`https?://\\S*${escapeStringRegexp(partial)}\\S*`)
        )?.[0] || "",
      open: async () => {
        expect(email.html).toBeTruthy()
        hasBeenOpened = true
        // creates a history entry to make page.goBack() work as expected
        await this.page.goto("about:blank")
        return this.page.setContent(email.html)
      },
    }
  }

  // FIXME: improve error output for multiple failed emails (allSettled)
  waitForMany = (
    recipients: string[],
    { timeout = DEFAULT_EMAIL_TIMEOUT } = {}
  ) =>
    Promise.all(
      recipients.map((recipient) => this.waitForOne(recipient, { timeout }))
    )
}

export const createEmailsFixture = (
  ...args: ConstructorParameters<typeof EmailsFixture>
) => new EmailsFixture(...args)
