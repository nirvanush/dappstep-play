const path = require('path');

module.exports = {
  reactStrictMode: true,
  future: { webpack5: true },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    const wasmExtensionRegExp = /\.wasm$/;
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    if (!dev && isServer) {
      config.output.webassemblyModuleFilename = 'chunks/[id].wasm';
      config.plugins.push(new WasmChunksFixPlugin());
    }

    config.resolve.extensions.push('.wasm');
    config.module.rules.forEach((rule) => {
      (rule.oneOf || []).forEach((oneOf) => {
        if (oneOf.loader && oneOf.loader.indexOf('file-loader') >= 0) {
          oneOf.exclude.push(wasmExtensionRegExp);
        }
      });
    });

    // Add a dedicated loader for WASM
    config.module.rules.push({
      test: wasmExtensionRegExp,
      include: path.resolve(__dirname, 'src'),
      use: [{ loader: require.resolve('wasm-loader'), options: {} }],
    });
    return config;
  },
};

class WasmChunksFixPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('WasmChunksFixPlugin', (compilation) => {
      compilation.hooks.processAssets.tap({ name: 'WasmChunksFixPlugin' }, (assets) =>
        Object.entries(assets).forEach(([pathname, source]) => {
          if (!pathname.match(/\.wasm$/)) return;
          compilation.deleteAsset(pathname);

          const name = pathname.split('/')[1];
          const info = compilation.assetsInfo.get(pathname);
          compilation.emitAsset(name, source, info);
        }),
      );
    });
  }
}
