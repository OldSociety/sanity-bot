const { createStore } = require('../../services/checkins/storage/sqlite-store')
const { createController } = require('../../services/checkins/application/controller')

function fixture(store = createStore()) {
  let sequence = 0
  let env = 'development'
  let owner = 'owner'
  let dmError = null
  let now = 1800000000000
  const messages = new Map(), sent = [], edits = []
  const config = { development: { testCommandEnabled: true, guildId: 'dev', commandChannelId: 'review', reviewGuildId: 'dev', reviewChannelId: 'review' }, campaigns: { monday: { name: 'Monday party' }, wednesday: { name: 'WednesdaysinHell' } } }
  const user = { id: 'owner', username: 'Test Owner', displayAvatarURL: () => null,
    createDM: async () => ({ id: 'dm', messages: { fetch: async id => messages.get(id) } }), send: async payload => { if (dmError) throw dmError; return send('dm', payload) } }
  const member = { id: 'owner', user, displayName: 'Owner', joinedTimestamp: 100000, roles: { cache: new Map() } }
  const guild = { get ownerId() { return owner }, members: { fetch: async () => member, fetchMe: async () => ({}) } }
  const channel = { id: 'review', guildId: 'dev', type: 0, guild,
    permissionsFor: () => ({ has: () => true }), send: async payload => send('review', payload),
    messages: { fetch: async id => { if (!messages.has(id)) throw Error('Missing message'); return messages.get(id) } } }
  function send(destination, payload) {
    const message = { id: `msg${++sequence}`, payload, edit: async next => { edits.push(next); message.payload = next; return message } }
    messages.set(message.id, message); sent.push({ destination, ...message }); return message
  }
  const client = { guilds: { fetch: async () => guild }, channels: { fetch: async () => channel }, users: { fetch: async () => user } }
  const controller = createController({ store, config: () => config, environment: () => env, botAdminId: () => 'owner', clock: () => now })
  function interaction(extra = {}) {
    return { id: `interaction${++sequence}`, client, user, guildId: null, channelId: 'dm',
      isModalSubmit: () => false,
      deferReply: async () => {}, editReply: async payload => { edits.push(payload) },
      showModal: async modal => { edits.push(modal.toJSON()) }, ...extra }
  }
  async function begin(campaign = 'monday') {
    await controller.test(interaction({ guildId: 'dev', channelId: 'review', options: { getString: () => campaign } }))
    return (await store.list()).at(-1)
  }
  async function click(record, action, extra = {}) {
    const current = await store.get(record.id)
    const review = /^(accept|deny)/.test(action)
    const delivery = (await store.deliveries(record.id)).find(x => review ? x.kind === 'review' : x.key === `${record.id}:${current.status === 'INVITED' ? `invite:${current.revision > 0 ? current.revision : ''}` : `prompt:${current.revision}`}`)
    await controller.handle(interaction({ customId: `ci:${record.id}:${current.revision}:${action}`,
      message: { id: delivery?.message }, ...(review ? { guildId: 'dev', channelId: 'review' } : {}), ...extra }))
    return store.get(record.id)
  }
  const text = value => ({ isModalSubmit: () => true, fields: { getTextInputValue: () => value } })
  return { store, controller, sent, edits, config, channel, guild, member, user, client, messages, begin, click, text, interaction,
    setNow: value => { now = value },
    setEnv: value => { env = value }, setOwner: value => { owner = value }, setDMError: value => { dmError = value } }
}

module.exports = { fixture }
