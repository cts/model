var Util = require('cts/util');
var RelationBase = require('../relation');

var If = function(node1, node2, spec) {
  this.initializeBase(If, 'if', node1, node2, spec);
};

Util._.extend(If.prototype, RelationBase.Base, {

  execute: function(toward) {
    if (this.spec.forCreationOnly) {
      return;
    }
    // default: existential
    var other = this.opposite(toward);
    var value = this.truthyOrFalsy(other);    
    var negate = (this.spec.opts && (!! this.spec.opts.negate));
    if (negate) {
      value = !value;
    }
    toward.setVisibility(value, this.optsFor(toward), this);
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new If(n1, n2, this.spec);
  },

  eventInterestFor: function(n) {
    return ['ValueChanged'];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.eventName == 'ValueChanged') {
      this.execute(thrownTo);      
    }
  }

});

module.exports = If;
