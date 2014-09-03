/**
 * A Relation is a connection between two tree nodes.
 * Relations are the actual arcs between nodes.
 * Rules are the language which specify relations.
 */

var Util = require('cts/util');

var Selection = function(nodes, opts) {
  this.nodes = nodes;
  this.opts = {};
  if (typeof opts != 'undefined') {
    this.opts = Util._.extend(this.opts, opts);
  }
};

Util._.extend(Selection.prototype, {
  contains: function(node) {
    return Util._.contains(this.nodes, node);
  },

  clone: function() {
    // not a deep clone of the selection. we don't want duplicate nodes
    // running around.
    return new Selection(Util._.union([], this.nodes), this.opts);
  },

  matchesArray: function(arr, exactly, orArrayAncestor) {
    if (typeof backoffToAncestor == 'undefined') {
      backoffToAncestor = false;
    }

    for (var i = 0; i < this.nodes.length; i++) {
      if (! Util._.contains(arr, this.nodes[i])) {
        if (backoffToAncestor) {
          // 
        } else {
          return false;
        }
      }
    }
    if ((typeof exactly != 'undefined') && (exactly === true)) {
      return (arr.length = self.nodes.length);
    } else {
      return true;
    }
  }
});

module.exports = Selection;
