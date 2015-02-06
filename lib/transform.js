var Util = require('cts/util');

// Transform
// ==========================================================================

function guid() {
  function _p8(s) {
      var p = (Math.random().toString(16)+"000000000").substr(2,8);
      return s ? "-" + p.substr(0,4) + "-" + p.substr(4,4) : p ;
  }
  return _p8() + _p8(true) + _p8(true) + _p8();
}


// Constructor
// -----------
var Transform = function(opts) {
  opts = opts || {};

  this.guid = guid();
 
  /* The transform which caused this one to be created out of mimicry. 
   *
   * For example: a node is inserted into Tree1. This causes related Tree2
   * to add a node. The transform describing Tree2's action is a mimic of
   * the one describing Tree1's action. This record keeping helps prevent
   * event loops.
   */
  this.mimicOf = null;

  /* A container for this transform to store mimics of itself.
   */
  this.mimicsOfMe = null;

  /* The operation that describes this transform.
   * May be one of:
   *  - node-inserted
   *  - node-removed
   *  - set-value
   */
  this.operation = opts.operation || null;

  /* Provides the application context in which this transform took place.
   */
  this.appContext = opts.appContext || null;

  /* Provides the tree name where this transform took place.
   */
  this.treeName = opts.treeName || null;

  /* Provides the tree name where this transform took place.
   */
  this.treeUrl = opts.treeUrl || null;  

  /* Provides the node identifier within the tree where this transform took place.
  */
  this.nodeIdentifier = opts.nodeIdentifier || null;

  /* Flag to report the transform state.
   */
  this.state = opts.state || null;

  /* An object describing any new arguments to the transform.
   */
  if (typeof opts.value === 'undefined') {
    this.value = null;
  } else {
    this.value = opts.value;    
  }

  /* The actual cts node.
   */
  this.node = opts.node || null;

  /* The actual cts node.
   */
  this.fromRemote = false;

  if (typeof opts.fromRemote != 'undefined') {
    this.fromRemote = opts.fromRemote;
  }

  /* The args.
   */
  this.args = opts.args || {};

};

// Instance Methods
// ----------------
Util._.extend(Transform.prototype, {
  toJson: function() {
    var t = {
      operation: this.operation,
      appContext: this.appContext,
      treeName: this.treeName,
      nodeIdentifier: this.nodeIdentifier,
      value: this.value,
      args: this.args,
      guid: this.guid
    };
    return t;
  },

  registerMimic: function(transform) {
    if (this.mimicsOfMe == null) {
      this.mimicsOfMe = [];
    }
    this.mimicsOfMe.push(transform);
    transform.mimicOf = this;
  },

  changeState: function(newState) {
    if (! (newState === this.state)) {
      this.state = newState;
      if (this.node && this.node.transformStateChanged) {
        this.node.transformStateChanged(this);
      }
      if (this.mimicOf) {
        this.mimicOf.changeState(newState);
      }
      if (this.mimicsOfMe && this.mimicsOfMe.length) {
        for (var i = 0; i < this.mimicsOfMe.length; i++) {
          this.mimicsOfMe[i].changeState(newState);
        }
      }
    }
  },

  relayFor: function(node) {
    if (this.mimicOf && this.mimicOf.node && (this.mimicOf.node == node)) {
      return null;
    }
    if (this.mimicsOfMe && this.mimicsOfMe.length) {
      for (var i = 0; i < this.mimicsOfMe.length; i++) {
        if (this.mimicsOfMe[i] && this.mimicsOfMe[i].node && (this.mimicsOfMe[i].node == node)) {
          return null;
        }
      }
    }
    var t = new Transform(this);
    t.node = node;
    t.treeName = node.tree.name;
    t.nodeIdentifier = null;
    this.registerMimic(t);
    return t;
  }

});

module.exports = Transform;
