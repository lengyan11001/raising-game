(function () {
  "use strict";
  var React = window.React;
  if (!React) throw new Error("React must load before jsxRuntime.");
  function create(type, props, key) {
    var config = {};
    var source = props || {};
    Object.keys(source).forEach(function (name) {
      if (name !== "key" && name !== "__self" && name !== "__source") config[name] = source[name];
    });
    if (key !== undefined) config.key = key;
    return React.createElement(type, config);
  }
  window.jsxRuntime = {
    Fragment: React.Fragment,
    jsx: create,
    jsxs: create,
    jsxDEV: create,
  };
})();
