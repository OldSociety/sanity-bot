const fs=require('fs'),path=require('path');const environment=process.argv[2]
if(!['development','production'].includes(environment))throw Error('Explicit environment required')
process.env.NODE_ENV=environment
const runtime=require('../../config/runtime').loadDiscordEnvironment(environment)
const {REST,Routes}=require('discord.js'),rest=new REST().setToken(process.env.TOKEN)
;(async()=>{const rows=await rest.get(Routes.channelMessages(process.env.SPOOKYCHANNELID),{query:new URLSearchParams({limit:'50'})})
const result=rows.filter(row=>row.author.id===runtime.clientId && row.embeds?.length).map(row=>({at:row.timestamp,
localTime:new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(row.timestamp)),
title:row.embeds[0].title,outsideUserTags:/<@!?\d+>/.test(row.content||''),insideUserTags:row.embeds.some(e=>/<@!?\d+>/.test(e.description||''))}))
fs.writeFileSync(path.join(__dirname,'quiet-mentions-'+environment+'-recent-messages.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({environment,messages:result.slice(0,14)},null,2))
})().catch(e=>{console.error(e.message);process.exitCode=1})
