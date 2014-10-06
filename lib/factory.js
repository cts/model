var Model = require('cts/model');
var Util = require('cts/util');
var Relations = require('cts/relations');

var Factory = function() {
  this.adapters = {};
};

Factory.prototype.registerAdapter = function(adapter) {
  if (adapter.TREE_TYPES) {
    for (var i = 0; i < adapter.TREE_TYPES.length; i++) {
      this.adapters[adapter.TREE_TYPES[i]] = adapter;
    }
  }
};

Factory.prototype.Forrest = function(opts, factory) {
  // Returns Promise
  var forrest = new Model.Forrest(opts, factory);
  return forrest.initializeAsync();
};

Factory.prototype.SelectionSpec = function(kind, string) {
  if (typeof this.adapters[kind] == 'undefined') {
    return null;
  }
  return this.adapters[kind].Parser.parseSelectionSpec(string);
};

Factory.prototype.Relation = Relations.Factory.CreateFromSpec;

Factory.prototype.Tree = function(spec, forrest) {
  if (spec.kind in this.adapters) {
    return this.adapters[spec.kind].Factory.Tree(spec, forrest);
  } else {
    console.log("Adapter unspecified, trying HTML.");
    return this.adapters.html.Factory.Tree(spec, forrest);
  }
};

var factorySingleton = new Factory();
module.exports = factorySingleton;