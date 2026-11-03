// Serializable, separate streams: a restart consumes the next saved draw.
function initial(seed) {
  return {
    combat: seed >>> 0 || 1,
    buttons: (seed ^ 0x9e3779b9) >>> 0 || 1,
    discovery: (seed ^ 0x85ebca6b) >>> 0 || 1
  };
}
function streams(saved) {
  return Object.fromEntries(
    Object.keys(saved).map((key) => [
      key,
      () => {
        let x = saved[key];
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        saved[key] = x >>> 0;
        return saved[key] / 4294967296;
      }
    ])
  );
}
module.exports = { initial, streams };
