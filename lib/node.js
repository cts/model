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
var Helpers = require('./helpers.js');
var Transform = require('./transform.js');
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
    ).done();

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
    ).done();
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
      var t = new Transform({
        operation: 'node-inserted',
        treeName: this.tree.name,
        treeUrl: this.tree.spec.url,
        node: this,
        value: node,
        args: {
          index: afterIndex+1
        }
      });
      this.announceTransform(t);    
    }
  },

  removeChild: function(node, throwEvent) {
    var index = Util._.indexOf(this.children, node);
    if (index > -1) {

      Util.Helper.arrDelete(this.children, index, index);

      if (this._subclass_removeChild) {
        this._subclass_removeChild(node, index);
      }

      if (throwEvent) {
        var t = new Transform({
          operation: 'node-removed',
          treeName: this.tree.name,
          treeUrl: this.tree.spec.url,
          node: this,
          value: node,
          args: {
            index: index
          }
        });
        this.announceTransform(t);
      }        
    } else {
      CTS.Log.Error("Tried to remove child that wasn't in parent.");
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

  forGraftOnly: function(val, recursive) {
    if (typeof val == 'undefined') {
      return ((typeof this._forGraftOnly != 'undefined') && (this._forGraftOnly === true));
    } else if (val) {
      this._forGraftOnly = true;
      if (recursive) {
        for (var i = 0; i < this.children.length; i++) {
          this.children[i].forGraftOnly(val, recursive);
        }      
      }
      return true;
    } else {
      this._forGraftOnly = false;
      if (recursive) {
        for (var i = 0; i < this.children.length; i++) {
          this.children[i].forGraftOnly(val, recursive);
        }      
      }
      return false;
    }
  },

  // TODO(eob): potentially override later
  equals: function(other) {
    return this == other;
  },

  setVisibility: function(val, opts, relation) {

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
        ).done();
      },
      function(reason) {
        deferred.reject(reason);
      }
    ).done();

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

  deleteFromNearestEnumeration: function() {
    // Find the nearest enumeration.
    var candidateIterable = this;

    while (candidateIterable.parentNode != null) {
      for (var i = 0; i < candidateIterable.parentNode.getRelations().length; i++) {
        if (candidateIterable.parentNode.relations[i].name == 'are') {   
          return candidateIterable.parentNode.removeChild(candidateIterable, true); 
        }
      }
      candidateIterable = candidateIterable.parentNode;
    }

    // If still here...
    CTS.Log.Error("Can not delete item from enumeration: none exists!");
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

          clone.parentNode = self.parentNode;

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
                  ).done();
                },
                function(reason) { deferred.reject(reason); }
              ).done();
            } else {
              runBeforeAnyPersistenceFn(clone).then(
                function() {           
                  deferred.resolve(clone) },
                function(reason) { deferred.reject(reason); }
              ).done();
            }
          } else {
            if (clone._subclass_endClone) {
              clone._subclass_endClone().then(
                function() { 
                  deferred.resolve(clone) 
                },
                function(reason) { deferred.reject(reason); }
              ).done();
            } else {
              deferred.resolve(clone);
            }
          }
        }
      },
      function(reason) {
        deferred.reject(reason);
      }
    ).done();
    return deferred.promise;
  },

  getIterables: function(opts) {
    var kids = this.getChildren();
    opts = opts || {};
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

  /* Returns a list of [parent, child] pairs, where parent is a related
   * collection in the lineage of this node, and child is the corresponding
   * iterable of that collection.
   *
   * In other words, this returns every RELATED container/iterable relevant
   * to the context of this node.
   *
   * myParent and myIndex are parameters here so that we can simulate an
   * iterable before it actually exists in the hierarchy.
   */
  getIterableLineage: function(myParent, myIndex, ret) {
    var self = this;
    if (typeof ret == 'undefined') {
      ret = [];
    }

    if (typeof myParent == 'undefined') {
      myParent = self.parentNode;
    }

    if (myParent == null) {
      return ret;
    }

    var ares = Util._.filter(myParent.relations, function(r) {
      return (r.name == 'are');
    });

    if (ares.length > 0) {
      for (var i = 0; i < ares.length; i++) {
        var are = ares[i];
        var relatedContainer = (are.node1 == myParent) ? are.node2 : are.node1;
        if (typeof myIndex == 'undefined') {
          myIndex = Util._.indexOf(myParent.getIterables(are.optsFor(myParent)), self);
        }
        var iterables = relatedContainer.getIterables(are.optsFor(relatedContainer));
        if ((myIndex < iterables.length) && (myIndex > -1)) {
          var iterable = iterables[myIndex];
          ret.push([relatedContainer, iterable]);          
        } else {
          ret.push([relatedContainer, undefined]);
        }
      }
    }

    return myParent.getIterableLineage(undefined, undefined, ret);
  },

  cloneIterable: function(cloneFromIndex, insertAfterIndex, throwEvent, beforePersistenceFn, cloneRelns, filterFn, iterableOpts) {
    var self = this;
    var deferred = Util.Promise.defer();
    if (typeof cloneRelns == 'undefined') {
      cloneRelns = false;
    }

    var iterables;

    if ((typeof self._prototypeIterables == 'undefined') || (self._prototypeIterables.length < 1)) {
      iterables = self.getIterables(iterableOpts);
      if (typeof insertAfterIndex == 'undefined') {
        insertAfterIndex = iterables.length - 1;
      }
    } else {
      iterables = self._prototypeIterables;
      if (typeof insertAfterIndex == 'undefined') {
        insertAfterIndex = -1;
      }
    }

    var self = this;

    var cloned = function(clone) {
      // debugger;
      //  debugger;
      self.insertChild(clone, insertAfterIndex, throwEvent, false);
      // Force [lazy] evaluation of inline relations
      // var filterFn = self._makeAreTreeFilter(toward, clone, insertAfterIndex+1);
      var argFilter = clone.makeIterableLineageFilter(self, insertAfterIndex+1);
      clone.realizeInlineRelationSpecs(true, argFilter);
      // And now for external rules  
      self.tree.forrest.realizeRelations(clone, argFilter);        
      clone.pruneRelations(undefined, undefined, argFilter);

      if (filterFn) {
        clone.pruneRelations(undefined, undefined, filterFn);
      }

      // clone.pruneRelations(undefined, undefined, filterFn1);
      // Forces inline
      deferred.resolve(clone);      
    };

    // Here we'll actually do the cloning
    if (iterables.length > 0) {
      iterables[cloneFromIndex % iterables.length].clone(beforePersistenceFn, cloneRelns).then(
        cloned,
        function(err) {
          deferred.reject(err);
        }
      ).done();
    } else {      
      deferred.reject("No iterables to clone.");
    }
    return deferred;
  },

  /*
   * Filter which rejects relations into OTHER iterables of related collections.
   * myParent and myIndex  provided so we can simulate iterables before they are inserted.
   */
  makeIterableLineageFilter: function(myParent, myIndex) {
    var iterableLineage = this.getIterableLineage(myParent, myIndex);

    var filterFns = Util._.map(iterableLineage, function(tup) {
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


  // iterableCount: function(iterableOpts) {

  // },

  // iterableIndex: function(i, iterableOpts) {
  //   if (! iterableOpts) {
  //     return i;
  //   } else {

  //   }
  // },

  // cloneIterable: function(cloneFromIndex, insertAfterIndex, iterableOpts, throwEvent, opts) {
  //   opts = opts || {};
  //   var self = this;

  //   var deferred = Util.Promise.defer();
  //   if (typeof opts.cloneRelns == 'undefined') {
  //     opts.cloneRelns = false;
  //   } 
    
  //   var toClone = this.getIterable(cloneFromIndex, iterableOpts);

  //   if (typeof insertAfterIndex == 'undefined') {
  //     insertAfterIndex = iterables.length - 1;
  //   } else {
  //     insertAfterIndex = this.iterableCount(iterableOpts) - 1;
  //   }

  //   toClone.clone(opts.beforePersistenceFn, opts.cloneRelns).then(
  //     function(clone) {
  //       self.insertChild(clone, insertAfterIndex, throwEvent, false);

  //       opts.realizeFilter = self._makeAreTreeFilter(this, clone, insertAfterIndex+1);

  //       clone.realizeInlineRelationSpecs(true, opts.realizeFilter);
  //       // And now for external rules  
  //       self.tree.forrest.realizeRelations(clone, opts.realizeFilter);        

  //       clone.pruneRelations(undefined, undefined, opts.realizeFilter);

  //       if (opts.filterFn) {
  //         clone.pruneRelations(undefined, undefined, opts.filterFn);
  //       }

  //       deferred.resolve(clone); 
  //     },
  //     function(err) {
  //       deferred.reject(err);
  //     }
  //   );

  //   return deferred;
  // },

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
    var self = this;
    var newRelations = [];
    var toUnregister = [];
    var oldRelations = this.getRelations();

    for (var i = 0; i < oldRelations.length; i++) {
      var relation = oldRelations[i];
      if (filterFn(relation)) {
        newRelations.push(relation);
        if (filterFn.passPolicy === 'mark') {
          relation.forGraftOnly(false);          
        }
      } else {
        toUnregister.push(relation);
      }
    }

    for (var i = 0; i < toUnregister.length; i++) {
      var relation = toUnregister[i];
      if (markOnly) {
        relation.forGraftOnly(true);
        newRelations.push(relation);
      } else {
        relation.destroy();
      }      
    }

    this.relations = newRelations;
    for (var i = 0; i < this.children.length; i++) {
      this.children[i].pruneRelations(undefined, undefined, filterFn);
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

    opts = opts || {};

    if (typeof root == 'undefined') {
      root = this;
    }

    var oldDisableRemoteVal = (!!this.disableRemote);

    if (opts && opts.disableRemote) {
      this.disableRemote = true;
    }

    if (opts && (opts.directional === false)) {
      opts.directional = false;
    } else {
      opts.directional = true;
    }

    // We only want to process in the direction of ourselves if we're the descendant of
    // the rendering root.
    if (this.equals(root) || this.isDescendantOf(root)) {
      self._processIncomingRelations(r, 'if', insideOtherSubtree, false, false, opts);
      self._processIncomingRelations(r, 'is', insideOtherSubtree, false, true, opts).then(function() {
        return self._processIncomingRelations(r, 'are', insideOtherSubtree, true, true, opts)
      }).then(function() {
        return Util.Promise.all(Util._.map(self.getChildren(), function(child) {
          return child._processIncoming(insideOtherSubtree, opts, root);
        }));
      }).then(function() {
        return self._processIncomingRelations(r, 'creates', insideOtherSubtree, true, true, opts);
      }).then(function() {
        return self._processIncomingRelations(r, 'updates', insideOtherSubtree, true, true, opts);
      }).then(function() {
        return self._processIncomingRelations(r, 'graft', insideOtherSubtree, true, true, opts);
      }).then(function() {
        if (opts && opts.disableRemote) {
          self.disableRemote = oldDisableRemoteVal;
        }
        d.resolve();
      }, function(reason) {
        Util.Log.Error(reason);
        d.reject(reason);
      }).done();
    } else {
      if (opts && opts.disableRemote) {
        self.disableRemote = oldDisableRemoteVal;
      }
      d.resolve();
    }

    return d.promise;
  },

  maybeThrowReceivedGraftEvent: function() {
    // override by subclass
  },

  _processIncomingRelations: function(relations, name, insideOtherSubtree, once, defer, opts) {
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
        if ((! opts.directional) || (relations[i].node1.equals(this))) {
          if ((! insideOtherSubtree) || 
              ((insideOtherSubtree) && (relations[i].node2.isDescendantOf(insideOtherSubtree)))) {
            if (defer) {
              var res = relations[i].execute(this, opts);
              if (res) {
                promises.push(res);
              }
            } else {
              relations[i].execute(this, opts);
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

  _setValue: function(v, opts) {
    this.value = v;
  },

  setValue: function(v, opts) {
    this._setValue(v, opts);
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
   * TRANSFORMS
   **************************************************************************/

  /* Mutate the contents of this node with a transform and optionally announce it.
   */
  applyTransform: function(transform, announce) {
    console.log("Asked to apply transform", transform);
    if (transform.operation == 'set-value') {
      this._setValue(transform.value, transform.relationOpts);
      if (announce) {
        this.announceTransform(transform);
      }      
    } else if (transform.operation == 'node-inserted') {
      var insertedChild = transform.value;
      var afterIndex;
      if (typeof transform.args.index != 'undefined') {
        afterIndex = transform.args.index - 1;      
      } else {
        afterIndex = this.getIterables(transform.iterableOpts).length - 1;
      }
      var myIterables = this.getIterables(transform.iterableOpts);
      var self = this;
      myIterables[afterIndex].clone().then(
        function(clone) {
          // This will force realization of inline specs.
          clone.parseInlineRelationSpecsRecursive().then(
            function() {
              clone.realizeInlineRelationSpecsRecursive();
              self.tree.forrest.realizeRelations(clone, undefined);
              var filterFn = clone.makeIterableLineageFilter(self, afterIndex+1);  
              clone.pruneRelations(undefined, undefined, filterFn);
              clone._processIncoming(undefined, undefined, clone).then(
                function() {
                  if (transform.fromRemote) {
                    clone.setValue(transform.value);
                  }
                  self.insertChild(clone, afterIndex, false);
                  if (announce) {
                    if (transform.fromRemote) {
                      var t = transform.relayFor(self);
                      t.value = clone;
                      t.fromRemote = false;
                      self.announceTransform(t, true);
                    } else {
                      transform.value = clone;
                      self.announceTransform(transform);
                    }
                  }      
                },
                function(reason) {
                  Util.Log.Error(reason);
                }
              ).done();
            }
          )
        },
        function(reason) {
          Util.Log.Error(reason);
        }
      ).done();
    } else if (transform.operation == 'node-removed') {
      var myIterables = this.getIterables(transform.iterableOpts);
      var iterable = myIterables[transform.args.index];
      this.removeChild(iterable, false);      
      transform.value = iterable;
      if (announce) {
        this.announceTransform(transform);
      }
    }
  },

  announceTransform: function(transform, disableRemote) {
    console.log('announcing transform in state', transform.state, disableRemote, this, transform);
    this.trigger('transform', transform);
    if (this.commitsTransformsToRemote === true) {
      if (!(disableRemote === true)) {
        transform.changeState('pending');
        this.announceTransformToRemote(transform);          
      }
    }
    // We do this to trigger any initial behavior.
    this.transformStateChanged(transform);
  },

  announceTransformToRemote: function(transform) {
    // TODO: Override by subclass.
  },

  transformStateChanged: function(transform) {
    if (this._subclass_transformStateChanged) {
      this._subclass_transformStateChanged(transform);
    }
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
