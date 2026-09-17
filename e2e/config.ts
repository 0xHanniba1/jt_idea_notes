// These credentials are fixtures for the explicitly disposable fider-e2e container only.
export const fixtureAccounts = {
  admin: { username: "e2e.admin", name: "E2E Administrator", temporaryPassword: "E2e-Temp9!aQ", password: "E2e-Admin8!q" },
  member: { username: "e2e.member", name: "E2E Member", temporaryPassword: "E2e-Temp7!mQ", password: "E2e-Member7!" },
} as const

export type FixtureAccount = keyof typeof fixtureAccounts

export function getBaseURL(): string {
  const value = process.env.E2E_BASE_URL || "http://127.0.0.1:3000"
  const url = new URL(value)
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("E2E_BASE_URL must be an HTTP loopback origin with an explicit port for the disposable test container.")
  }
  return url.origin
}
