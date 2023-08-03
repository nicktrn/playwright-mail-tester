import { test as base } from "@playwright/test"

import { createEmailsFixture } from "../fixtures/emails"
import { sendMail } from "../lib/send-mail"

export const test = base.extend<{
  emails: ReturnType<typeof createEmailsFixture>
}>({
  emails: async ({ page }, use) => {
    const emails = createEmailsFixture(page)
    await emails.start()
    await use(emails)
    await emails.stop()
  },
})

const loops = Number(process.env.MAILTEST_LOOPS_PER_TEST) || 1
const emailsPerLoop = Number(process.env.MAILTEST_EMAILS_PER_LOOP) || 50

for (let i = 1; i <= loops; i++) {
  test.skip(`waitForOne-${i}`, async ({ page, emails }, testInfo) => {
    await page.goto("about:blank")

    const to = emails.generateAddress()
    const subject = testInfo.titlePath.join(" ")

    sendMail({ to, subject })

    const email = await emails.waitForOne(to)
    await email.open()
    await email.getCallToAction().click()
  })

  test.skip(`failOne-${i}`, async ({ emails }) => {
    sendMail({ to: "nobody@example.com" })
    await emails.waitForOne("fail@example.com", { timeout: 1_000 })
  })

  test.skip(`waitForOneWithCustomProp-${i}`, async ({ emails }) => {
    const to = emails.generateAddress()

    // string param - recipient address only
    await sendMail({ to })
    await emails.getOne(to)

    // object param - with custom prop filter
    await sendMail({ to })
    await emails.getOne({ to, foo: "bar" })
  })

  test(`waitForMany-${i}`, async ({ emails }, testInfo) => {
    const toMany = Array(emailsPerLoop)
      .fill(null)
      .map(() => emails.generateAddress())
    const subject = testInfo.titlePath.join(" ")

    Promise.all(toMany.map((to) => sendMail({ to, subject }))) // wait for successful sends
    // toMany.forEach((to) => sendMail({ to, subject })) // send in background

    await emails.waitForMany(toMany)
  })
}
