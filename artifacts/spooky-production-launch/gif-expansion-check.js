const fs = require('fs')
const ids = ['qzTjsnTf3JFxS','3o7TKSf6zEJCPq0Zwc','10m8P1WznJjLK8','11jokITGudhl8Q','l2SpQot6b4MxmsqOs','l2Sq22Pjha4pVTCYE','l2SpKbJsLnFOfvTDW','26uf31buHdxb2fYcw','t9xC86uywfQ1G','FfpwDJ7m228GA','R19DedSfkJdtv0VknG','MBUTbLepvhVD5cGnfz','LrcrCHk4PXDRS','122JKAK2BrDx8Q','NGDSQlPJiWImc','KsKuFJ062kmAoLsi9D','B3fnEdcns0bD2','eomy8S00ljwjK','qiFb2m5kSfyQrcXfFj','69FmYZBku9m81vhGH3','8Pd4vvz00KoZa','UePr0sPcSGPIY','FALQSnocJzr3y','3o72EWnHXUDOG4X7Ec','3o72F6tBnEy0Zfx26Y','xT8qB72Dfmxd8nv9DO','26BoCdWySqRcaupWw','lGXoEM0fcPxWE','wRsGJanSUAuha','a781MHjyuakcU','O8ZHE5GefZAli','UtEvubvQl0kAjNf4Wh']
async function main() {
  const report = []
  for (let start = 0; start < ids.length; start += 4) {
    report.push(...await Promise.all(ids.slice(start, start + 4).map(async id => {
      const source = `https://giphy.com/gifs/${id}`
      const html = await (await fetch(source)).text()
      const head = await fetch(`https://media.giphy.com/media/${id}/giphy.gif`, { method: 'HEAD' })
      return { id, source, title: html.match(/<title>(.*?)<\/title>/s)?.[1], status: head.status, type: head.headers.get('content-type') }
    })))
  }
  fs.writeFileSync('artifacts/spooky-production-launch/gif-expansion-assets.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
