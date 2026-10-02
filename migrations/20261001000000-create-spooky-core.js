'use strict'

// SQLite is the configured runtime. Explicit checks also protect raw SQL/admin writes.
// No existing User/SpookyStat/Holiday tables or artwork-dependent badge tables change.
const tables = [
  ['SpookyEventStates', `
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL, "guildId" TEXT NOT NULL,
    "configVersion" INTEGER NOT NULL CHECK(typeof("configVersion") = 'integer' AND "configVersion" > 0),
    "actionsPaused" INTEGER NOT NULL DEFAULT 0 CHECK("actionsPaused" IN (0,1)),
    "pauseReason" TEXT, "archivedAt" DATETIME,
    UNIQUE("eventId", "guildId")`],
  ['SpookyParticipants', `
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL, "guildId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "registeredAt" DATETIME, "refillAnchor" DATETIME NOT NULL, "lastActive" DATETIME,
    "candy" INTEGER NOT NULL DEFAULT 10 CHECK(typeof("candy") = 'integer' AND "candy" BETWEEN 0 AND 80),
    "eyes" INTEGER NOT NULL DEFAULT 0 CHECK(typeof("eyes") = 'integer' AND "eyes" >= 0),
    "treatPrestige" INTEGER NOT NULL DEFAULT 0 CHECK(typeof("treatPrestige") = 'integer'),
    "trickPrestige" INTEGER NOT NULL DEFAULT 0 CHECK(typeof("trickPrestige") = 'integer'),
    UNIQUE("eventId", "guildId", "userId")`],
  ['SpookyInventory', `
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "participantId" INTEGER NOT NULL REFERENCES "SpookyParticipants"("id") ON DELETE CASCADE,
    "pieceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL CHECK(typeof("quantity") = 'integer' AND "quantity" > 0),
    UNIQUE("participantId", "pieceId")`],
  ['SpookyEffects', `
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "participantId" INTEGER NOT NULL REFERENCES "SpookyParticipants"("id") ON DELETE CASCADE,
    "effectType" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, "metadata" JSON NOT NULL DEFAULT '{}',
    UNIQUE("participantId", "effectType")`],
  ['SpookyOperations', `
    "operationId" TEXT PRIMARY KEY NOT NULL,
    "interactionId" TEXT UNIQUE, "eventId" TEXT NOT NULL, "guildId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL, "operationType" TEXT NOT NULL,
    "receipt" JSON, "createdAt" DATETIME NOT NULL, "completedAt" DATETIME`],
  ['SpookyLedger', `
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "operationId" TEXT NOT NULL REFERENCES "SpookyOperations"("operationId") ON DELETE RESTRICT,
    "interactionId" TEXT, "eventId" TEXT NOT NULL, "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "operationType" TEXT NOT NULL,
    "resource" TEXT NOT NULL, "delta" INTEGER NOT NULL CHECK(typeof("delta") = 'integer'),
    "before" INTEGER CHECK("before" IS NULL OR typeof("before") = 'integer'),
    "after" INTEGER CHECK("after" IS NULL OR typeof("after") = 'integer'),
    "relatedUserId" TEXT, "metadata" JSON NOT NULL DEFAULT '{}',
    "configVersion" INTEGER NOT NULL, "timestamp" DATETIME NOT NULL`],
]

module.exports = {
  async up(queryInterface, { transaction } = {}) {
    const apply = async transaction => {
      for (const [name, columns] of tables) {
        await queryInterface.sequelize.query(`CREATE TABLE "${name}" (${columns})`, { transaction })
      }
      await queryInterface.addIndex('SpookyLedger', ['eventId', 'guildId', 'userId', 'timestamp'], { name: 'spooky_ledger_player_time', transaction })
      await queryInterface.addIndex('SpookyEffects', ['expiresAt'], { name: 'spooky_effect_expiry', transaction })
    }
    // The storage runner owns schema + provenance atomically. Standalone callers
    // retain the original transaction behavior; never nest BEGIN in its batch.
    if (transaction) await apply(transaction)
    else await queryInterface.sequelize.transaction(apply)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      // Audit tables are removed only by explicit migration rollback, never a seasonal reset.
      for (const [name] of [...tables].reverse()) await queryInterface.dropTable(name, { transaction })
    })
  },
}
