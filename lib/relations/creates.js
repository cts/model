/*
 * CREATES
 * =======
 *
 * Creates triggers creation into a list.
 */

var Util = require('cts/util');
var RelationBase = require('../relation');
var Transform = require("../transform");

var Creates = function(node1, node2, spec) {
  this.initializeBase(Creates, 'creates', node1, node2, spec);
};

Util._.extend(Creates.prototype, RelationBase.Base, {
  execute: function(toward) {
    if (this.forGraftOnly()) {
      return;
    }

    var opp = this.opposite(toward);

    // A node that participates as a graft soure
    // Should have all its relations removed, as only clones of it will
    // ever actually do anything.
    // opp.pruneRelations(null, null);

    var towardOpts = this.optsFor(toward);
    var fromOpts   = this.optsFor(opp);
    var res;

    var invoker = toward;
    var invokerOpts = towardOpts;
    var template = opp;
    var templateOpts = fromOpts;

    var d = Util.Promise.defer();
    var self = this;

    opp.addGrafter(toward);

    // Now we need to mark all the relations as for a graft so that we don't
    // accidentally execute them during a render.
    // We also need to mark the nodes in case *other* relations
    // bind in after we're done here. E.g., if this template is at the
    // top of the document and others bind in from below.
    for (var i = 0; i < invoker.children.length; i++) {
      var child = invoker.children[i];
      this.markNodeRelationsAsForGraft(child, true, true);
      child.forGraftOnly(true, true);
    }

    invoker.value.on('submit', function(e) {
      // Throw a transform.
      e.preventDefault();
      e.stopPropagation();
      self._runCreation(invoker, invokerOpts, template, templateOpts).then(
        function(newElem) {
          invoker.value.find('input[type="email"], input[type="text"], textarea').val('');

          // Maybe there is a callback on the options for the receiver.
          if (invokerOpts && invokerOpts.after) {
            invoker.tree.forrest.afterDepsLoaded(function() {
              if (window && (typeof window[invokerOpts.after] == 'function')) {
                window[invokerOpts.after](invoker, template, self);
              } else {
                console.log("Creates could not invoke callback.");
              }                
            })
          }
        },
        function(err) {
          if (invokerOpts && invokerOpts.fail) {
            invoker.tree.forrest.afterDepsLoaded(function() {
              if (window && (typeof window[invokerOpts.fail] == 'function')) {
                window[invokerOpts.fail](invoker, template, self);
              } else {
                console.log("Creates could not invoke error callback.");
              }                
            })
          }

        }


      ).done();
    });

    d.resolve();
    return d.promise;
  },

  _runCreation: function(newItemContainer, newItemOpts, intoList, intoListOpts) {
    // Step 1: Assume iterable on FROM side.
    var self = this;
    var deferred = Util.Promise.defer();

    // 2. Mark all ARE-related relations as for graft.
    var areRelatedNodes = Util._.filter(intoList.relations, function(relation) {
      return (relation.name == 'are');
    }).map(function(r) { return r.opposite(intoList)});

    var filterFn = function(clone) {
      return function(relation) {
        var otherNode = relation.node1.isDescendantOf(clone) ? relation.node2 : relation.node1;
        var isAreRelated = Util._.reduce(
          Util._.map(areRelatedNodes, function(node) { return otherNode.isDescendantOf(node)} ),
          function(memo, result) { return result || memo },
          false
        );
        return (! isAreRelated);
      };
    };

    var beforePersistence = function(clone) {

    };

    // Step 1: Clone an iterable from the GRAFT-related container.
                     // list      cloneSource           dest(last) event  beforePFn  cloneRelns
    var iterables = intoList.getIterables(this.optsFor(intoList));

    // var nextTimeFn = function() {
    //   return intoList.cloneIterable(iterables.length - 1, undefined, false, beforePersistence, true, undefined, self.optsFor(intoList)); 
    // };
    // var firstTimeFn = function() {
    //   return intoList.cloneIterable(iterables.length - 1, undefined, false, beforePersistence, true, undefined, self.optsFor(intoList)); 
    // };
    // var cloneFn = (iterables.length > 0) ? nextTimeFn : firstTimeFn;
    // var promise = cloneFn();

    var promise = intoList.cloneIterable(iterables.length - 1, undefined, false, undefined, true, undefined, self.optsFor(intoList));

    promise.then(
      function(clone) {
        if (!clone) {
          debugger;
          return deferred.reject("Clone null.");
        }

        // Step 3: Filter relations
        
        var otherFilterFn = clone.makeIterableLineageFilter(intoList, iterables.length);

        clone.pruneRelations(undefined, undefined, otherFilterFn);

        var filterFnInst = filterFn(clone);
        filterFnInst.deletionPolicy = 'mark';
        filterFnInst.passPolicy = 'mark';
        clone.pruneRelations(undefined, undefined, filterFnInst);

        var graftsToMe = Util._.filter(intoList.getRelations(), function(r) {
          return ((r.name == 'creates') && (r.node1 != newItemContainer) && (r.node2 != newItemContainer))
        });
        var graftFilterFn = function(r) {
          // FALSE if a node is inside a subtree which grafts to me.
          for (var i = 0; i < graftsToMe.length; i++) {
            var relation = graftsToMe[i];
            var otherParent = (relation.node1 == newItemContainer) ? relation.node2 : relation.node1;
            if (r.node1.isDescendantOf(otherParent) || r.node2.isDescendantOf(otherParent)) {
              return false;
            }
          }
          return true;
        };

        clone.pruneRelations(undefined, undefined, graftFilterFn);

        // clone.pruneRelations(clone.parentNode, clone);
        // Step 4: Process Incoming Relations
        clone._processIncoming(undefined, {disableRemote: true, directional: false}, clone).then(
          function() {
            // Step 5: Reverse Filter
            var oppFilterFn = function(relation) {
              return (!filterFnInst(relation));
            };
            oppFilterFn.deletionPolicy = 'mark';
            clone.pruneRelations(undefined, undefined, oppFilterFn);
            self.markNodeRelationsAsForGraft(newItemContainer, true, true);

            var t = new Transform({
              operation: 'node-inserted',
              treeName: intoList.tree.spec.name,
              treeUrl: intoList.tree.spec.url,
              node: intoList,
              value: clone,          
              args: {
                index: iterables.length
              }
            });
            intoList.announceTransform(t);

            deferred.resolve(clone);
          },
          function(err) {
            deferred.reject(err);
          }
        ).done();

        var fn = function(r) {
          return false;
        };
        fn.deletionPolicy = 'mark';
        for (var i = 0; i < newItemContainer.children.length; i++) {
          var child = newItemContainer.children[i];
          child.pruneRelations(undefined, undefined, fn);
        }

        // Step 6: Call childInserted on the receiving container
        // intoList.trigger("ChildInserted", {
        //   eventName: "ChildInserted",
        //   ctsNode: clone,
        //   sourceNode: intoList,
        //   sourceTree: intoList.tree,
        //   afterIndex: iterables.length - 1
        // });
        // intoList.insertChild(clone, iterables.length - 1, true, true);
      },
      function(err) {
        console.log(err);
        deferred.reject(err);
      }
    ).done();

    return deferred.promise;
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new Creates(n1, n2, this.spec);
  },

  eventInterestFor: function(n) {
    return ['transform'];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.operation) {
      if (evt.operation == 'node-inserted') {    
        this.relayTransform(evt, thrownFrom, thrownTo);
      }
    } 
  },   

  markNodeRelationsAsForGraft: function(node, val, recurse, insideOtherSubtree) {
    var rs = node.getRelations();
    if (typeof insideOtherSubtree == 'undefined') {
      insideOtherSubtree = false;
    }
    for (var i = 0; i < rs.length; i++) {
      if (insideOtherSubtree) {
        if ((rs[i].node1 == node) && (rs[i].node2.isDescendantOf(insideOtherSubtree))) {
          rs[i].forGraftOnly(val);          
        } else if ((rs[i].node2 == node) && (rs[i].node1.isDescendantOf(insideOtherSubtree))) {
          rs[i].forGraftOnly(val);
        }
      } else {
        rs[i].forGraftOnly(val);
      }
    }
    if (recurse) {
      for (var i = 0; i < node.children.length; i++) {
        this.markNodeRelationsAsForGraft(node.children[i], val, recurse, insideOtherSubtree);
      }
    }
  }

});

module.exports = Creates;
