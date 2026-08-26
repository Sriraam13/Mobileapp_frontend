const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Limit maxWorkers to 2 to prevent memory crashes (OOM / Zone Allocation failed)
// on multi-core development environments with limited free memory.
config.maxWorkers = 2;

module.exports = config;
