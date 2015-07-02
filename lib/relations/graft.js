/*
 * GRAFT
 * =====
 *
 * Intended as a Mix-In to Relation.
 *
 * Graft does the following:
 *
 *  1. Copy the subtree of the FROM node.
 *  2. Run all (FROM -> TOWARD) rules in the direction TOWARD->FROM
 *  3. Replace TOWARD subtree with the result of 1 and 2.
 */

var Util = require('cts/util');
var RelationBase = require('../relation');

var Graft = function(node1, node2, spec) {
  this.initializeBase(Graft, 'graft', node1, node2, spec);
};

Util._.extend(Graft.prototype, RelationBase.Base, {
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
    var template = opp;
    opp.addGrafter(toward);

    var d = Util.Promise.defer();
    var self = this;

    var graftsToMe = Util._.filter(template.getRelations(), function(r) {
      return ((r.name == 'graft') && (r.node1 != invoker) && (r.node2 != invoker))
    });
    var filterFn = function(r) {
      // FALSE if a node is inside a subtree which grafts to me.
      for (var i = 0; i < graftsToMe.length; i++) {
        var relation = graftsToMe[i];
        var otherParent = (relation.node1 == template) ? relation.node2 : relation.node1;
        if (r.node1.isDescendantOf(otherParent) || r.node2.isDescendantOf(otherParent)) {
          return false;
        }
      }
      return true;
    };

    var clonedChildren = Util.Promise.all(
      Util._.map(template.getChildren(), function(node) {
        return node.clone(undefined, true, invoker, filterFn);
      })
    );

    clonedChildren.then(
      function(templateCopy) {
        // Now we have to insert them into the template node so that the forrest can pick 
        // the proper relations while cloning
        for (var i = 0; i < templateCopy.length; i++) {
          template.insertChild(templateCopy[i]);
        }

        // Now we run the graft.
        Util.Promise.all(
          Util._.map(templateCopy, function(templateNode) {
            return templateNode._processIncoming(undefined, {relationFilterFn: filterFn}, templateNode);
          })
        ).then(
          function() {
            Util._.each(templateCopy, function(node) {
              template.removeChild(node, false);
            });
            invoker.replaceChildrenWith(templateCopy);
            invoker.setProvenance(template.tree, template);

            // We'll throw the event on the forrest.
            invoker.tree.forrest.trigger('cts-received-graft', {
              target: invoker,
              source: template,
              relation: self
            });

            // Maybe there is a callback on the options for the receiver.
            if (towardOpts && towardOpts.after) {
              invoker.tree.forrest.afterDepsLoaded(function() {
                if (window && (typeof window[towardOpts.after] == 'function')) {
                  window[towardOpts.after](invoker, template, self);
                } else {
                  console.log("Graft could not invoke callback.");
                }                
              })
            }
            d.resolve();
          }
        ).done();
      },
      function(err) {
        d.reject(err);
      }
    ).done();
    return d.promise;
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new Graft(n1, n2, this.spec);
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

module.exports = Graft;
