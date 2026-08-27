const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Limit maxWorkers to 2 to prevent memory crashes (OOM / Zone Allocation failed)
// on multi-core development environments with limited free memory.
config.maxWorkers = 2;

// Use real web maps for web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return context.resolveRequest(context, '@teovilla/react-native-web-maps', platform);
  }
  // Ensure we fallback to the default resolver
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
