var Util = require('cts/util');
var Is = require('./is.js');
var Are = require('./are.js');
var Graft = require('./graft.js');
var If = require('./if.js');
var Creates = require('./creates.js');
var Updates = require('./updates.js');

var Factory = {
  CreateFromSpec: function(node1, node2, spec) {
    if (spec.name == 'is') {
      return new Is(node1, node2, spec);
    } else if (spec.name == 'are') {
      return new Are(node1, node2, spec);
    } else if (spec.name == 'creates') {
      return new Creates(node1, node2, spec);
    } else if (spec.name == 'updates') {
      return new Updates(node1, node2, spec);
    } else if (spec.name == 'graft') {
      return new Graft(node1, node2, spec);
    } else if (spec.name == 'if-exist') {
      spec.opts.negate = false;
      return new If(node1, node2, spec);
    } else if (spec.name == 'if-nexist') {
      spec.opts.negate = true;
      return new If(node1, node2, spec);
    } else if (spec.name == 'if') {
      return new If(node1, node2, spec);
    } else {
      Util.Log.Fatal("Unsure what kind of relation this is:", spec.name);
      return null;
    }
  }
};

module.exports = {
  Is:       Is,
  If:       If,
  Are:      Are,
  Graft:    Graft,
  Creates:  Creates,
  Updates:  Updates,
  Factory:  Factory
};