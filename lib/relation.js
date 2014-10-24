/**
 * A Relation is a connection between two tree nodes.
 * Relations are the actual arcs between nodes.
 * Rules are the language which specify relations.
 */

var NonexistentNode = require('./nonexistent-node');
var Util = require('cts/util');

var Relation = {};

Relation.Base = {

  initializeBase: function(klass, name, node1, node2, spec) {
    this.klass = klass;
    this.name = name;
    this.node1 = node1;
    this.node2 = node2;
    this.spec = spec || {};

    if (this.node1 != null) {
      this.node1.registerRelation(this);
    }
    if (this.node2 != null) {
      this.node2.registerRelation(this);
    }
    if (this.node1.forGraftOnly() || this.node2.forGraftOnly()) {
      this.forGraftOnly(true);
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

  forGraftOnly: function(val) {
    if (typeof val == 'undefined') {
      return (!!this.spec.forGraftOnly);
    } else if (val) {
      this.spec.forGraftOnly = true;
      return true;
    } else {
      this.spec.forGraftOnly = false;
      return false;
    }
  },

  handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (this.forGraftOnly()) {
      // Otherwise modifications to the input elements of the
      // form will set the entire collection that this is creation-mapped
      // to!
      return;
    }

    // This it the case where the node has thrown the relation.
    // If the values were defined, it was traversing across a relation chain.
    if (typeof thrownFrom == 'undefined') {
      thrownFrom = this.node1;
      thrownTo = this.node2;

      if (evt.sourceNode == this.node2) {
        thrownFrom = this.node2;
        thrownTo = this.node1;
      }
    }

    if (thrownTo.shouldReceiveEvents) {
      this._subclass_handleEventFromNode(evt, thrownFrom, thrownTo);

      // Now pass that event to other relations
      var otherRelations = thrownTo.getRelations();

      if (typeof evt.relationChain == 'undefined') {
        evt.relationChain = [this];
      } else {
        evt.relationChain.push(this);
      }
      for (var i = 0; i < otherRelations.length; i++) {
        if (! Util._.contains(evt.relationChain, otherRelations[i])) {
          otherRelations[i].handleEventFromNode(evt, thrownTo, otherRelations[i].opposite(thrownTo));
        }
      }
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
    return new this.klass(from, to, this.spec.clone());
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

  _cloneIterable: function(toward, cloneFromIndex, insertAfterIndex, throwEvent, beforePersistenceFn, cloneRelns, filterFn) {
    var deferred = Util.Promise.defer();
    if (typeof cloneRelns == 'undefined') {
      cloneRelns = false;
    } 
    
    var iterables;
    if (typeof toward._originalIterables == 'undefined') {
      iterables = this._getIterables(toward);
    } else {
      iterables = toward._originalIterables;
    }

    if (typeof insertAfterIndex == 'undefined') {
      insertAfterIndex = iterables.length - 1;
    }
    var self = this;

    // var rejectIfUnder1 = this.opposite(toward);
    // var otherIterables  = this._getIterables(rejectIfUnder1);
    // var unlessUnder1 = null;
    // if ((insertAfterIndex + 1) < otherIterables.length) {
    //   var unlessUnder1 = otherIterables[insertAfterIndex+1];
    // }

    // var rejectIfUnder2 = toward;
    // var filterFn1 = Util.Helper.rejectUnless(rejectIfUnder1, unlessUnder1);
      
    var cloned = function(clone) {
    //  debugger;
      toward.insertChild(clone, insertAfterIndex, throwEvent, false);
      // Force [lazy] evaluation of inline relations
      // var filterFn = self._makeAreTreeFilter(toward, clone, insertAfterIndex+1);

      var argFilter = self._makeAreTreeFilter(toward, clone, insertAfterIndex+1);
      clone.realizeInlineRelationSpecs(true, argFilter);
      // And now for external rules  
      toward.tree.forrest.realizeRelations(clone, argFilter);        

      clone.pruneRelations(undefined, undefined, argFilter);

      if (filterFn) {
        clone.pruneRelations(undefined, undefined, filterFn);
      }


      // clone.pruneRelations(undefined, undefined, filterFn1);

      // Forces inline
      deferred.resolve(clone);      
    };

    iterables[cloneFromIndex % iterables.length].clone(beforePersistenceFn, cloneRelns).then(
      cloned,
      function(err) {
        deferred.reject(err);
      }
    );

    return deferred;
  },

  filterAreTree: function(n) {

  },

  _collectAresUpRoot: function(node, bestSoFar, callingFrom, idx) {
    var r = Util._.filter(node.relations, function(r) {
      return (r.name == 'are');
    });
    // debugger;
    if (r.length > 0) {
      for (var i = 0; i < r.length; i++) {
        var are = r[i];
        var root = (are.node1 == node) ? are.node2 : are.node1;
        if (typeof idx == 'undefined') {
          idx = Util._.indexOf(this._getIterables(node), callingFrom);
        }
        var iterables = this._getIterables(root);
        if ((idx < iterables.length) && (idx > -1)) {
          var iterable = this._getIterables(root)[idx];
          bestSoFar.push([root, iterable]);          
        } else {
          bestSoFar.push([root, undefined]);
        }
      }
    }

    if (node.parentNode == null) {
      return bestSoFar;
    } else {
      return this._collectAresUpRoot(node.parentNode, bestSoFar, node);
    }
  },

  _makeAreTreeFilter: function(node, newChild, newChildIndex) {
    var topMostAreRoots = this._collectAresUpRoot(node, [], newChild, newChildIndex);
    var filterFns = Util._.map(topMostAreRoots, function(tup) {
      // debugger;
      return Util.Helper.rejectUnless(tup[0], tup[1]);
    });
    var filterFn = function(r) {
      var passed = true;
      for (var i = 0; i < filterFns.length; i++) {
        passed = passed && filterFns[i](r);
      }
      return passed;
    }
    return filterFn;
  },

  eventInterestFor: function(n) {
    return [];
  }
};

module.exports = Relation;
