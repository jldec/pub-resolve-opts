# pub-resolve-opts
[![Build Status](https://api.travis-ci.org/jldec/pub-resolve-opts.svg?branch=master)](https://travis-ci.org/jldec/pub-resolve-opts)

config resolver for pub-generator and pub-server


```js
resolvedOpts = require('pub-resolve-opts')('.', path.join(__dirname, 'node_modules'));
```

- param 1: directory (containing .md files or pub-config.js) or opts e.g. from cli
- param 2: optional dir for builtins
- output = fully resolved opts, merging packages opts with pub-config file

```javascript
var OPTSKEYS = [ 'sources',           // paths to source files
                 'staticPaths',       // paths to static files
                 'outputs',           // output destination(s)
                 'browserScripts',    // for browserify
                 'generatorPlugins',  // e.g. to define handlebars helpers
                 'serverPlugins',     // e.g. to deploy server-side packages
                 'injectCss',         // CSS paths to inject
                 'injectJs',          // js paths to inject
                 'pkgs' ];            // npm packages with more of the above
```

#### normalized form for OPTSKEY values
- OPTSKEY values from the input `pub-config` file or opts are normalized
- normalized = array of (zero or more) objects with a `path:value`
- relative paths and module names are resolved relative to the config directory
- modules and relative paths inside packages are resolved relative to package directories
- OPTSKEY values from each package are merged into top-level arrays
- returns object with one set of fully resolved `sources`, `staticPaths` etc.
