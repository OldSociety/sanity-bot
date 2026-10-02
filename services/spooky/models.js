const { DataTypes } = require('sequelize')

// Dependency injection keeps offline fixtures independent from the bot's real connection.
// Define models only: never sync, migrate, connect, or import the global Models/model module.
function defineSpookyModels(sequelize) {
  const string = { type: DataTypes.STRING, allowNull: false }
  const integer = (defaultValue, min) => ({ type: DataTypes.INTEGER, allowNull: false, defaultValue, validate: { isInt: true, ...(min !== undefined && { min }) } })
  const scope = { eventId: { ...string }, guildId: { ...string } }
  const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }
  // Sequelize normalizes/mutates attribute objects. Never share them between
  // models, or a field such as userId can leak into unrelated table definitions.
  const define = (name, fields) => sequelize.define(name, Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key,
      value && typeof value === 'object' && 'type' in value
        ? { ...value, ...(value.validate && { validate: { ...value.validate } }) }
        : value,
    ]),
  ), { tableName: name, timestamps: false })
  const Participant = define('SpookyParticipants', {
    id, ...scope, userId: string, registeredAt: DataTypes.DATE,
    refillAnchor: { type: DataTypes.DATE, allowNull: false }, lastActive: DataTypes.DATE,
    candy: { ...integer(10, 0), validate: { isInt: true, min: 0, max: 80 } }, eyes: integer(0, 0),
    treatPrestige: integer(0), trickPrestige: integer(0),
  })
  const Inventory = define('SpookyInventory', {
    id, participantId: { type: DataTypes.INTEGER, allowNull: false }, pieceId: string, quantity: integer(1, 1),
  })
  const Effect = define('SpookyEffects', {
    id, participantId: { type: DataTypes.INTEGER, allowNull: false }, effectType: string,
    expiresAt: { type: DataTypes.DATE, allowNull: false }, metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  })
  const Operation = define('SpookyOperations', {
    operationId: { ...string, primaryKey: true }, interactionId: DataTypes.STRING, ...scope,
    actorId: string, operationType: string, receipt: DataTypes.JSON,
    createdAt: { type: DataTypes.DATE, allowNull: false }, completedAt: DataTypes.DATE,
  })
  const Ledger = define('SpookyLedger', {
    id, operationId: string, interactionId: DataTypes.STRING, ...scope,
    userId: string, actorId: string, operationType: string, resource: string,
    delta: { type: DataTypes.INTEGER, allowNull: false }, before: DataTypes.INTEGER, after: DataTypes.INTEGER,
    relatedUserId: DataTypes.STRING, metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    configVersion: { type: DataTypes.INTEGER, allowNull: false }, timestamp: { type: DataTypes.DATE, allowNull: false },
  })
  const EventState = define('SpookyEventStates', {
    id, ...scope, configVersion: integer(1, 1), actionsPaused: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    pauseReason: DataTypes.STRING, archivedAt: DataTypes.DATE,
  })
  const Delivery = define('SpookyDeliveries', {
    id, ...scope, userId: string, kind: string, revision: string,
    payload: { type: DataTypes.JSON, allowNull: false },
    status: { ...string, defaultValue: 'pending' }, lastError: DataTypes.TEXT,
  })
  const Notification = define('SpookyNotifications', {
    id, operationId: string, ordinal: { type: DataTypes.INTEGER, allowNull: false }, channelId: string,
    payload: { type: DataTypes.JSON, allowNull: false }, status: { ...string, defaultValue: 'pending' },
    messageId: DataTypes.STRING, lastError: DataTypes.TEXT,
  })
  return { Participant, Inventory, Effect, Operation, Ledger, EventState, Delivery, Notification }
}

module.exports = { defineSpookyModels }
