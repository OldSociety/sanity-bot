const FIRST = 'snowman-1';
function catalog(settings) {
  return settings.snowmen || [{id:FIRST,name:'Sturdy Snowman',baseHp:settings.sturdyBaseHp,damage:settings.enemyDamage,intervalMs:settings.enemyIntervalMs,sweat:settings.sweatPerVictory}];
}
function wins(state, id = state.snowmanId || FIRST) {
  return state.snowmanWins?.[id] ?? (id === FIRST ? state.defeated : 0);
}
function available(state, settings) {
  return catalog(settings).filter((enemy,index,list)=>!index || wins(state,list[index-1].id)>=(list[index-1].killsToUnlockNext ?? settings.challengerVictories));
}
function current(state, settings) {
  return catalog(settings).find(enemy=>enemy.id===(state.snowmanId || FIRST)) || catalog(settings)[0];
}
function select(state, id, settings) {
  const enemy=available(state,settings).find(enemy=>enemy.id===id);
  if(!enemy)return 'This snowman is not unlocked yet.';
  state.snowmanId=id;
  return null;
}
module.exports={FIRST,catalog,wins,available,current,select};
