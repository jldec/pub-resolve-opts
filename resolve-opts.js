/*
 * pub-resolve-opts.js
 *
 * input = directory name or opts object, and optional dir for builtins
 * output = fully resolved opts, using themes and pub-config file
 *
 * OPTSKEYS are normalized to [{path: },...] arrays
 * then merged with OPTSKEYS from theme configs
 *
 * paths and module names are resolved relative to config directory or cwd
 * modules and dirs inside themes are resolved relative to theme directories
 *
 * copyright 2015, Jurgen Leschner - github.com/jldec - MIT license
 */

var debug = require('debug')('pub:resolve-opts');


var u = require('pub-util');

var OPTSFILE = 'pub-config';     // default filename for configs

var OPTSKEYS = [ 'sources',           // paths to source files
                 'staticPaths',       // paths to static files
                 'outputs',          // output destination(s)
                 'browserScripts',    // for browserify
                 'generatorPlugins',  // e.g. to define handlebars helpers
                 'serverPlugins',     // e.g. to deploy server-side packages
                 'themes' ];          // npm packages with more of the above

module.exports = resolveOpts;

function resolveOpts(opts, builtins) {

  var configFile;

  opts = opts || {};

  if (typeof opts === 'string') { opts = { dir: opts }; }

  // establish logger
  opts.log = opts.log || require('logger-emitter')().log;

  // prevent re-resolving e.g. when opts are served to client;
  if (opts._resolved) return opts;


  //--//--//--//--//--//--//--//--//--//--//--//--//--//--//
  //        below this should not be run on client        //

  var fs = require('fs');
  var fspath = require('path');
  var osenv = require('osenv'); // https://github.com/isaacs/osenv
  var resolve = require('resolve');

  if (opts.cli) {
    // look for defaults in home directory
    var dconfigPath = fspath.join(osenv.home(), '.' + OPTSFILE);
    if (npmResolve(dconfigPath, { extensions: ['.js', '.json'] } )) {
      var defaults = require(dconfigPath);
    }
    opts.user = opts.user || osenv.user();
  }

  if (opts.dir) {

    var configPath = fspath.resolve(opts.dir);

    if (isDir(configPath)) {
      configPath = fspath.join(configPath, OPTSFILE)
    }
    // require(configFile) only if it can be resolved
    if (configFile = npmResolve(configPath, { extensions: ['.js', '.json'] } )) {
      var fileopts = require(configFile);
      if (fileopts['pub-pkg']) {
        // prevent pub-pkg folders from misbehaving when opened using pub
        opts.log('ignoring pub-pkg config ' + configFile);
        fileopts = null;
      }
      else {
        opts.log(configFile);
      }
    }
  }

  // figure out basedir
  opts.basedir = opts.basedir ||
      fileopts && fileopts.basedir ||
      configPath && fspath.dirname(configPath) ||
      defaults && defaults.basedir ||
      process.cwd();

  // normalize and merge opts, using basedir to resolve paths.
  opts = normalizeOpts(opts);
  if (fileopts) { mergeopts(opts, normalizeOpts(fileopts)); }
  if (defaults) { mergeopts(opts, normalizeOpts(defaults)); }

  // default source (before applying themes) = *.{md,hbs} in basedir
  if (!opts.sources.length) {
    var src = { path:opts.basedir,
                glob:'*.{md,hbs}',
                watch:true,
                writable:true,
                fragmentDelim:opts.fragmentDelim };
    opts.sources.push(normalize(src));
    opts.log('source %s/*.{md,hbs}', src.path);
  }

  // editor theme
  if (opts.editor) {
    var editorTheme = opts['editor-theme'] || 'pub-pkg-editor';
    opts.themes.push(normalize(editorTheme));
  }

  builtins = typeof builtins === 'string' ?
    [ fspath.join(builtins + '/node_modules') ] : builtins;

  // resolve theme.dirs so that we can find pub-theme-?
  u.each(opts.themes, resolveTheme);

  // inject default theme
  if (!fileopts && opts.cli &&
      !u.find(opts.themes, function(theme) {
        return /\/pub-theme/i.test(theme.dir);
  })) {
    opts.themes.push(resolveTheme(
      normalize(opts['default-theme'] || 'pub-theme-gfm')));
  }

  // require themes
  u.each(opts.themes, function(theme) {

    opts.log(fspath.basename(theme.dir));

    // require OPTSFILE even if package.json main is different
    var themeOpts = require(fspath.join(theme.dir, OPTSFILE));

    // resolve paths relative to theme directory not basedir
    themeOpts = normalizeOpts(themeOpts, theme.dir, theme.path);

    // only get OPTSKEYS (other theme opts are ignored)
    u.each(OPTSKEYS, function(key) {
      opts[key] = u.union(opts[key], themeOpts[key]);
    });

  });

  // resolve browserScripts which are npm modules
  u.each(opts.browserScripts, function(script) {

    var path = npmResolve(script.path,
               { basedir:opts.basedir, paths:builtins } );

    if (!path) throw new Error('cannot resolve browserScript ' + script.path);

    // use route to serve script
    // routes without extension treated like directory prefix for original path
    var route = script.route || '/';
    if (!fspath.extname(route)) {
      route = fspath.join(route, fspath.basename(script.path));
    }

    script.route = route;
    script.path = path;
  });

  // pre-initialize outputs, then include with sources
  u.each(opts.outputs, function(output) {
    setOptName(output, 'output');
    output.output = true;
    output.writable = true;
  });

  // resolve and instantiate source packages and source caches
  // name sources uniquely, and index by name in opts.source$
  opts.source$ = {};
  u.each(opts.sources.concat(opts.outputs), function(source) {
    setOptName(source, 'source');
    source.type = source.type || 'FILE';

    // convert timeout to ms, and force long timeouts when debugging
    if (source.timeout) {
      if (opts['no-timeouts']) { source.timeout = u.ms('60m'); }
      else { source.timeout = u.ms(source.timeout); }
    }

    if (source.writable) {
      source.tmp = source.tmp ||
        fspath.join(opts.tmp || (osenv.home() + '/.tmp'), source.name);
    }

    var pkg  = source.src || 'pub-src-fs';
    source.src = require(pkgPath(pkg))(source);

    // watch all sources if opts.cli - TODO: review for perf
    if (source.src.watchable && (opts.cli || source.watch)) {
      source.watch = watchOpts(source);
    }

    if (source.cache) {

      // source.cache is either pkgname or {src:pkgname, writeThru:bool, ...}
      var cachePkg = source.cache.src || source.cache;
      var cacheOpts = source.cache.src ? source.cache : {};
      u.extend(cacheOpts, u.pick(source, 'writable')); // inherit writability

      // set source.cache = cache instance with same sourceOpts, but writable
      var cacheSourceOpts = u.extend(u.omit(source, 'src'),
                            { writable:true, name:source.name+':cache' });

      source.cache = require(pkgPath(cachePkg))(cacheSourceOpts);

      // interpose cache onto source (replaces source.get and source.put)
      source.cache.cache(source.src, cacheOpts);
    }
  });

  // initialize staticPaths
  u.each(opts.staticPaths, function(sp) {
    // always watch with cli, assume all staticPaths are watchable
    if (opts.cli || sp.watch) { sp.watch = watchOpts(sp); }
  });

  opts._resolved = true;
  return opts;

  //--//--//--//--//--//--//--//--//--//--//

  // assign a unique name to opt by indexing opts.[optKey]$
  // NOTE: this may overwrite opt.name
  function setOptName(opt, optKey) {
    var key$ = optKey + '$'
    opts[key$] = opts[key$] || {};
    var name = opt.name || fspath.basename(opt.path);
    while (opts[key$][name]) {
      name = '_' + name;
    }
    opts[key$][name] = opt;
    opt.name = name;
  }

  function watchOpts(path) {
    return (typeof path.watch === 'object') ? path.watch : {};
  }

  // resolve package path given package name or {pkg:name}
  function pkgPath(pkg) {
    pkg = pkg.pkg || pkg;
    var pkgPath = npmResolve(pkg, { basedir:opts.basedir, paths:builtins } );
    if (!pkgPath) throw new Error('cannot resolve module ' + pkg);
    return pkgPath;
  }

  // mutate opts by normalizing themeKey value(s) into form [ { path:x },... ]
  // qualify relative paths against basedir
  function normalizeOpts(obj, basedir, theme) {
    obj = obj || {};

    u.each(OPTSKEYS, function(key) {

      var aval = obj[key] || [];

      if (!u.isArray(aval)) {
        aval = [ aval ];
      }

      obj[key] = u.map(aval, function(val) {
        return normalize(val, basedir, theme);
      });

    });

    return obj;
  }

  function normalize(val, basedir, theme) {
    basedir = basedir || opts.basedir;

    if (typeof val === 'string') {
      val = { path: val };
    }

    var originalPath = val.path;

    // relative directory paths always start with .
    if (/^\./.test(val.path)) {
      val.path = fspath.join(basedir, val.path);
    }

    // for brevity on console output
    val.inspect = function() {
      return (val.route || originalPath) +
             (theme ? ' in ' + theme : '') +
             (val.cache ?  ' (cached)' : '');
    };

    return val;
  }

  function mergeopts(opts, otheropts) {

    u.each(otheropts, function(val, key) {

      // OPTSKEYS = arrays - merged via u.union
      if (u.contains(OPTSKEYS, key)) {
        opts[key] = u.union(opts[key], val);
      }
      // assume only truthy values matter
      else if (val && !opts[key]) {
        opts[key] = val;
      }
    });
  }

  function isDir(path) {
    try { return fs.statSync(path).isDirectory(); }
    catch(err) { return false; }
  }

  function npmResolve() {
    try { return resolve.sync.apply(this, arguments); }
    catch (err) { return; }
  }

  function resolveTheme(theme) {
    var dir = fspath.dirname(theme.path);
    var base = fspath.basename(theme.path);
    var resolveOpts = { basedir:opts.basedir, paths:builtins };

    var themePath = npmResolve(theme.path, resolveOpts)
                 || npmResolve(fspath.join(dir, 'pub-theme-' + base), resolveOpts)
                 || npmResolve(fspath.join(dir, 'pub-pkg-' + base), resolveOpts);

    if (!themePath) throw new Error('cannot resolve theme ' + theme.path);

    theme.dir  = fspath.dirname(themePath);
    return theme;
  }

}
