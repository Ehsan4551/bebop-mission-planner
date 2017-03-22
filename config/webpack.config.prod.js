
const helpers = require('./helpers');
const webpackMerge = require('webpack-merge'); // used to merge webpack configs
const commonConfig = require('./webpack.config.common.js'); // the common settings

/**
 * Webpack Plugins
 */
const DefinePlugin = require('webpack/lib/DefinePlugin');
const UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin');
const WebpackMd5Hash = require('webpack-md5-hash');
const LoaderOptionsPlugin = require('webpack/lib/LoaderOptionsPlugin');

/**
 * Webpack Constants
 */
const ENV = process.env.NODE_ENV = process.env.ENV = 'production';
// const API_URL = process.env.API_URL = 'localhost';
const API_PORT = process.env.API_PORT = 4000;
const HMR = helpers.hasProcessFlag('hot');
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8080;

const METADATA = webpackMerge(commonConfig({ env: ENV }).metadata, {
    host: HOST,
    // API_URL: API_URL,
    API_PORT: API_PORT,
    PORT: PORT,
    ENV: ENV,
    HMR: HMR
});

module.exports = function (env) {
    return webpackMerge(commonConfig({ env: ENV }), {

        /**
         * Developer tool to enhance debugging
         * See: http://webpack.github.io/docs/configuration.html#devtool
         * See: https://github.com/webpack/docs/wiki/build-performance#sourcemaps
         */
        devtool: 'source-map',

        /**
         * Options affecting the output of the compilation.
         * See: http://webpack.github.io/docs/configuration.html#output
         */
        output: {

            /**
             * The output directory as absolute path (required).
             * See: http://webpack.github.io/docs/configuration.html#output-path
             */
            path: helpers.root('dist'),

            /**
             * Specifies the name of each output file on disk.
             * IMPORTANT: You must not specify an absolute path here!
             * See: http://webpack.github.io/docs/configuration.html#output-filename
             */
            filename: '[name].js',

            /**
             * The filename of the SourceMaps for the JavaScript files.
             * They are inside the output.path directory.
             * See: http://webpack.github.io/docs/configuration.html#output-sourcemapfilename
             */
            sourceMapFilename: '[name].map',

            /**
             * The filename of non-entry chunks as relative path
             * inside the output.path directory.
             * See: http://webpack.github.io/docs/configuration.html#output-chunkfilename
             */
            chunkFilename: '[id].chunk.js'

        },

        /**
         * Add additional plugins to the compiler.
         * See: http://webpack.github.io/docs/configuration.html#plugins
         */
        plugins: [

            /**
             * Plugin: WebpackMd5Hash
             * Description: Plugin to replace a standard webpack chunkhash with md5.
             *
             * See: https://www.npmjs.com/package/webpack-md5-hash
             */
            new WebpackMd5Hash(),

            /**
             * Plugin: DefinePlugin
             * Description: Define free variables.
             * Useful for having development builds with debug logging or adding global constants.
             *
             * Environment helpers
             *
             * See: https://webpack.github.io/docs/list-of-plugins.html#defineplugin
             */
            // NOTE: when adding more properties make sure you include them in custom-typings.d.ts
            new DefinePlugin({
                'ENV': JSON.stringify(METADATA.ENV),
                // 'API_URL': JSON.stringify(METADATA.API_URL),
                'API_PORT' : JSON.stringify(METADATA.API_PORT),
                'HMR': METADATA.HMR,
                'process.env': {
                    'ENV': JSON.stringify(METADATA.ENV),
                    'NODE_ENV': JSON.stringify(METADATA.ENV),
                    'HMR': METADATA.HMR,
                    // 'API_URL' : JSON.stringify(METADATA.API_URL),
                    'API_PORT' : JSON.stringify(METADATA.API_PORT)
                }
            }),

            /**
             * Plugin: UglifyJsPlugin
             * Description: Minimize all JavaScript output of chunks.
             * Loaders are switched into minimizing mode.
             * See: https://webpack.github.io/docs/list-of-plugins.html#uglifyjsplugin
             */
            new UglifyJsPlugin({
                beautify: false, //prod
                output: {
                    comments: false
                }, //prod
                mangle: {
                    screw_ie8: true
                }, //prod
                compress: {
                    screw_ie8: true,
                    warnings: false,
                    conditionals: true,
                    unused: true,
                    comparisons: true,
                    sequences: true,
                    dead_code: true,
                    evaluate: true,
                    if_return: true,
                    join_vars: true,
                    negate_iife: false // we need this for lazy v8
                },
            }),

            /**
             * Plugin LoaderOptionsPlugin (experimental)
             *
             * See: https://gist.github.com/sokra/27b24881210b56bbaff7
             */
            new LoaderOptionsPlugin({
                minimize: true,
                debug: false,
                options: {

                }
            })

            // /**
            //  * Plugin: NormalModuleReplacementPlugin
            //  * Description: Replace resources that matches resourceRegExp with newResource
            //  *
            //  * See: http://webpack.github.io/docs/list-of-plugins.html#normalmodulereplacementplugin
            //  */

            // new NormalModuleReplacementPlugin(
            //     /angular2-hmr/,
            //     helpers.root('config/empty.js')
            // ),

            // new NormalModuleReplacementPlugin(
            //     /zone\.js(\\|\/)dist(\\|\/)long-stack-trace-zone/,
            //     helpers.root('config/empty.js')
            // ),

        ],


        /*
        * Include polyfills or mocks for various node stuff
        * Description: Node configuration
        *
        * See: https://webpack.github.io/docs/configuration.html#node
        */
        node: {
            global: true,
            crypto: 'empty',
            process: false,
            module: false,
            clearImmediate: false,
            setImmediate: false
        }

    });
}
