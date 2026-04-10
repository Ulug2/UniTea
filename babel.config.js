module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo adds react-native-reanimated/plugin when the package is installed; do not duplicate it.
  return {
    presets: ["babel-preset-expo"],
  };
};
