/**
 * test-logger-emitter
 * Copyright (c) 2015-2024 Jürgen Leschner - github.com/jldec - MIT license
 *
**/
/*eslint quotes: "off"*/
/*eslint no-console: "off"*/

var test = require('tape-catch'); // catch malformed objects in test code
var path = require('path'); // behaves differently under windows

var resolveOpts = require('../resolve-opts');

test('resolve {}', function(t) {
  var opts = resolveOpts( {} );
  console.log(opts);
  var cwd = process.cwd();
  t.ok(opts.basedir === cwd, 'basedir');
  t.ok(opts.pkgJson.name === 'pub-resolve-opts', 'pkgJson');
  t.ok(opts.pkgName === 'pub-resolve-opts', 'pkgName');
  t.ok(opts.sources.length === 1 && opts.sources[0].path === cwd, 'sources');
  t.ok(opts.outputs.length === 1 && opts.outputs[0].path === cwd + path.sep + 'out', 'outputs');
  t.ok(opts.browserScripts.length === 0, 'browserScripts');
  t.ok(opts.generatorPlugins.length === 0, 'generatorPlugins');
  t.ok(opts.serverPlugins.length === 0, 'serverPlugins');
  t.ok(opts.pkgs.length === 1 && opts.pkgs[0].path === 'pub-pkg-jquery', 'pkgs');
  t.ok(opts.staticPaths.length === 2 && opts.staticPaths[0].path === cwd
    && opts.staticPaths[1].path === path.join(cwd, '/node_modules/pub-pkg-jquery/js/jquery-1.12.4.min.js'), 'staticPaths');
  t.ok(opts.injectCss.length === 0, 'injectCss');
  t.deepEqual(opts.injectJs, [
    { path: '/js/jquery-1.12.4.min.js' },
    { path: '/socket.io/socket.io.js' },
    { path: '/server/pub-sockets.js' }
  ], 'injectJs');
  t.ok(opts._resolved, '_resolved');
  t.end();
});

test("resolve {dir: 'test/test-dir'}", function(t) {
  var opts = resolveOpts( {dir: 'test/test-dir'} );
  console.log('\ntest/dir\n', opts);
  var cwd = process.cwd();
  var dir = path.join(cwd, '/test/test-dir');
  t.ok(opts.basedir === dir, 'basedir');
  t.ok(opts.pkgJson === undefined, 'pkgJson');
  t.ok(opts.pkgName === undefined, 'pkgName');
  t.ok(opts.sources.length === 1 && opts.sources[0].path === dir, 'sources');
  t.ok(opts.outputs.length === 1 && opts.outputs[0].path === dir + path.sep + 'out', 'outputs');
  t.ok(opts.browserScripts.length === 0, 'browserScripts');
  t.ok(opts.generatorPlugins.length === 0, 'generatorPlugins');
  t.ok(opts.serverPlugins.length === 0, 'serverPlugins');
  t.ok(opts.pkgs.length === 1 && opts.pkgs[0].path === 'pub-pkg-jquery', 'pkgs');
  t.ok(opts.staticPaths.length === 2 && opts.staticPaths[0].path === dir
    && opts.staticPaths[1].path === path.join(cwd, '/node_modules/pub-pkg-jquery/js/jquery-1.12.4.min.js'), 'staticPaths');
  t.ok(opts.injectCss.length === 0, 'injectCss');
  t.deepEqual(opts.injectJs, [
    { path: '/js/jquery-1.12.4.min.js' },
    { path: '/socket.io/socket.io.js' },
    { path: '/server/pub-sockets.js' }
  ], 'injectJs');
  t.ok(opts._resolved, '_resolved');
  t.end();
});

test("resolve browserScripts: {dir: 'test/test-dir', path:'./jsx/ui.jsx', route:'/js/ui.js', inject:true }", function(t) {
  var opts = resolveOpts( {
    dir: 'test/test-dir',
    browserScripts: { path:'./jsx/ui.jsx', route:'/js/ui.js', inject:true}
  } );
  console.log('\nbrowserScripts\n', opts);
  var cwd = process.cwd();
  var dir = path.join(cwd, '/test/test-dir');
  t.ok(opts.basedir === dir, 'basedir');
  t.ok(opts.pkgJson === undefined, 'pkgJson');
  t.ok(opts.pkgName === undefined, 'pkgName');
  t.ok(opts.sources.length === 1 && opts.sources[0].path === dir, 'sources');
  t.ok(opts.outputs.length === 1 && opts.outputs[0].path === dir + path.sep + 'out', 'outputs');
  t.ok(opts.browserScripts.length === 1 && opts.browserScripts[0].path === path.join(dir, '/jsx/ui.jsx'), 'browserScripts');
  t.ok(opts.generatorPlugins.length === 0, 'generatorPlugins');
  t.ok(opts.serverPlugins.length === 0, 'serverPlugins');
  t.ok(opts.pkgs.length === 1 && opts.pkgs[0].path === 'pub-pkg-jquery', 'pkgs');
  t.ok(opts.staticPaths.length === 2 && opts.staticPaths[0].path === dir
    && opts.staticPaths[1].path === path.join(cwd, '/node_modules/pub-pkg-jquery/js/jquery-1.12.4.min.js'), 'staticPaths');
  t.ok(opts.injectCss.length === 0, 'injectCss');
  t.deepEqual(opts.injectJs, [
    { path: '/js/jquery-1.12.4.min.js' },
    { path: '/js/ui.js' },
    { path: '/socket.io/socket.io.js' },
    { path: '/server/pub-sockets.js' }
  ], 'injectJs');
  t.ok(opts._resolved, '_resolved');
  t.end();
});
