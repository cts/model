/*
 * IS
 * ==
 *
 * Intended as a Mix-In to Relation.
 */

var Util = require('cts/util');
var RelationBase = require('../relation');

var Is = function(node1, node2, spec) {
  this.initializeBase(Is, 'is', node1, node2, spec);
};

Util._.extend(Is.prototype, RelationBase.Base, {

  execute: function(toward) {
    // CTS.Fn.map(this.node1.relations, function(r) {console.log(r.node2.ctsId, r.spec.forCreationOnly, r.node2.value.val(), r.node2.value[0])})
    if (this.forGraftOnly()) {
      return;
    }

    var from = this.opposite(toward);
    var content = from.getValue(this.optsFor(from));
    var res = toward.setValue(content, this.optsFor(toward), this);
    toward.setProvenance(from.tree, from);
    return res;
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new Is(n1, n2, this.spec);
  },

  eventInterestFor: function(n) {
    return ['transform'];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.operation) {
      // It's a transform.
      if (evt.operation == 'set-value') {    
        // It's for me.
        var self = this;
        this.relayTransform(evt, thrownFrom, thrownTo, function(t) {
          t.relationOpts = self.optsFor(thrownTo);
        });
      }
    } 
  }

});

module.exports = Is;
