/*
 * ARE
 * ===
 *
 * Intended as a Mix-In to Relation.
 */

var RelationBase = require('../relation');
var Util = require('cts/util');

var Are = function(node1, node2, spec) {
  this.initializeBase(Are, 'are', node1, node2, spec);
};

Util._.extend(Are.prototype, RelationBase.Base, {
  getDefaultOpts: function() {
    return {
      prefix: 0,
      suffix: 0,
      step: 0
    };
  },

  execute: function(toward, opts) {
    if (this.forGraftOnly()) {
      return Util.Promise.resolve();
    }

    return this._Are_AlignCardinalities(toward, opts);
//    toward.trigger('received-are', {
//      target: toward,
//      source: this.opposite(toward),
//      relation: this
//    });
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new Are(n1, n2, this.spec);
  },
  
  _Are_AlignCardinalities: function(toward, opts) {
    // var d = Util.Promise.defer();
  
    var from = this.opposite(toward);
    var fromIterables = from.getIterables(this.optsFor(from));
    var toOpts = this.optsFor(toward);
    var toIterables = toward.getIterables(toOpts);

    var self = this;

    var filterFn = undefined;
    if (opts && opts.relationFilterFn) {
      filterFn = opts.relationFilterFn;
    }
    // First we either take it down or forward.
    var diff = toIterables.length - fromIterables.length;
    if (! toOpts.mod) {
      toOpts.mod = toIterables.length;
    }

    var promises = [];

    // Filter the overlap
    for (var i = 0; i < Math.max(fromIterables.length, toIterables.length); i++) {
      var fi = (i < fromIterables.length) ? fromIterables[i] : null;
      var ti = (i < toIterables.length) ? toIterables[i] : null;
      if (fi) {
        fi.pruneRelations(toward, ti);
        if (filterFn) {
          fi.pruneRelations(undefined, undefined, filterFn);
        }
      }
      if (ti) {
        ti.pruneRelations(from, fi);
        if (filterFn) {
          ti.pruneRelations(undefined, undefined, filterFn);
        }
      }
    }

    // Whittle down
    while (diff > 0) {
      var bye = toIterables.pop();
      bye.destroy();
      diff--;
    }    

    var clones = [];
    while (diff < 0) {
      var cloneIdx = toIterables.length % toOpts.mod;
      clones.push(toward.cloneIterable(cloneIdx, undefined, false, undefined, undefined, filterFn, this.optsFor(toward)));
      diff++;
    }

    var d = Util.Promise.defer();

    Util.Promise.all(clones).then(
      function(clones) {
        // Util._.each(clones, function(clone) {
        //   toward.insertChild(clone, undefined, false, false);
        // });
        d.resolve(clones);
      }
    )
  },

  /*
   * Returns the number of items in the set rooted by this node,
   * respecting the prefix and suffix settings provided to the relation.
   *
   * An assumption is made here that the tree structure already takes
   * into an account the step size, using intermediate nodes.
   */
  _Are_GetCardinality: function(node) {
    var opts = this.optsFor(node);
    return node.getChildren().length - opts.prefix - opts.suffix;
  },

  eventInterestFor: function(n) {
    return ['transform'];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.operation) {
      // It's a transform.
      if (evt.operation == 'node-inserted') {
        var self = this;
        this.relayTransform(evt, thrownFrom, thrownTo, function(t) {
          t.iterableOpts = self.optsFor(thrownTo);
        });
      } else if (evt.operation == 'node-removed') {
        var self = this;
        this.relayTransform(evt, thrownFrom, thrownTo, function(t) {
          t.iterableOpts = self.optsFor(thrownTo);
        });        
      }
    }
  }
});

module.exports = Are;
