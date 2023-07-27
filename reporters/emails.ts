import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter"
import { cwd } from "node:process"
import path from "path"

class MyReporter implements Reporter {
  failures: ReturnType<typeof this.buildFailureInfo>[] = []

  private buildFailureInfo(test: TestCase, result: TestResult) {
    const failedEmails = result.errors
      .map(
        (error) => error.value?.replaceAll("'", "").replaceAll('"', "") || ""
      )
      .filter((reason) => reason.startsWith("No email"))
      .map((reason) => reason.split(" ").pop())

    const absLocation = `${test.location.file}`
    const relLocation = path.relative(cwd(), absLocation)
    return {
      title: test.title,
      location: `${relLocation}:${test.location.line}:${test.location.column}`,
      annotations: test.annotations,
      suite: test.parent.parent?.title,
      failedEmails,
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== "failed") return

    // TODO: consider using annotations instead, i.e. call test.info().annotations.push() in fixture
    const failureInfo = this.buildFailureInfo(test, result)
    if (failureInfo.failedEmails.length) {
      this.failures.push(failureInfo)
    }
  }

  onEnd() {
    const TERM_COLOR_GREEN = "\x1b[32m"
    const TERM_COLOR_RED = "\x1b[31m"
    const TERM_COLOR_RESET = "\x1b[0m"

    const logWithColor = (message: string, color: string) =>
      console.log("%s%s%s", color, message, TERM_COLOR_RESET)
    const logFail = (message: string) => logWithColor(message, TERM_COLOR_RED)
    const logSuccess = (message: string) =>
      logWithColor(message, TERM_COLOR_GREEN)

    const spaces = (num: number) => "".padStart(num)

    console.log("\nEMAIL REPORT")

    if (!this.failures.length) {
      logSuccess("  All passed!")
      return
    }
    logFail(`${spaces(2)}${this.failures.length} failed due to emails`)
    this.failures.forEach((fail) => {
      logFail(`${spaces(4)}[${fail.suite}] › ${fail.location} › ${fail.title}`)
      fail.failedEmails.forEach((address) => {
        logFail(`${spaces(6)}${address}`)
      })
    })
  }
}

export default MyReporter
