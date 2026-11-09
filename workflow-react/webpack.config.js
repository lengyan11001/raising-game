const path = require('path');

const isProduction = process.env.NODE_ENV !== 'development';
const extraNodeModules = String(process.env.CANVAS_NODE_MODULES || '').trim();
const dependencyModules = [
  path.resolve(__dirname, 'node_modules'),
  ...(extraNodeModules ? [path.resolve(extraNodeModules)] : []),
  'node_modules',
];

module.exports = {
  mode: isProduction ? 'production' : 'development',
  entry: path.resolve(__dirname, 'src/index.js'),
  devtool: isProduction ? false : 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'canvas.js',
    clean: false,
    library: { type: 'umd' },
  },
  module: {
    rules: [
      { test: /\.js$/, exclude: /node_modules/, use: 'babel-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.(png|svg|jpg|jpeg|gif|webp|woff|woff2)$/i, type: 'asset/resource', generator: { filename: 'assets/[name][ext]' } },
    ],
  },
  resolve: {
    extensions: ['.js', '.json'],
    modules: [
      ...dependencyModules,
    ],
  },
  resolveLoader: {
    modules: [
      ...dependencyModules,
    ],
  },
  optimization: { minimize: true },
  ignoreWarnings: [{ module: /@ffmpeg[\\/]ffmpeg/, message: /Critical dependency/ }],
};
