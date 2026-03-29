module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Allow parsing import.meta syntax from Zustand ESM builds
      '@babel/plugin-syntax-import-meta',
      // Transform import.meta to empty object so import.meta.env returns undefined
      // Required because Zustand v5 ESM uses import.meta.env in middleware.mjs
      function replaceImportMeta() {
        return {
          visitor: {
            MetaProperty(path) {
              if (
                path.node.meta &&
                path.node.meta.name === 'import' &&
                path.node.property &&
                path.node.property.name === 'meta'
              ) {
                path.replaceWithSourceString('({env:{}})');
              }
            },
          },
        };
      },
    ],
  };
};
