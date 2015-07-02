/*
 * Updates
 * =======
 *
 * Creates a trigger that calls an update function.
 */

var Util = require('cts/util');
var RelationBase = require('../relation');

var Updates = function(node1, node2, spec) {
  this.initializeBase(Updates, 'updates', node1, node2, spec);
};

Util._.extend(Updates.prototype, RelationBase.Base, {

  buildWithFunction: function(fnStr) {
    var withFn = function(val, otherNode, evt) {
      return eval(fnStr);
    };
    return withFn;
  },
  execute: function(toward) {
    if (this.forGraftOnly()) {
      return;
    }

    var opp = this.opposite(toward);
    var oppOpts   = this.optsFor(opp);
    var opts = this.optsFor(toward);

    var d = Util.Promise.defer();
    var self = this;
    if ((typeof opts.with === 'string') && (typeof opts.on === 'string')) {
    	if (typeof toward.value.on === 'function') {
		    var withFn = this.buildWithFunction(opts.with);
    		toward.value.on(opts.on, function(evt) {
    			var val = opp.getValue();    		
          var valInt = parseInt(val);
          if (! Util._.isNaN(valInt)) {
            val = valInt;
          }
    			var newVal = withFn(val, opp, evt);
    			opp.setValue(newVal, undefined, undefined, true);
    		});
    	}
    }

    d.resolve();
    return d.promise;
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new Updates(n1, n2, this.spec);
  },

  eventInterestFor: function(n) {
  	// No interest since the updates relation is the way we bleed in side effects
  	// from OUTSIDE-initiated events.
    return [];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
  }

});

module.exports = Updates;
