const { canUse, specialSlots } = require('../../services/arena/rules')
const { preview } = require('../../services/arena/tactics')

function empty() {
  return {
    opportunities: 0,
    reasons: {},
    guaranteedAvailable: 0,
    guaranteedTaken: 0,
    guaranteedMissed: 0,
    lethalOnHitAvailable: 0,
    lethalOnHitTaken: 0,
    avoidedExhaustion: 0,
    exhaustedForKnockout: 0,
    savedForFinisher: 0,
    limitedSurvivalS2: 0,
    avoidedRefresh: 0,
    knockoutSources: { basic: 0, special1: 0, special2: 0, special3: 0 },
  }
}

function record(row, actor, target, resource, decision, choice = 3) {
  row.opportunities++
  const base = preview(actor, target, null, choice)
  const candidates = specialSlots
    .filter((slot) => canUse({ ...actor, hope: resource }, slot))
    .map((slot) => preview(actor, target, slot, choice))
  const chosen = decision?.slot
    ? candidates.find((item) => item.slot === decision.slot)
    : base
  const guaranteed =
    !base.guaranteed && candidates.some((item) => item.guaranteed)
  row.guaranteedAvailable += Number(guaranteed)
  row.guaranteedTaken += Number(guaranteed && chosen?.guaranteed)
  row.guaranteedMissed += Number(guaranteed && !chosen?.guaranteed)
  const onHit =
    actor.isAI &&
    candidates.some(
      (item) =>
        item.knockout > base.knockout + 0.1 &&
        item.knockout >= actor.accuracy / 100 - 1e-9,
    )
  row.lethalOnHitAvailable += Number(onHit)
  row.lethalOnHitTaken += Number(
    onHit && chosen?.knockout >= actor.accuracy / 100 - 1e-9,
  )
  for (const key of [
    'avoidedExhaustion',
    'exhaustedForKnockout',
    'savedForFinisher',
    'avoidedRefresh',
  ])
    row[key] += Number(Boolean(decision?.[key]))
  row.limitedSurvivalS2 += Number(
    decision?.reason === 'limited-survival' && decision.slot === 'special2',
  )
  const reason = decision?.reason || 'legacy'
  row.reasons[reason] = (row.reasons[reason] || 0) + 1
}

function knockout(row, before, after, side) {
  const target = side === 'player' ? 'enemy' : 'player'
  if (before[target].hp <= 0 || after[target].hp > 0) return
  // Exactly one source removes the final HP. Stats allocate basic, then its
  // existing buff, then any selected direct special; overkill is excluded.
  const source = Object.keys(row.knockoutSources)
    .filter(
      (key) =>
        after.statistics[side].hpDamageBySource[key] >
        before.statistics[side].hpDamageBySource[key],
    )
    .at(-1)
  // S2 buff precedes S1 in the real allocation order when both occur together.
  const lastDirect = after.enemySpecial
  const selected =
    side === 'enemy'
      ? lastDirect
      : after.history
          .filter(
            (event) =>
              event.tick === after.tick &&
              event.kind === 'special' &&
              event.resource !== 'Fear',
          )
          .at(0)?.slot
  const directHasHp =
    selected &&
    selected !== 'special2' &&
    after.statistics[side].hpDamageBySource[selected] >
      before.statistics[side].hpDamageBySource[selected]
  if (source) row.knockoutSources[directHasHp ? selected : source]++
}

module.exports = { empty, record, knockout }
