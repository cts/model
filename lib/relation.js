/**
 * A Relation is a connection between two tree nodes.
 * Relations are the actual arcs between nodes.
 * Rules are the language which specify relations.
 */

var NonexistentNode = require('./nonexistent-node');
var Util = require('cts/util');

var Relation = {};

Relation.Base = {

  initializeBase: function() {
    if (this.node1 != null) {
      this.node1.registerRelation(this);
    }
    if (this.node2 != null) {
      this.node2.registerRelation(this);
    }
    this.defaultOpts = this.getDefaultOpts();
  },

  getDefaultOpts: function() {
    return {};
  },

  addOption: function(key, value) {
    this.opts[key] = value;
  },

  head: function() {
    return this.selection1;
  },

  tail: function() {
    return this.selection2;
  },

  opposite: function(node) {
    return (node == this.node1) ? this.node2 : this.node1;
  },

  truthyOrFalsy: function(node) {
    if ((node == NonexistentNode) || (node == null) || Util._.isUndefined(node)) {
      return false;
    }
    var val = node.getIfExistValue();
    return Util.Helper.truthyOrFalsy(val);
  },

  forCreationOnly: function(val) {
    if (typeof val == 'undefined') {
      return this.spec.forCreationOnly;
    } else if (val) {
      this.spec.forCreationOnly = true;
      return true;
    } else {
      this.spec.forCreationOnly = false;
      return false;
    }
  },

  handleEventFromNode: function(evt) {
    if (this.spec.forCreationOnly) {
      // Otherwise modifications to the input elements of the
      // form will set the entire collection that this is creation-mapped
      // to!
      return;
    }

    var thrownFrom = this.node1;
    var thrownTo = this.node2;
    if (evt.sourceNode == this.node2) {
      thrownFrom = this.node2;
      thrownTo = this.node1;
    }

    if (thrownTo.shouldReceiveEvents) {
      this._subclass_handleEventFromNode(evt, thrownFrom, thrownTo);
    }
  },

  /*
   * removes this relation from both node1 and node2
   */
  destroy: function() {
    if (this.node1 != null) {
      this.node1.unregisterRelation(this);
    }
    if (this.node2 != null) {
      this.node2.unregisterRelation(this);
    }
    this.node1 = null;
    this.node2 = null;
    this.name = null;
    this.spec = null;
    this.destroyed = true;
  },

  optsFor: function(node) {
    var toRet = {};
    Util._.extend(toRet, this.defaultOpts);
    if (this.node1 === node) {
      if (this.spec && this.spec.selectionSpec1) {
        Util._.extend(toRet, this.spec.selectionSpec1.props);
      }
    } else if (this.node2 == node) {
      if (this.spec && this.spec.selectionSpec1) {
        Util._.extend(toRet, this.spec.selectionSpec2.props);
      }
    }
    return toRet;
  },

  clone: function(from, to) {
    if (typeof from == 'undefined') {
      from = this.node1;
    }
    if (typeof to == 'undefined') {
      to = this.node2;
    }
    return new Relation.Base(from, to, this.spec.clone());
  },

  equals: function(other) {
    return (
      (this.node1 == other.node1) &&
      (this.node2 == other.node2) &&
      (this.name == other.name)
    );
  },

  signature: function() {
    return "<" + this.name + " " + Util._.map(this.opts, function(v, k) { return k + ":" + v}).join(";") + ">";
  },

  _getIterables: function(node) {
    var opts = this.optsFor(node);
    var kids = node.getChildren();
    var prefix = 0;
    var suffix = 0;
    if (opts.prefix) {
      prefix = opts.prefix;
    }
    if (opts.suffix) {
      suffix = opts.suffix;
    }
    var iterables = kids.slice(prefix, kids.length - suffix);
    if (opts.item) {
      if (Util._.isUndefined(parseInt(opts.item))) {
        if (opts.item.toLowerCase() == 'random') {
          var item = iterables[Math.floor(Math.random()*iterables.length)];
          iterables = [item];
        }
      } else {
        // We're one-indexed
        var index = parseInt(opts.item)
        iterables = iterables.slice(index, 1);
      }
    }
    if (opts.limit) {
      iterables = iterables.slice(0, limit);
    }
    return iterables;
  },

  _cloneIterable: function(toward, cloneFromIndex, insertAfterIndex, throwEvent) {
    var deferred = Util.Promise.defer();
    var iterables = this._getIterables(toward);
    if (typeof idx == 'undefined') {
      idx = iterables.length - 1;
    }
    var self = this;
    var rejectIfUnder = this.opposite(toward);
    var otherIterables  = this._getIterables(rejectIfUnder);
    var unlessUnder = null;
    if (otherIterables.length < idx) {p
      var unlessUnder = otherIterables[idx];
    }

    var filterFn = Util.Helper.rejectUnless(rejectIfUnder, unlessUnder);

    iterables[idx].clone(undefined, false).then(
      function(clone) {
        toward.insertChild(clone, insertAfterIndex, throwEvent, false);
        toward.tree.forrest.realizeRelations(clone, undefined, filterFn);

        debugger;
        
        // self._pruneIterable(insertAfterIndex + 1);
         // Forces inline
        console.log("clone has relns", clone.getRelations());
        deferred.resolve(clone);
      },
      function(err) {
        deferred.reject(err);
      }
    );

    return deferred;
  },

  eventInterestFor: function(n) {
    return [];
  }
};

module.exports = Relation;
