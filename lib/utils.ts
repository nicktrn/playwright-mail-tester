import fs from "node:fs"

export const createTestFiles = (num: number) => {
  if (process.env.TEST_WORKER_INDEX) return // only run on init

  const numOfFiles = num < 1 ? 1 : num

  const TEST_DIR = "tests"
  const BASE_FILE = "base.spec.ts"
  const COPY_PREFIX = "copy"

  const existingCopies = fs
    .readdirSync(TEST_DIR)
    .filter((filename) => filename !== BASE_FILE)

  const toCreate = [...Array(numOfFiles - 1)].map(
    (val, i) => `${COPY_PREFIX}-${i + 1}.spec.ts`
  )
  const toRemove = existingCopies.filter(
    (filename) => !toCreate.includes(filename)
  )

  toCreate.forEach((dest) =>
    fs.copyFileSync(`${TEST_DIR}/${BASE_FILE}`, `${TEST_DIR}/${dest}`)
  )

  toRemove.forEach((filename) => fs.rmSync(`${TEST_DIR}/${filename}`))

  if (process.env.DEBUG) {
    console.log("createTestFiles", { existingCopies, toCreate, toRemove })
  }
}
