/**
 * Pure JavaScript shim for react-native-background-timer.
 * Prevents native crash under React Native New Architecture (Fabric/TurboModules).
 */

const BackgroundTimer = {
  setTimeout: (fn, ms = 0) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms = 0) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  runBackgroundTimer: (fn, ms = 0) => setInterval(fn, ms),
  stopBackgroundTimer: () => {},
  start: () => {},
  stop: () => {},
};

module.exports = BackgroundTimer;
module.exports.default = BackgroundTimer;
