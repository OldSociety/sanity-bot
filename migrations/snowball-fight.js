// Additive and idempotent. Historical Winter data is never repurposed or removed.
const statements = [
  `CREATE TABLE IF NOT EXISTS SnowFightPlayers (
    guildId TEXT NOT NULL, userId TEXT NOT NULL, state TEXT NOT NULL,
    snowballs INTEGER NOT NULL CHECK(snowballs >= 0),
    buttons INTEGER NOT NULL CHECK(buttons >= 0), throws INTEGER NOT NULL DEFAULT 0,
    hits INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, badges INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(guildId,userId))`,
  ...['hits', 'throws', 'wins', 'badges'].map(column =>
    `CREATE INDEX IF NOT EXISTS SnowFight_rank_${column} ON SnowFightPlayers(guildId,${column} DESC,userId)`),
  `CREATE TABLE IF NOT EXISTS SnowFightReceipts (
    id TEXT PRIMARY KEY, identity TEXT NOT NULL, response TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS SnowFightLedger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, interactionId TEXT NOT NULL, guildId TEXT NOT NULL,
    userId TEXT NOT NULL, resource TEXT NOT NULL, delta INTEGER NOT NULL, balance INTEGER NOT NULL,
    reason TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS SnowFight_ledger_user ON SnowFightLedger(guildId,userId,at)`,
  `CREATE TABLE IF NOT EXISTS SnowFightDaily (
    guildId TEXT NOT NULL,userId TEXT NOT NULL,day TEXT NOT NULL,PRIMARY KEY(guildId,userId,day))`,
  `CREATE TABLE IF NOT EXISTS SnowFightQuestClaims (
    guildId TEXT NOT NULL,userId TEXT NOT NULL,day TEXT NOT NULL,questId TEXT NOT NULL,
    PRIMARY KEY(guildId,userId,day,questId))`,
  `CREATE TABLE IF NOT EXISTS SnowFightAchievements (
    guildId TEXT NOT NULL,userId TEXT NOT NULL,achievementId TEXT NOT NULL,at INTEGER NOT NULL,
    PRIMARY KEY(guildId,userId,achievementId))`,
  `CREATE TABLE IF NOT EXISTS SnowFightCharacterDays (
    guildId TEXT NOT NULL,userId TEXT NOT NULL,characterId TEXT NOT NULL,day TEXT NOT NULL,
    PRIMARY KEY(guildId,userId,characterId,day))`,
  `CREATE TABLE IF NOT EXISTS SnowFightBadgeProgress (
    guildId TEXT NOT NULL,userId TEXT NOT NULL,characterId TEXT NOT NULL,marks INTEGER NOT NULL,
    PRIMARY KEY(guildId,userId,characterId))`,
  `CREATE TABLE IF NOT EXISTS SnowFightBattles (
    guildId TEXT NOT NULL,userId TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(guildId,userId))`,
  `CREATE TABLE IF NOT EXISTS SnowFightEncounters (
    id TEXT PRIMARY KEY,guildId TEXT NOT NULL,userId TEXT NOT NULL,characterId TEXT NOT NULL,
    outcome TEXT NOT NULL,rounds INTEGER NOT NULL,snowballs INTEGER NOT NULL,at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS SnowFightThrows (
    id TEXT PRIMARY KEY,guildId TEXT NOT NULL,attacker TEXT NOT NULL,target TEXT NOT NULL,
    hit INTEGER NOT NULL,reward INTEGER NOT NULL,at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS SnowFight_pair ON SnowFightThrows(guildId,attacker,target,at)`,
  `CREATE TABLE IF NOT EXISTS SnowFightGifts (
    id TEXT PRIMARY KEY,guildId TEXT NOT NULL,sender TEXT NOT NULL,recipient TEXT NOT NULL,
    amount INTEGER NOT NULL,at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS BadgeOwnership (
    guildId TEXT NOT NULL,userId TEXT NOT NULL,badgeId TEXT NOT NULL,sourceEventId TEXT NOT NULL,
    awardedAt DATETIME NOT NULL,PRIMARY KEY(guildId,userId,badgeId))`
]
async function up(queryInterface, { transaction } = {}) {
  for (const sql of statements) await queryInterface.sequelize.query(sql, { transaction })
}
// Deliberately no destructive down migration: collectible and ledger history is durable.
module.exports = { up, statements }
