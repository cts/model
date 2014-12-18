/**
 * Selection Monad.
 *
 * Represents a collection of 0 or more CTS Nodes.
 * Goal is to treat empty collections & missing method calls as silently
 * handled no-ops a la jQuery.
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

  setValue: function(val, opts) {
    try {
      if ((typeof this.nodes == 'undefined') || (nodes.length == 0) {
        Util.Log.Warn("Tried to set an empty selection. val=", val);
      } else if (this.nodes.length == 1) {
        return this.nodes[0].setValue(val, opts);
      } else {
        return _.map(this.nodes, function(n) {return n.setValue(val, opts)});
      }
      return this;
    } catch (e) {
      Util.Log.Error(e);
      return this;
    }
  },

  getValue: function(opts) {
    try {
      if ((typeof this.nodes == 'undefined') || (nodes.length == 0) {
        return null;
      } else if (this.nodes.length == 1) {
        return this.nodes[0].getValue(opts);
      } else {
        return _.map(this.nodes, function(n) {return n.getValue(opts)});
      }
    } catch (e) {
      Util.Log.Error(e);
      return null;
    }
  },

  find: function(selector, opts) {
    try {
      if ((typeof this.nodes == 'undefined') || (nodes.length == 0) {
        return new Selection([]);
      } else if (this.nodes.length == 1) {
        return new Selection(
          this.nodes[0].find(selector, opts)
        );
      } else {
        return new Selection(
          _.flatten(_.map(this.nodes, function(n) {return n.find(selector, opts)})
        );
      }
    } catch (e) {
      Util.Log.Error(e);
      return null;
    }    
  },

  length: function() {
    if ((typeof this.nodes == 'undefined') || (nodes.length == 0) {
      return 0;
    } else if (this.nodes.length == 1) {
      return this.nodes[0];
    }
  },

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
