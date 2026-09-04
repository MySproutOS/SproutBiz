import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export function fetchUserExternalIdentity(db: Kysely<DB>) {
  async function getForUser(
    userId: string,
    provider: string,
  ): Promise<Selectable<DB["userExternalIdentity"]> | undefined> {
    return await db
      .selectFrom("userExternalIdentity")
      .selectAll()
      .where("userId", "=", userId)
      .where("provider", "=", provider)
      .executeTakeFirst()
  }

  async function getBySubject(
    provider: string,
    providerSubject: string,
  ): Promise<Selectable<DB["userExternalIdentity"]> | undefined> {
    return await db
      .selectFrom("userExternalIdentity")
      .selectAll()
      .where("provider", "=", provider)
      .where("providerSubject", "=", providerSubject)
      .executeTakeFirst()
  }

  async function listVerified(provider: string): Promise<Selectable<DB["userExternalIdentity"]>[]> {
    return await db
      .selectFrom("userExternalIdentity")
      .selectAll()
      .where("provider", "=", provider)
      .orderBy("createdAt", "asc")
      .execute()
  }

  return { getForUser, getBySubject, listVerified }
}
