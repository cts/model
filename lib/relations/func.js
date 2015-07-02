/*
 * Func
 * ====
 *
 * A light-weight functional relationship between nodes.
 *
 * Node {on: click} :func Node {update: "f(self, other, reln, evt) { return self.value }"}
 *
 */

var RelationBase = require('../relation');
var Util = require('cts/util');

var Func = function(node1, node2, spec) {
  this.initializeBase(Func, 'func', node1, node2, spec);
  this.node1Opts = this.optsFor(this.node1);
  this.node2Opts = this.optsFor(this.node2);
};

Util._.extend(Func.prototype, RelationBase.Base, {

  initialize: function() {
    var self = this;
    if (this.node1Opts.on && node2Opts.update) {
      this.node2UpdateFn = eval(node2Opts.update);
      this.node1.on(this.node1opts.on, function(evt) {
        var other = self.node1;
        var slf = self.node2;
        var newVal = self.node2UpdateFn(slf, other, self, evt);
        slf.setValue(newVal);
      });
    }
    if (this.node2Opts.on && node1Opts.update) {
      this.node1UpdateFn = eval(node1Opts.update);
      this.node2.on(this.node2opts.on, function(evt) {
        var other = self.node2;
        var slf = self.node1;
        var newVal = self.node1UpdateFn(slf, other, self, evt);
        slf.setValue(newVal);
      });
    }
    this.initializeBase();
  },

  execute: function(toward) {
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

  eventInterestFor: function(n) {
    return ['ValueChanged'];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.eventName == 'ValueChanged') {
      if ((thrownFrom == this.node1) && (this.node2UpdateFn)) {
        var update = this.node2UpdateFn(this.node2, this.node1, this, evt);
        this.node2.setValue(update);
      } else if ((thrownFrom == this.node1) && (this.node2UpdateFn)) {
        var update = this.node1UpdateFn(this.node1, this.node2, this, evt);
        this.node1.setValue(update);
      }
    }
  }



});

module.exports = Func;
