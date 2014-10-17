// Node
// --------------------------------------------------------------------------
//
// A Node represents a fragment of a tree which is annotated with CTS.
//
// Nodes are responsible for understanding how to behave when acted on
// by certain relations (in both directions). The differences between
// different types of trees (JSON, HTML, etc) are concealed at this level.

var Util = require('cts/util');
var Parser = require('cts/parser');
var Node = {};

Node.Base = {

  initializeNodeBase: function(tree, opts) {
    this.opts = opts;
    this.tree = tree;
    this.kind = null;
    this.children = [];
    this.parentNode = null;
    this.relations = [];
    this.value = null;
    this.shouldThrowEvents = false;
    this.shouldReceiveEvents = false;
    this.inlineRelationSpecs = [];
    this.parsedInlineRelationSpecs = false;
    this.realizedInlineRelationSpecs = false;
    this._lastValueChangedValue = null;
  },

  getChildren: function() {
    return this.children;
  },

  containsRelation: function(relation) {
    if (! this.relations) {
      return false;
    }
    if (Util._.contains(this.relations, relation)) {
      return true;
    }
    for (var i = 0; i < this.relations.length; i++) {
      if (this.relations[i].equals(relation)) {
        return true;
      }
    }
    return false;
  },

  registerRelation: function(relation) {
    if (typeof this.relations == 'undefined') {
      this.relations = [];
    }
    if (! this.containsRelation(relation)) {
      this.relations.push(relation);
      var events = relation.eventInterestFor(this);
      for (var i = 0; i < events.length; i++) {
        this.on(events[i], relation.handleEventFromNode, relation);
      }
    }
  },

  unregisterRelation: function(relation, dontRefresh) {
    var events = relation.eventInterestFor(this);
    for (var i = 0; i < events.length; i++) {
      this.off(events[i], relation.handleEventFromNode, relation);
    }
    if (dontRefresh) return;
    this.relations = Util._.filter(this.relations,
      function(r) { return r != relation; });
  },

  getRelations: function() {
    if (! this.realizedInlineRelationSpecs) {
      for (var i = 0; i < this.inlineRelationSpecs.length; i++) {
        var spec = this.inlineRelationSpecs[i];
        this.tree.forrest.realizeRelation(spec);
      }
      this.realizedInlineRelationSpecs = true;
    }
    return this.relations;
  },

  realizeInlineRelationSpecsRecursive: function() {
    if (! this.realizedInlineRelationSpecs) {
      for (var i = 0; i < this.inlineRelationSpecs.length; i++) {
        var spec = this.inlineRelationSpecs[i];
        this.tree.forrest.realizeRelation(spec);
      }
      this.realizedInlineRelationSpecs = true;
    }
    for (var i = 0; i < this.children.length; i++) {
      this.children[i].realizeInlineRelationSpecsRecursive();
    }
  },

  parseInlineRelationSpecs: function() {
    var deferred = Util.Promise.defer();
    var self = this;

    // Already added
    if (this.parsedInlineRelationSpecs === true) {
      Util.Log.Warn("Not registering inline relations: have already done so.");
      deferred.resolve();
      return deferred.promise;
    }

    self.parsedInlineRelationSpecs = true;
    var specStr = this._subclass_getInlineRelationSpecString();

    // No inline spec
    if (! specStr) {
      deferred.resolve();
      return deferred.promise;
    }

    if (typeof this.tree == 'undefined') {
      deferred.reject("Undefined tree");
      return deferred.promise;
    }

    if (typeof this.tree.forrest == 'undefined') {
      deferred.reject("Undefined forrest");
      return deferred.promise;
    }

    var self = this;

    Parser.parseInlineSpecs(specStr, self, self.tree.forrest, true).then(
      function(forrestSpecs) {
        Util._.each(forrestSpecs, function(forrestSpec) {
          if (typeof forrestSpec.relationSpecs != 'undefined') {
            self.inlineRelationSpecs = forrestSpec.relationSpecs;
          }
        });
        deferred.resolve();
      },
      function(reason) {
        deferred.reject(reason);
      }
    );

    return deferred.promise;
  },

  parseInlineRelationSpecsRecursive: function() {
    var d = Util.Promise.defer();
    var self = this;
    this.parseInlineRelationSpecs().then(
      function() {
        Util.Promise.all(Util._.map(self.children, function(kid) {
           return kid.parseInlineRelationSpecsRecursive();
        })).then(function() {
          d.resolve();
        }, function(reason) {
          d.reject(reason);
        });
      },
      function(reason) {
        d.reject(reason);
      }
    );
    return d.promise;

  },

  realizeInlineRelationSpecs: function(recursive, filterFn) {
    if (! this.realizedInlineRelationSpecs) {
      for (var i = 0; i < this.inlineRelationSpecs.length; i++) {
        var spec = this.inlineRelationSpecs[i];
        this.tree.forrest.realizeRelation(spec, undefined, filterFn);
      }
      this.realizedInlineRelationSpecs = true;
    }

    if (recursive) {
      for (var i = 0; i < this.getChildren().length; i++) {
        this.children[i].realizeInlineRelationSpecs(recursive, filterFn);
      }
    }
  },


  getSubtreeRelations: function() {
    return Util._.union(this.getRelations(), Util._.flatten(
      Util._.map(this.getChildren(), function(kid) {
        return kid.getSubtreeRelations();
      }))
    );
    /*
       var deferred = Q.defer();

    this.getRelations().then(function(relations) {
      var kidPromises = Util._.map(this.getChildren(), function(kid) {
        return kid.getSubtreeRelations();
      });
      if (kidPromises.length == 0) {
        deferred.resolve(relations);
      } else {
        Q.allSettled(kidPromises).then(function(results) {
          var rejected = false
          var kidRelations = [];
          results.forEach(function(result) {
            if (result.state == "fulfilled") {
              kidRelations.push(result.value);
            } else {
              rejected = true;
              Util.Log.Error(result.reason);
              deferred.reject(result.reason);
            }
          });
          if (!rejected) {
            var allR = Util._.union(relations, Util._.flatten(kidRelations));
            deferred.resolve(allR);
          }
        });
      }
    }, function(reason) {
      deferred.reject(reason);
    });

    return deferred.promise;
    */
  },

  insertChild: function(node, afterIndex, throwEvent, realizeRelations, beforeRealizeFn) {
    if (typeof afterIndex == 'undefined') {
      afterIndex = this.children.length - 1;
    }
    this.children[this.children.length] = null;
    for (var i = this.children.length - 1; i > afterIndex; i--) {
      if (i == (afterIndex + 1)) {
        this.children[i] = node;
      } else {
        this.children[i] = this.children[i - 1];
      }
    }
    node.parentNode = this;

    if (beforeRealizeFn) {
      beforeRealizeFn(this);
    }

    // Now we need to realize relations for this node.
    if (realizeRelations) {
      this.tree.forrest.realizeRelations(node);
    }

    //TODO(eob) Have this be an event
    this._subclass_insertChild(node, afterIndex);

    if (throwEvent) {
      this.trigger("ChildInserted", {
        eventName: "ChildInserted",
        ctsNode: node,
        sourceNode: this,
        sourceTree: this.tree,
        afterIndex: afterIndex
      });
    }
  },

  isDescendantOf: function(other) {
    var p = this.parentNode;
    while (p != null) {
      if (p.equals(other)) {
        return true;
      }
      p = p.parentNode;
    }
    return false;
  },

  replaceChildrenWith: function(nodes) {
    var goodbye = this.children;
    this.children = [];
    for (var i = 0; i < goodbye.length; i++) {
      goodbye[i]._subclass_destroy();
    }
    // Now clean up anything left
    this._subclass_ensure_childless();

    for (var j = 0; j < nodes.length; j++) {
      this.insertChild(nodes[j]);
    }
  },

  // TODO(eob): potentially override later
  equals: function(other) {
    return this == other;
  },

  hide: function() {

  },

  unhide: function() {

  },

  unrealize: function() {
    while (this.relations.length > 0) {
      this.relations[0].destroy();
    }

    for (var i = 0; i < this.inlineRelationSpecs.length; i++) {
      this.tree.forrest.removeRelationSpec(this.inlineRelationSpecs[i]);
    }

    this.toggleThrowDataEvents(false);
    this._subclass_unrealize();
    for (var i = 0; i < this.children.length; i++) {
      this.children[i].unrealize();
    }
  },

  _subclass_unrealize: function() {

  },

  destroy: function(destroyValueToo) {
    var gotIt = false;
    if (typeof destroyValueToo == 'undefined') {
      destroyValueToo = true;
    }
    if (this.parentNode) {
      for (var i = 0; i < this.parentNode.children.length; i++) {
        if (this.parentNode.children[i] == this) {
          Util.Helper.arrDelete(this.parentNode.children, i, i);
          gotIt = true;
          break;
        }
      }
    }

    for (var i = 0; i < this.relations.length; i++) {
      this.relations[i].destroy();
    }
    // No need to log if we don't have it. That means it's root.
    // TODO(eob) log error if not tree root
    if (destroyValueToo) {
      this._subclass_destroy();
    }
  },

  undestroy: function() {
  },

  realizeChildren: function() {
    var deferred = Util.Promise.defer();

    if (this.children.length != 0) {
      Util.Log.Fatal("Trying to realize children when already have some.", this);
      deferred.reject("Trying to realize when children > 0");
    }

    var self = this;
    var sc = this._subclass_realizeChildren();

    sc.then(
      function() {
        var promises = Util._.map(self.children, function(child) {
          return child.realizeChildren();
        });
        Util.Promise.all(promises).then(
          function() {
            deferred.resolve();
          },
          function(reason) {
            deferred.reject(reason);
          }
        );
      },
      function(reason) {
        deferred.reject(reason);
      }
    );

    return deferred.promise;
  },

  addGrafter: function(grafter) {
    if (typeof this.grafters == 'undefined') {
      this.grafters = [grafter];
    } else {
      this.grafters.push(grafter);
    }
  },

  getGrafters: function() {
    if (typeof this.grafters == 'undefined') {
      this.grafters = [];
    }
    return this.grafters;   
  },

  clone: function(runBeforeAnyPersistenceFn, cloneRelations, moveRelationsForSubtree, filterFn) {
    var deferred = Util.Promise.defer();
    var self = this;
    if (typeof cloneRelations == 'undefined') {
      cloneRelations = true;
    }
    
    this._subclass_beginClone().then(
      function(clone) {
        if (typeof clone == 'undefined') {
          Util.Log.Fatal("Subclass did not clone itself when asked.");
          deferred.reject("Subclass did not clone itself when asked");
        } else {
          if (clone.relations.length > 0) {
            Util.Log.Error("Clone shouldn't have relations yet, but does", clone);
          }

          clone.parentNode = this.parentNode;

          // Note that we DON'T wire up any parent-child relationships
          // because that would result in more than just cloning the node
          // but also modifying other structures, such as the tree which
          // contained the source.
          if (cloneRelations || moveRelationsForSubtree) {
            self.recursivelyCloneRelations(clone, moveRelationsForSubtree, filterFn);
          }

          // For the love of god, make the asynchronicity stop
          if (runBeforeAnyPersistenceFn) {            
            if (clone._subclass_endClone) {
              runBeforeAnyPersistenceFn(clone).then(
                function() {
                  clone._subclass_endClone().then(
                    function() { 
                      deferred.resolve(clone) },
                    function(reason) { deferred.reject(reason); }
                  );
                },
                function(reason) { deferred.reject(reason); }
              );
            } else {
              runBeforeAnyPersistenceFn(clone).then(
                function() {           
                  deferred.resolve(clone) },
                function(reason) { deferred.reject(reason); }
              );
            }
          } else {
            if (clone._subclass_endClone) {
              clone._subclass_endClone().then(
                function() { 
                  deferred.resolve(clone) 
                },
                function(reason) { deferred.reject(reason); }
              );
            } else {
              deferred.resolve(clone);
            }
          }
        }
      },
      function(reason) {
        deferred.reject(reason);
      }
    );
    return deferred.promise;
  },

  recursivelyCloneRelations: function(to, moveRelationsForSubtree, filterFn) {
    if (typeof to == 'undefined') {
      debugger;
    }
    var r = this.getRelations();

    if (to.relations && (to.relations.length > 0)) {
      Util.Log.Error("Clone relations to non-empty relation container. Blowing away");
      while (to.relations.length > 0) {
        to.relations[0].destroy();
      }
    }

    for (var i = 0; i < r.length; i++) {
      if ((! filterFn) || filterFn(r[i])) {
        var n1 = r[i].node1;
        var n2 = r[i].node2;
        var other;
        if (n1 == this) {
          n1 = to;
          other = n2;
        } else if (n2 == this) {
          n2 = to;
          other = n1;
        } else {
          Util.Log.Fatal("Clone failed. Found relation not attached to cloning node.");
        }
        var relationClone = r[i].clone(n1, n2);
        if (moveRelationsForSubtree) {
          if (other.equals(moveRelationsForSubtree) || other.isDescendantOf(moveRelationsForSubtree)) {
            // Remove the original!
            r[i].destroy();
          }
        }        
      }
    };

    for (var j = 0; j < this.getChildren().length; j++) {
      var myKid = this.children[j];
      var otherKid = to.children[j];
      if (typeof otherKid == 'undefined') {
        Util.Log.Error("Cloned children out of sync with origin children.");
      }
      myKid.recursivelyCloneRelations(otherKid, moveRelationsForSubtree, filterFn);
    }
  },

  pruneRelations: function(rejectUnder, unlessWithin, filterFn) {
    var self = this;
    var l1 = this.relations.length;

    if (typeof filterFn == 'undefined') {
      filterFn =  Util.Helper.rejectUnless(rejectUnder, unlessWithin);
    }

    var markOnly = ((typeof filterFn.deletionPolicy != 'undefined') && (filterFn.deletionPolicy == 'mark'));

    var newRelations = [];
    for (var i = 0; i < this.relations.length; i++) {
      if (filterFn(this.relations[i])) {
        newRelations.push(this.relations[i]);
        this.relations[i].forGraftOnly(false);
      } else {
        if (markOnly) {
          this.relations[i].forGraftOnly(true) 
          newRelations.push(this.relations[i]);
        } else {
          this.unregisterRelation(this.relations[i], true);
        }
      }
    }
    this.relations = newRelations;
    for (var i = 0; i < this.children.length; i++) {
      this.children[i].pruneRelations(rejectUnder, unlessWithin, filterFn);
    }
  },

  setIsGraftClone: function(of) {
    this.parentNode = null;
    this.graftCloneOf = of;
  },

  isInGraftCloneOf: function(node) {
    if (this.parentNode) {
      return this.parentNode.isInGraftCloneOf(node);
    } else {
      return (node.equals(this.graftCloneOf));
    }
  },

  maybeTrigger: function(eventName, eventData) {
    this._subclass_maybeTrigger(eventName, eventData);
  },

  getProvenance: function() {
    if (this.provenance == null) {
      if (this.parentNode == null) {
        // We're the root of a tree. This is an error: the root should always know where it
        // came from.
        Util.Log.Error("Root of tree has no provenance information");
        return null;
      } else {
        return this.parentNode.getProvenance();
      }
    } else {
      return this.provenance;
    }
  },

  setProvenance: function(tree, node) {
    this.provenance = {
      tree: tree
    }
    if (! Util._.isUndefined(node)) {
      this.provenance.node = node;
    }
  },

  _processIncoming: function(insideOtherSubtree, opts, root) {
    // Do incoming nodes except graft
    var d = Util.Promise.defer();
    var self = this;
    var r = this.getRelations();
    if (typeof root == 'undefined') {
      root = this;
    }

    if (opts && opts.disableRemote) {
      this._oldDisableRemoteVal = this.disableRemote;
      this.disableRemote = true;
    }

    var directional = true;
    if (opts && (opts.directional === false)) {
      directional = false;
    }

    // We only want to process in the direction of ourselves if we're the descendant of
    // the rendering root.
    if (this.equals(root) || this.isDescendantOf(root)) {
      self._processIncomingRelations(r, 'if-exist', insideOtherSubtree, false, false, directional);
      self._processIncomingRelations(r, 'if-nexist', insideOtherSubtree, false, false, directional);
      self._processIncomingRelations(r, 'is', insideOtherSubtree, false, true, directional).then(function() {
        return self._processIncomingRelations(r, 'are', insideOtherSubtree, true, true, directional)
      }).then(function() {
        return Util.Promise.all(Util._.map(self.getChildren(), function(child) {
          return child._processIncoming(insideOtherSubtree, opts, root);
        }));
      }).then(function() {
        return self._processIncomingRelations(r, 'graft', insideOtherSubtree, true, true, directional);
      }).then(function() {
        if (opts && opts.disableRemote) {
          this.disableRemote = this._oldDisableRemoteVal;
        }
        d.resolve();
      }, function(reason) {
        Util.Log.error(reason);
        d.reject(reason);
      });
    } else {
      if (opts && opts.disableRemote) {
        this.disableRemote = this._oldDisableRemoteVal;
      }
      d.resolve();
    }

    return d.promise;
  },

  maybeThrowReceivedGraftEvent: function() {
    // override by subclass
  },

  _processIncomingRelations: function(relations, name, insideOtherSubtree, once, defer, directional) {
    if (defer) {
      promises = [];
    }
    if (typeof insideOtherSubtree != 'undefined') {
      insideOtherSubtree = !!insideOtherSubtree;
    } else {
      insideOtherSubtree = false;
    }
    for (var i = 0; i < relations.length; i++) {
      if (relations[i].name == name) {
        if ((! directional) || (relations[i].node1.equals(this))) {
          if ((! insideOtherSubtree) || 
              ((insideOtherSubtree) && (relations[i].node2.isDescendantOf(insideOtherSubtree)))) {
            if (defer) {
              var res = relations[i].execute(this);
              if (res) {
                promises.push(res);
              }
            } else {
              relations[i].execute(this);
            }
            if (once) {
              break;
            }            
          }
        }
      }
    }
    if (defer) {
      return Util.Promise.all(promises);
    }
  },

  /************************************************************************
   **
   ** Methods to be overridden by subclasses
   **
   ************************************************************************/

  getValue: function(opts) {
    return this.value;
  },

  getIfExistValue: function() {
    // The node's existence is enough by default.
    return this.value;
  },

  setValue: function(v, opts) {
    this.value = v;
  },

  hasRule: function(name) {
    for (var i = 0; i < this.relations.length; i++) {
      if (this.relations[i].name == name) {
        return true;
      }
    }
    return false;
  },

  /* Parent needs to have an ARE and we also need to be within
   * the scope.
   */
  isEnumerated: function() {
    if (this.parentNode != null) {
      var p = this.parentNode;
      for (var i = 0; i < p.relations.length; i++) {
        if (p.relations[i].name == 'are') {
          var r = p.relations[i];
          var opts = r.optsFor(p);
          var kids = p.getChildren();
          var iterables = kids.slice(opts.prefix, kids.length - opts.suffix);
          if (iterables.indexOf(this) > -1) {
            return true;
          }
        }
      }
    }
    return false;
  },

  descendantOf: function(other) {
    return false;
  },

  /***************************************************************************
   * EVENTS
   *
   * Two modes:
   *   - shouldThrowEvents
   *   - shouldReceiveEvents (and modify)
   *
   * Events are dicts. The `name` field contains the type.
   *
   * ValueChanged:
   *   newValue -- contains the new value
   *
   **************************************************************************/

  toggleThrowDataEvents: function(bool) {
    if (bool == this.shouldThrowEvents) {
      return;
    } else if (bool) {
      this.shouldThrowEvents = true;
      this._subclass_throwChangeEvents(true);
    } else {
      this.shouldThrowEvents = false;
      this._subclass_throwChangeEvents(false);
    }
  },

  _maybeThrowDataEvent: function(evt) {
    if (this.shouldThrowEvents) {
      if (evt.ctsNode) {
        evt.newValue = evt.ctsNode.getValue();
        if (evt.eventName == 'ValueChanged') {
          // Maybe squash if we're in an echo chamber.
          if (this._lastValueChangedValue == evt.newValue) {
            // An echo! Stop it here.
            Util.Log.Info("Suppressing event echo", this, evt);
            this._lastValueChangedValue = null;
            return;
          } else {
            this._lastValueChangedValue = evt.newValue;
            evt.sourceNode = this;
            evt.sourceTree = this.tree;
            this.trigger(evt.eventName, evt);
            if (this.tree && this.tree.trigger) {
              this.tree.trigger(evt.eventName, evt); // Throw it for the tree, too.
            }
          }
        }
      }
    }
  },

  toggleReceiveRelationEvents: function(bool, recursive) {
    if (bool == this.shouldReceiveEvents) {
      return;
    } else if (bool) {
      this.shouldReceiveEvents = true;
    } else {
      this.shouldReceiveEvents = true;
    }

    if (recursive) {
      for (var i = 0; i < this.getChildren().length; i++) {
        this.children[i].toggleReceiveRelationEvents(bool, recursive);
      }
    }
  },

  /***************************************************************************
   * STUBS FOR SUBCLASS
   **************************************************************************/

  _subclass_onDataEvent: function() {},
  _subclass_offDataEvent: function() {},
  _subclass_realizeChildren: function() {},
  _subclass_insertChild: function(child, afterIndex) {},
  _subclass_destroy: function() {},
  _subclass_beginClone: function() {},
  _subclass_getInlineRelationSpecString: function() { return null; },
//  _subclass_trigger: function(eventName, eventData) { },
  _subclass_ensure_childless: function() { },
};

module.exports = Node;
