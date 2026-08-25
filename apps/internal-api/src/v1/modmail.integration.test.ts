import { crudModmailConversation } from "@lib/dao/modmailConversation/crud"
import { crudModmailMessage } from "@lib/dao/modmailMessage/crud"
import { fetchModmailMessage } from "@lib/dao/modmailMessage/fetch"
import { db } from "@template-nextjs/db"
import { v7 } from "uuid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const suffix = v7().slice(0, 8)
const alice = v7()
const bob = v7()
const communityId = v7()

beforeAll(async () => {
  await db
    .insertInto("user")
    .values(
      [alice, bob].map((id, i) => ({
        id,
        username: `modmail-${suffix}-${i}`,
        email: `modmail-${suffix}-${i}@example.invalid`,
      })),
    )
    .execute()

  await db
    .insertInto("community")
    .values({
      id: communityId,
      name: `modmailtest${suffix}`,
      description: "modmail test",
      visibility: "public",
      memberCount: 0,
      createdByUserId: alice,
    })
    .execute()
})

afterAll(async () => {
  await db.deleteFrom("modmailConversation").where("communityId", "=", communityId).execute()
  await db.deleteFrom("community").where("id", "=", communityId).execute()
  await db.deleteFrom("user").where("id", "in", [alice, bob]).execute()
  await db.destroy()
})

describe("modmail internal notes", () => {
  it("hides internal notes from the participant but shows them to mods", async () => {
    const conversation = await crudModmailConversation(db).create({
      communityId,
      subject: "test subject",
      participantUserId: bob,
      folder: "new",
    })
    await crudModmailMessage(db).create({
      conversationId: conversation.id,
      authorUserId: bob,
      bodyMd: "user message",
      isInternalNote: false,
    })
    await crudModmailMessage(db).create({
      conversationId: conversation.id,
      authorUserId: alice,
      bodyMd: "internal note",
      isInternalNote: true,
    })

    const participantView = await fetchModmailMessage(db).listForConversation(
      conversation.id,
      false,
    )
    expect(participantView).toHaveLength(1)
    expect(participantView[0].isInternalNote).toBe(false)

    const modView = await fetchModmailMessage(db).listForConversation(conversation.id, true)
    expect(modView).toHaveLength(2)
    expect(modView.some((m) => m.isInternalNote)).toBe(true)
  })
})
