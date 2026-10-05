// Transparent UI overlays aligned to the black hole in the unchanged landscape.
const stages = ['lost', 'waning', 'fraying', 'fading', 'steady']
const placement = { left: 924, top: 18, width: 240, height: 160, centerX: 1044, centerY: 82 }
function sanityStage({ balance, maximum }) {
  if (!Number.isFinite(balance) || !Number.isFinite(maximum) || maximum <= 0 || balance < 0 || balance > maximum) throw new Error('Invalid Sanity display balance')
  const percent = balance / maximum * 100
  return percent === 0 ? 'lost' : percent < 25 ? 'waning' : percent < 50 ? 'fraying' : percent < 70 ? 'fading' : 'steady'
}
function eyeSvg(stage = 'steady') {
  const index = stages.indexOf(stage)
  if (index < 0) throw new Error('Unknown Sanity eye stage')
  const stress = 4 - index, color = ['#d35870', '#ae425e', '#8688ab', '#74b4cc', '#659aaf'][index]
  const radius = [43, 40, 36, 32, 30][index]
  const edge = Array.from({ length: 81 }, (_, i) => {
    const angle = i / 80 * Math.PI * 2
    const ripple = stress >= 2 ? (stress - 1) * Math.sin(angle * 7 + .4) + Math.sin(angle * 11) : 0
    const r = radius + ripple
    return `${i ? 'L' : 'M'}${(120 + Math.cos(angle) * r).toFixed(2)} ${(64 + Math.sin(angle) * r).toFixed(2)}`
  }).join(' ') + 'Z'
  const fibers = Array.from({ length: 38 }, (_, i) => {
    const a = i / 38 * Math.PI * 2, inner = 13 + Math.sin(i * 2.7) * 2, outer = radius - 5 + Math.cos(i * 1.8) * 2
    return `<path d="M${120 + Math.cos(a) * inner} ${64 + Math.sin(a) * inner} Q${120 + Math.cos(a + .06) * 24} ${64 + Math.sin(a + .06) * 24} ${120 + Math.cos(a) * outer} ${64 + Math.sin(a) * outer}"/>`
  }).join('')
  // High Sanity preserves the original dark center, adding only a faint halo.
  const iris = index === 4 ? '' : `<path d="${edge}" fill="url(#iris)" fill-opacity="${index === 3 ? .48 : .85}"/>
    <g fill="none" stroke="${color}" stroke-width=".8" opacity="${index === 3 ? .24 : .5}">${fibers}</g>
    <ellipse cx="120" cy="64" rx="${index === 3 ? 14 : index === 2 ? 16 : 19}" ry="${index === 3 ? 19 : index === 2 ? 24 : 29}" fill="#020a12" fill-opacity=".92"/>
    ${stress >= 2 ? `<path d="M112 40l7 11-4 11 9 10-6 16" fill="none" stroke="${color}" stroke-width="1.4" opacity=".65"/>` : ''}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
    <defs><radialGradient id="halo"><stop offset=".50" stop-color="${color}" stop-opacity="0"/><stop offset=".67" stop-color="${color}" stop-opacity="${index === 4 ? .10 : .25 + stress * .07}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <radialGradient id="iris"><stop stop-color="#041322"/><stop offset=".65" stop-color="${color}"/><stop offset="1" stop-color="#0b1c2e"/></radialGradient></defs>
    <ellipse cx="120" cy="64" rx="${54 + stress * 4}" ry="${51 + stress * 3}" fill="url(#halo)"/>
    ${iris}
    <path d="${edge}" fill="none" stroke="${color}" stroke-width="${index === 4 ? 1 : 1.5}" opacity="${index === 4 ? .35 : .75}"/>
    ${index === 0 ? '<path d="M70 54l10 4-4 8m86-29-8 11 9 8m-83 30 9-8-4-9m66 35-8-12 6-9" fill="none" stroke="#d35870" stroke-width="1.2" opacity=".7"/>' : ''}
  </svg>`
}
module.exports = { sanityStage, eyeSvg, stages, placement }
