# pub-resolve-opts

pub-config resolver for pub-generator and pub-server

E.g.
```js
resolvedOpts = require('pub-resolve-opts')('.', __dirname);
```

- 1st parameter is a source directory (containing md files or pub-config.js) or input opts (e.g. from cli)
- 2nd parameter is optional dir for builtins
- return value: fully resolved opts, using themes and pub-config file

```javascript
var OPTSKEYS = [ 'sources',           // paths to source files
                 'staticPaths',       // paths to static files
                 'outputs',           // output destination(s)
                 'browserScripts',    // for browserify
                 'generatorPlugins',  // e.g. to define handlebars helpers
                 'serverPlugins',     // e.g. to deploy server-side packages
                 'themes' ];          // npm packages with more of the above
```

# normalized form for OPTSKEY values
- each OPTSKEY value from the input `pub-config` file or opts is normalized into an array of (zero or more) objects with `path:value`
- paths and module names are resolved relative to the config directory
- OPTSKEY values from each theme's `pub-config` are merged into the top-level arrays
- modules and dirs inside themes are resolved relative to theme directories
- the function returns an object with one set of fully resolved `sources`, `staticPaths` etc.
