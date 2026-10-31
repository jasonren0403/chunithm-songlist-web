import { spawnSync } from "node:child_process"

if (!process.env.VERCEL) {
  console.log("Skipping private cover checkout outside Vercel.")
  process.exit(0)
}

const token = process.env.COVERS_READ_TOKEN
if (!token) {
  throw new Error("COVERS_READ_TOKEN is required to fetch the private covers submodule on Vercel.")
}

const configCount = Number(process.env.GIT_CONFIG_COUNT ?? "0")
if (!Number.isSafeInteger(configCount) || configCount < 0) {
  throw new Error("GIT_CONFIG_COUNT must be a non-negative integer.")
}

const env = {
  ...process.env,
  GIT_CONFIG_COUNT: String(configCount + 1),
  [`GIT_CONFIG_KEY_${configCount}`]: "http.https://github.com/.extraheader",
  [`GIT_CONFIG_VALUE_${configCount}`]: `AUTHORIZATION: basic ${Buffer.from(
    `x-access-token:${token}`,
  ).toString("base64")}`,
}

const result = spawnSync(
  "git",
  ["submodule", "update", "--init", "--recursive", "--", "public/images"],
  { env, stdio: "inherit" },
)

if (result.error) {
  throw result.error
}
if (result.status !== 0) {
  throw new Error(`Fetching the private covers submodule failed with exit code ${result.status}.`)
}
