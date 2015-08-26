/*
 * pub-resolve-opts.js
 *
 * input = directory name or opts object, and optional dir for builtins
 * output = fully resolved opts, merging pkgs.opts with pub-config file
 *
 * OPTSKEYS are normalized to [{path: },...] arrays
 * then merged with OPTSKEYS from pkg configs
 *
 * paths and module names are resolved relative to config directory or cwd
 * modules and dirs inside pkgs are resolved relative to pkg directories
 *
 * copyright 2015, Jurgen Leschner - github.com/jldec - MIT license
 */

var debug = require('debug')('pub:resolve-opts');


var u = require('pub-util');

var OPTSFILE = 'pub-config';     // default filename for configs

var OPTSKEYS = [ 'sources',           // paths to source files
                 'staticPaths',       // paths to static files
                 'outputs',           // output destination(s)
                 'browserScripts',    // for browserify
                 'generatorPlugins',  // e.g. to define handlebars helpers
                 'serverPlugins',     // e.g. to deploy server-side packages
                 'injectCss',         // CSS paths to inject
                 'injectJs',          // js paths to inject
                 'pkgs' ];          // npm packages with more of the above

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

  builtins = (builtins && !u.isArray(builtins)) ? [builtins] : [];

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
      if (opts.ignoreConfig || fileopts['pub-pkg']) {
        // prevent pub-pkg folders from misbehaving when opened using pub
        opts.log('ignoring config ' + configFile);
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

  // try to read basedir/package.json
  try {
    var pkgfile = fspath.join(opts.basedir, 'package.json');
    opts.pkgJson = JSON.parse(fs.readFileSync(pkgfile, 'utf8'));
    opts.pkgName = opts.pkgJson.name;
  }
  catch(err) {}

  // normalize and merge opts, using basedir to resolve paths.
  opts = normalizeOpts(opts);
  if (fileopts) { mergeopts(opts, normalizeOpts(fileopts)); }
  if (defaults) { mergeopts(opts, normalizeOpts(defaults)); }

  // staticOnly ignore ALL sources, outputs and pkgs and return
  if (opts.staticOnly) {
    opts.log('static-only %s', u.csv(u.pluck(opts.staticOnly, 'path')));
    opts.staticPaths = opts.staticOnly;
    opts.sources = []; opts.source$ = {};
    opts.outputOpts = opts.outputs[0]; // used by serveStatics
    opts.outputs = []; opts.output$ = {};
    opts.pkgs = [];
    opts._resolved = true;
    return opts;
  }

  // default source (before applying pkgs) = *.{md,hbs} in basedir
  if (!opts.sources.length) {
    var src = { path:opts.basedir,
                glob:'*.{md,hbs}',
                watch:true,
                writable:true };
    opts.sources.push(normalize(src));
    opts.log('source %s/*.{md,hbs}', src.path);
  }

  // default output dir = './out'
  if (!opts.outputs.length) {
    opts.outputs.push(normalize(fspath.join(opts.basedir, 'out')));
  }

  // default staticPath = basedir
  if (!opts.staticPaths.length && !opts.outputOnly && !opts.htmlOnly) {
    opts.staticPaths.push(normalize( {
      path:opts.basedir,
      depth: 1
    } ));
  }

  // prepend pub-pkg-jquery or pkg specified in opts.jquery
  if (opts.jquery || !('jquery' in opts)) {
    opts.pkgs.unshift(normalize(
      ((typeof opts.jquery === 'string') && opts.jquery) || 'pub-pkg-jquery'));
  }

  // editor pkg
  if (opts.editor) {
    var editorPkg = opts['editor-pkg'] || 'pub-pkg-editor';
    opts.pkgs.push(normalize(editorPkg));

    // inject pub-ux.js and socket.io.js
    // TODO - fix editor/production logic
    if (!opts.production) {
      if (!opts['no-sockets']) {
        opts.injectJs.push(normalize('/socket.io/socket.io.js'));
      }
      opts.injectJs.push(normalize('/server/pub-ux.js'));
    }
  }

  // resolve pkgs to translate '..' refs into searchable paths
  u.each(opts.pkgs, resolvePkg);

  opts.theme = u.find(opts.pkgs, function(pkg) {
    return /^pub-theme/i.test(pkg.pkgName);
  });

  // inject default theme/pkgs
  if (!opts.theme && !fileopts && opts.cli && !opts.staticOnly) {
    opts.pkgs = u.union(opts.pkgs,
      u.map(
        normalizeOptsKey(opts['default-pkgs'] ||
          ['pub-theme-doc','pub-pkg-highlight','pub-pkg-font-awesome']),
        resolvePkg));
    opts.theme = u.where(opts.pkgs, { pkgName:'pub-theme-doc' })[0];
  }

  // collect injected css and js from opts and save for later
  injectPaths(opts.staticPaths);
  injectPaths(opts.browserScripts);
  var injectCssTmp = opts.injectCss; opts.injectCss = [];
  var injectJsTmp = opts.injectJs; opts.injectJs = [];

  // require pkgs
  u.each(opts.pkgs, function(pkg) {

    opts.log(fspath.basename(pkg.dir));

    // require OPTSFILE even if package.json main is different
    var pkgOpts = require(fspath.join(pkg.dir, OPTSFILE));

    // resolve paths relative to pkg directory not basedir
    pkgOpts = normalizeOpts(pkgOpts, pkg.dir, pkg.path);

    // coalesce OPTSKEYS - other pkg opts and nested pkgs are ignored
    u.each(u.omit(OPTSKEYS, 'pkgs'), function(key) {
      opts[key] = u.union(opts[key], pkgOpts[key]);
    });

    // inject css and js
    if (pkg.inject || !('inject' in pkg)) {
      injectPaths(pkgOpts.staticPaths);
      injectPaths(pkgOpts.browserScripts);
    }
  });

  // restore injected css and js from opts *after* pkgs
  opts.injectCss = u.union(opts.injectCss, injectCssTmp);
  opts.injectJs = u.union(opts.injectJs, injectJsTmp);

  // add injectable staticPaths to opts.injectCss or opts.injectJs
  function injectPaths(paths) {
    u.each(paths, function(path) {
      if (path.inject) {
        // injected css and js sources are always rooted paths
        var src = fspath.join(path.route || '/', fspath.basename(path.path));
        if (/\.css$/i.test(src)) return opts.injectCss.push(normalize(src));
        if (/\.js$/i.test(src)) return opts.injectJs.push(normalize(src));
      }
    });
  }

  // resolve browserScripts which are npm modules
  u.each(opts.browserScripts, function(script) {

    var path = npmResolve(script.path,
               { basedir:opts.basedir, paths:builtins } );

    if (!path) throw new Error('cannot resolve browserScript ' + script.path);

    // use route to serve script (TODO: revisit when we output BrowserScripts)
    route = fspath.join(script.route || '/', fspath.basename(script.path));

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

  // don't watch inside packages unless opts.watchPkgs
  // don't watch if src.watch = falsy
  function watchOpts(src) {
    if ((src._pkg && !opts.watchPkgs) || ('watch' in src && !src.watch)) return false;
    return (typeof src.watch === 'object') ? src.watch : {};
  }

  // resolve package path given package name or {pkg:name}
  function pkgPath(pkg) {
    pkg = pkg.pkg || pkg;
    var pkgPath = npmResolve(pkg, { basedir:opts.basedir, paths:builtins } );
    if (!pkgPath) throw new Error('cannot resolve module ' + pkg);
    return pkgPath;
  }

  // mutate opts obj by normalizing Key values into form [ { path:x },... ]
  // qualify relative paths against basedir
  function normalizeOpts(obj, basedir, pkg) {
    obj = obj || {};

    u.each(OPTSKEYS, function(key) {
      obj[key] = normalizeOptsKey(obj[key], basedir, pkg);
    });

    return obj;
  }

  // normalize a single opts key
  function normalizeOptsKey(aval, basedir, pkg) {

    aval = aval || [];

    if (!u.isArray(aval)) {
      aval = [ aval ];
    }

    return u.map(u.compact(aval), function(val) {
      return normalize(val, basedir, pkg);
    });

  }

  // normalize a single opts key value
  function normalize(val, basedir, pkg) {
    basedir = basedir || opts.basedir;

    if (typeof val === 'string') {
      val = { path: val };
    }

    var originalPath = val.path;

    // don't join with basedir unless relative directory path
    // TODO: make this smarter - only module names are not always relative
    if (/^\.$|^\.\.$|^\.\/|^\.\.\//.test(val.path)) {
      val.path = fspath.join(basedir, val.path);
    }

    // for brevity on console output
    val.inspect = function() {
      return (originalPath) +
             (pkg ? ' in ' + pkg : '') +
             (val.cache ?  ' (cached)' : '');
    };

    if (pkg) {
      val._pkg = pkg;
    }

    return val;
  }

  function mergeopts(opts, otheropts) {

    u.each(otheropts, function(val, key) {

      // OPTSKEYS = arrays - merged via u.union
      if (u.contains(OPTSKEYS, key)) {
        opts[key] = u.union(opts[key], val);
      }
      // don't assume that only truthy values matter
      else if (!(key in opts)) {
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

  function resolvePkg(pkg) {
    var resolveOpts = { basedir:opts.basedir, paths:builtins,
      // use packageFilter to capture parsed package.json
      packageFilter:function(pkgJson, name) {
        pkg.pkgJson = pkgJson;
        pkg.pkgName = pkgJson.name;
        return pkgJson;
      } };
    var pkgPath = npmResolve(pkg.path, resolveOpts);
    if (!pkgPath) throw new Error('cannot resolve pkg ' + pkg.path);
    pkg.dir  = fspath.dirname(pkgPath);
    return pkg;
  }

}
