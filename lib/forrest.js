// Forrest
// ==========================================================================
// A Forrest contains:
//  * Named trees
//  * Relations between those trees
// ==========================================================================

var Parser = require('cts/parser');
var Util = require('cts/util');
var Selection = require('./selection');

var NonexistentNode = require('./nonexistent-node');
var Relation = require('./relation');

var defaultOptions = {
  listenForNodeInsertionOnBody: true
};

// Constructor
// -----------
var Forrest = function(opts, factory) {
  var self = this;
  this.forrestSpecs = [];
  this.factory = factory;

  this.treeSpecs = {};
  this.trees = {};

  this.relationSpecs = [];
  this.relations= [];

  this.insertionListeners = {};

  this.depsLoaded = {};
  this._waitingForLoadingDeps = [];

  this.opts = Util.Helper.buildOptions(defaultOptions, opts);

  this.defaultTreeReady = Util.Promise.defer();

  if (opts && (typeof opts.engine != 'undefined')) {
    this.engine = opts.engine;
    // Default tree was realized.
    // Add callback for DOM change events.
    this.engine.status.booted.then(function() {
      if (self.opts.listenForNodeInsertionOnBody) {
        self.listenForNodeInsertionsOnTree('body', true);
      }
    }).done();
  }

  this.initialize();
};


// Instance Methods
// ----------------
Util._.extend(Forrest.prototype, Util.Events, {

  /*
   * Initialization Bits
   *
   * -------------------------------------------------------- */

  initialize: function() {
  },

  initializeAsync: function() {
    return this.addAndRealizeDefaultTrees();
  },

  addAndRealizeDefaultTrees: function() {
    var deferred = Util.Promise.defer();
    var self = this;
    var pageBody = null;
    if (typeof this.opts.defaultTree != 'undefined') {
      var pageBody = new Parser.TreeSpec('html', {name: 'body', url: this.opts.defaultTree});
    } else {
      var pageBody = new Parser.TreeSpec('html', {name: 'body'});
    }
    this.addTreeSpec(pageBody);
    this.realizeTree(pageBody).then(
     function(tree) {
       self.defaultTreeReady.resolve();
       if (self.engine) {
         self.engine.status.defaultTreeReady.resolve();
       }
       deferred.resolve(self);
     },
     function(reason) {
       deferred.reject(reason);
     }
    ).done();
    return deferred.promise;
  },

  afterDepsLoaded: function(cb) {
    if (this.areAllDependenciesLoaded()) {
      cb();
    } else {
      this._waitingForLoadingDeps.push(cb);
    }
  },

  removeRelationSpec: function(spec) {
    this.relationSpecs = Util._.filter(this.relationSpecs,
      function(r) { return r != spec; });
  },

  reloadTreeSpec: function(name, render) {
    var deferred = Util.Promise.defer();
    var self = this;
    var spec = this.treeSpecs[name]

    // Unload listeners
    var listenValue = this.listenForNodeInsertionsOnTree(name);
    this.listenForNodeInsertionsOnTree(name, false);

    this.trees[name].root.unrealize();
    delete this.trees[name];

    this.realizeTree(spec).then(
     function(tree) {
      // Realize relations again
      Util.Log.Info("Re-Realized tree", name);
      for (var i = 0; i < self.relationSpecs.length; i++) {
        var spec = self.relationSpecs[i];
        if ((spec.selectionSpec1.treeName == name) ||
            (spec.selectionSpec2.treeName == name)) {
          self.realizeRelation(spec);
        }
      }

      if (render) {
        self.trees[name].root._processIncoming();
        // Resume listening maybe
        self.listenForNodeInsertionsOnTree(name, listenValue);
        deferred.resolve();
      } else {
        // Resume listening maybe
        self.listenForNodeInsertionsOnTree(name, listenValue);
        deferred.resolve();        
      }
     },
     function(reason) {
       Util.Log.Error(reason);
       deferred.reject(reason);
     }
    ).done();
    return deferred.promise;
  },

  stopListening: function() {
    Util.Log.Info("Stop Listening");
    for (var treeName in this.insertionListeners) {
      this.listenForNodeInsertionsOnTree(treeName, false);
    }
  },

  startListening: function() {
    Util.Log.Info("Start Listening");
    this.listenForNodeInsertionsOnTree('body', true);
  },

  // Removes all dependency specs from the root tree
  removeDependencies: function() {
    for (var j = 0; j < this.forrestSpecs.length; j++) {
      for (var i = 0; i < this.forrestSpecs[j].dependencySpecs.length; i++) {
        var ds = this.forrestSpecs[j].dependencySpecs[i];
        ds.unload();
      }
    }
  },

  areAllDependenciesLoaded: function() {
    var allLoaded = true;
    for (var url in this.depsLoaded) {
      if (! this.depsLoaded[url]) {
        allLoaded = false
      }
    }
    return allLoaded;
  },

  dependencyLoading: function(dep) {
    console.log("Dependency will load", dep.url);
    this.depsLoaded[dep.url] = false;        
  },

  dependencyLoaded: function(dep) {
    // See if all deps loaded
    console.log("Dependency Loaded", dep.url);
    var self = this;
    self.depsLoaded[dep.url] = true;
    if (self.areAllDependenciesLoaded()) {
      // Run the waiting functions and clear
      var c = self._waitingForLoadingDeps;
      self._waitingForLoadingDeps = [];
      for (var i = 0; i < c.length; i++) {
        c[i]();
      }
    }
  },

  /*
   * Adding Specs
   *
   * A forrest is built by adding SPECS (from the language/ package) to it
   * rather than actual objects. These specs are lazily instantiated into
   * model objects as they are needed.  Thus, the addTree method takes a
   * TreeSpec, rather than a Tree, and so on.
   *
   * -------------------------------------------------------- */
  addSpec: function(forrestSpec) {
    var self = this;
    if (typeof this.forrestSpecs == 'undefined') {
      Util.Log.Error("forrest spec undef");
    }
    this.forrestSpecs.push(forrestSpec);

    var initial = Util.Promise.defer();
    var last = initial.promise;

    var i, j;
    // Load all the dependency specs
    if (typeof forrestSpec.dependencySpecs != 'undefined') {
      for (dep in forrestSpec.dependencySpecs) {
        forrestSpec.dependencySpecs[dep].load();
      }
    }

    // Load all the relation specs
    if (typeof forrestSpec.relationSpecs != 'undefined') {
      for (j = 0; j < forrestSpec.relationSpecs.length; j++) {
        self.addRelationSpec(forrestSpec.relationSpecs[j]);
      }
    }

    // Load AND REALIZE all the tree specs
    if (typeof forrestSpec.treeSpecs != 'undefined') {
      var promises = Util._.map(forrestSpec.treeSpecs, function(treeSpec) {
        self.addTreeSpec(treeSpec);
        return self.realizeTree(treeSpec);
      });
      Util.Promise.all(promises).then(function() {
        initial.resolve();
      });
// Why were we doing this?
//      for (i = 0; i < forrestSpec.treeSpecs.length; i++) {
//        (function(treeSpec) {
//          var treeSpec = forrestSpec.treeSpecs[i];
//          self.addTreeSpec(treeSpec);
//          var next = Q.defer();
//          last.then(
//            function() {
//              self.realizeTree(treeSpec).then(
//                function() {
//                  next.resolve();
//                },
//                function(reason) {
//                  next.reject(reason);
//                }
//              );
//            },
//            function(reason) {
//              next.reject(reason);
//            }
//          );
//          last = next.promise;
//        })(forrestSpec.treeSpecs[i])
//      }
    }

    //initial.resolve();
    return last;
  },

  addSpecs: function(specs) {
    var self = this;
    var promises = Util._.map(specs, function(spec) {
      return self.addSpec(spec);
    });
    return Util.Promise.all(promises);
  },

  parseAndAddSpec: function(rawData, kind, fromUrl) {
    var deferred = Util.Promise.defer();
    var self = this;
    Parser.parseForrestSpec(rawData, kind, fromUrl).then(
      function(specs) {
        console.log(specs);
        if (fromUrl != 'undefined') {
          Util._.each(specs, function(spec) {
            for (i = 0; i < spec.dependencySpecs.length; i++) {
              spec.dependencySpecs[i].loadedFrom = fromUrl;
            }
            for (i = 0; i < spec.treeSpecs.length; i++) {
              spec.treeSpecs[i].loadedFrom = fromUrl;
            }
          });
        }
        self.addSpecs(specs).then(
          function() {
            deferred.resolve(specs);
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

  /*
   * Params:
   *   links -- The output of CTS.Util.getTresheetLinks
   *
   * Returns:
   *   promises
   */
  parseAndAddSpecsFromLinks: function(links) {
    var self = this;
    var promises = Util._.map(links, function(block) {
      var deferred = Util.Promise.defer();
      if (block.type == 'link') {
        Util.Net.fetchString(block).then(
          function(content) {
            var url = block.url;
            self.parseAndAddSpec(content, block.format, url).then(
              function() {
                deferred.resolve();
             },
             function(reason) {
               Util.Log.Error("Could not parse and add spec", content, block);
               deferred.resolve();
             }
           ).done();
         },
         function(reason) {
           Util.Log.Error("Could not fetch CTS link:", block);
           deferred.resolve();
         });
      } else if (block.type == 'block') {
        var url = window.location;
        self.parseAndAddSpec(block.content, block.format, url).then(
          function() {
            deferred.resolve();
          },
          function(reason) {
            Util.Log.Error("Could not parse and add spec", content, block);
            deferred.resolve();
          }
        ).done();
      } else {
        Util.Log.Error("Could not load CTS: did not understand block type", block.block, block);
        deferred.resolve();
      }
      return deferred.promise;
    });
    return promises;
  },

  find: function(selectorString) {
    var spec = Parser.parseSelectorString(selectorString);
    if (typeof this.trees[spec.treeName] != 'undefined') {
      return new Selection(this.trees[spec.treeName].find(spec));
    } else {
      Util.Log.Warn("No tree named: " + spec.treeName);
      return new Selection([]);
    }
  },

  addTreeSpec: function(treeSpec) {
    this.treeSpecs[treeSpec.name] = treeSpec;
  },

  addRelationSpec: function(relationSpec) {
    if (typeof this.relationSpecs == 'undefined') {
      Util.Log.Error("rel spc undef");
    }
    this.relationSpecs.push(relationSpec);
  },

  addRelationSpecs: function(someRelationSpecs) {
    for (var i = 0; i < someRelationSpecs.length; i++) {
      // Faster than .push()
       if (typeof this.relationSpecs == 'undefined') {
         Util.Log.Error("relation undefined");
       }

      this.relationSpecs.push(someRelationSpecs[i]);
    }
  },

  applyTransform: function(transform, announce) {
    try {
      if (transform.treeName in this.trees) {
        this.trees[transform.treeName].applyTransform(transform, announce);
      }
    } catch(e) {
      console.log(e);
    }
  },

  realizeTrees: function() {
    var promises = [];
    Util._.each(this.treeSpecs, function(treeSpec, name, list) {
      if (! Util._.has(this.trees, name)) {
        Util.Log.Info("Promising to realize tree", treeSpec);
        promises.push(this.realizeTree(treeSpec));
      }
    }, this);
    return Util.Promise.all(promises);
  },

  realizeDependencies: function() {
    Util._.each(this.forrestSpecs, function(fs) {
      Util._.each(fs.dependencySpecs, function(ds) {
        if (!(ds.loaded === true)) {
          ds.load();
        }
      });
    });

    // A no-op, just to fit in with boot and later potential deps.
    return Util.Promise.resolve();
  },

  realizeTree: function(treeSpec) {
    var deferred = Util.Promise.defer();
    var self = this;
    if ((treeSpec.url !== null) && (typeof treeSpec.url == "string") && (treeSpec.url.indexOf("alias(") == 0) && (treeSpec.url[treeSpec.url.length - 1] == ")")) {
      var alias = treeSpec.url.substring(6, treeSpec.url.length - 1);
      if (typeof self.trees[alias] != 'undefined') {
        self.trees[treeSpec.name] = self.trees[alias];
        if (treeSpec.receiveEvents) {
          // XXX: Potential bug here, depending on intent. The aliased tree is
          // the same tree! That means we might intend one to receive and the
          // other not to, but in reality they'll both be in lockstep.
          self.trees[treeSpec.name].toggleReceiveRelationEvents(true);
        }
        deferred.resolve(self.trees[alias]);
      } else {
        deferred.reject("Trying to alias undefined tree");
      }
    } else if (typeof treeSpec.url == "string") {
      treeSpec.url = Util.Net.fixRelativeUrl(treeSpec.url, treeSpec.loadedFrom);
      self.factory.Tree(treeSpec, this).then(
        function(tree) {
          self.trees[treeSpec.name] = tree;
          // tree.registerInlineRelationSpecs();
          deferred.resolve(tree);
          self.trigger('realized-tree', {name: treeSpec.name, kind: tree.kind, tree: tree});
        },
        function(reason) {
          deferred.reject(reason);
        }
      ).done();
    } else {
      // it's a jquery node
      self.factory.Tree(treeSpec, this).then(
        function(tree) {
          self.trees[treeSpec.name] = tree;
          // tree.registerInlineRelationSpecs();
          deferred.resolve(tree);
          self.trigger('realized-tree', {name: treeSpec.name, kind: tree.kind, tree: tree});
        },
        function(reason) {
          deferred.reject(reason);
        }
      ).done();
    }
    return deferred;
  },

  realizeRelations: function(subtree, filterFn) {
    for (var i = 0; i < this.relationSpecs.length; i++) {
      this.realizeRelation(this.relationSpecs[i], subtree, filterFn);
    }
  },

  remapTreeName: function(treeName) {
    var lastGSheet = null;
    var lastOther = null;
    for (var label in this.treeSpecs) {
      if (label == treeName) {
        return treeName;
      }
      if (label != 'body') {
        var spec = this.treeSpecs[label];
        if (spec && spec.kind && (spec.kind == 'gsheet')) {
          lastGSheet = label;
        } else {
          lastOther = label;
        }        
      }
    }
    if (lastGSheet != null) {
      return lastGSheet;
    }

    if (lastOther != null) {
      return lastOther;
    }

    return treeName;
  },

  /* The JSON should be of the form:
   * 1. [
   * 2.   ["TreeName", "SelectorName", {"selector1-prop":"selector1-val"}]
   * 3.   ["Relation",  {"prop":"selector1-val"}]
   * 4.   ["TreeName", "SelectorName", {"selector2-prop":"selector1-val"}]
   * 5. ]
   *
   * The outer array (lines 1 and 5) are optional if you only have a single rule.
   *
   */
  realizeRelation: function(spec, subtree, filterFn) {
    if (typeof subtree == 'undefined') {
      subtree = false;
    }
    var s1 = spec.selectionSpec1;
    var s2 = spec.selectionSpec2;

    if (typeof s1 == 'undefined') {
      Util.Log.Error("S1 is undefined", spec);
      return;
    }
    if (typeof s2 == 'undefined') {
      Util.Log.Error("S2 is undefined", spec);
      return;
    }


    // Note: at this point we assume that all trees are loaded.
    if (! this.containsTree(s1.treeName)) {
      s1.treeName = this.remapTreeName(s1.treeName);
      if (! this.containsTree(s1.treeName)) {
        Util.Log.Error("Can not realize RelationSpec becasue one or more trees are not available", s1.treeName);
        return;
      }
    }
    if (! this.containsTree(s2.treeName)) {
      s2.treeName = this.remapTreeName(s2.treeName);
      if (! this.containsTree(s2.treeName)) {
        Util.Log.Error("Can not realize RelationSpec becasue one or more trees are not available", s2.treeName);
        return;
      }
    }

    if (typeof filterFn == 'undefined') {
      filterFn = false;
    }

    // Here we're guaranteed that the trees are available.

    // Now we find all the nodes that this spec matches on each side and
    // take the cross product of all combinations.

    var tree1 = this.trees[s1.treeName];
    var tree2 = this.trees[s2.treeName];

    if (subtree && (subtree.tree != tree1) && (subtree.tree != tree2)) {
      // not relevant to us.
      return;
    }

    var nodes1 = tree1.find(s1);
    var nodes2 = tree2.find(s2);

    if (nodes1.length == 0) {
      nodes1 = [NonexistentNode];
      //Util.Log.Info("empty selection -> NonExistantNode!", s1);
    }
    if (nodes2.length == 0) {
      nodes2 = [NonexistentNode];
      //Util.Log.Info("empty selection -> NonExistantNode!", s2);
    }

    for (var i = 0; i < nodes1.length; i++) {
      for (var j = 0; j < nodes2.length; j++) {
        // Realize a relation between i and j. Creating the relation adds
        // a pointer back to the nodes.
        if ((!subtree) ||
            ((nodes1[i].isDescendantOf(subtree) || nodes1[i] == subtree)) ||
            ((nodes2[j].isDescendantOf(subtree) || nodes2[j] == subtree))) {
          var node1 = nodes1[i];
          var node2 = nodes2[j];

          if ((!filterFn) || (filterFn({node1: node1, node2: node2}))) {
            if (filterFn) {
              if (! window.passed) {
                window.passed = [];
              }
              window.passed.push([node1, node2, node1.relations.length, node2.relations.length]);
            }
            var relation = this.factory.Relation(node1, node2, spec);
            // This is necessary but I can't remember why. But it's necessary here.
            node1.realizedInlineRelationSpecs = true;
            node2.realizedInlineRelationSpecs = true;
            // Add the relation to the forrest
            if (typeof this.relations == 'undefined') {
             Util.Log.Error("relations undefined");
            }
            this.relations.push(relation);
          }
        }
      }
    }
  },

  /*
   * Fetching Objects
   *
   * -------------------------------------------------------- */

  containsTree: function(alias) {
    return Util._.has(this.trees, alias);
  },

  getTree: function(alias) {
    return this.trees[alias];
  },

  getPrimaryTree: function() {
    return this.trees.body;
  },

  /*
   * Event Handlers
   *
   * -------------------------------------------------------- */

  listenForNodeInsertionsOnTree: function(treeName, new_val) {
    // CURRENT STATUS
    var tree = this.trees[treeName];
    var listening = (treeName in this.insertionListeners);
    var self = this;

    // ERROR
    if (typeof tree == 'undefined'){
      Util.Log.Error("listenForNodeInsertion (" + new_val + "):" +
          "Tree " + treeName + " not present.");
      return false;
    }

    // GET
    if (typeof new_val == 'undefined') {
      return listening;
    }

    // SET
    if (new_val == true) {
      tree.root.toggleThrowDataEvents(true);
      tree.on('ValueChanged', this._onTreeValueChanged, this);
      return true;
    } else if (new_val == false) {
      tree.root.toggleThrowDataEvents(false);
      tree.off('ValueChanged', this._onTreeValueChanged, this);
      delete this.insertionListeners[treeName];
    }
  },

  _onTreeValueChanged: function(evt) {
    Util.Log.Info("Forrest caught tree value change");
    var node = evt.sourceNode;
    var tree = evt.sourceTree;

    if (node._subclass_shouldRunCtsOnInsertion()) {
      var links = node._subclass_getTreesheetLinks();
      var promises = self.parseAndAddSpecsFromLinks(ctsLinks);
      Util.Promise.all(promises).then(
        function() {
          // Creae the CTS tree for this region.
          Util.Log.Info("Running onChildInserted", prnt);

          var node = prnt._onChildInserted($node);
        }, function(errors) {
          Util.Log.Error("Couldn't add CTS blocks from inserted dom node", errors);
        }
      ).done();
    }

    // If the tree is the main tree, we might run some CTS.

    // If the tree is the main tree, we want to possibly run any CTS
    var self = this;
    if (typeof evt.ctsHandled == 'undefined') {
      var node = tree.getCtsNode(evt.node);
      if (node == null) {
        if (! evt.node.hasClass("cts-ignore")) {
          Util.Log.Info("Insertion", evt.node);
          // Get the parent
          var $prnt = evt.node.parent();
          var prnt = tree.getCtsNode($prnt);
          if (prnt == null) {
            // Util.Log.Error("Node inserted into yet unmapped region of tree", prnt);
          } else {
            // First see if any CTS blocks live in this region
            var ctsLinks = Util.Helper.getTreesheetLinks(evt.node);
            var promises = self.parseAndAddSpecsFromLinks(ctsLinks);
            Util.Promise.all(promises).then(
              function() {
                // Create the CTS tree for this region.
                Util.Log.Info("Running onChildInserted", prnt);
                var node = prnt._onChildInserted(evt.node);
              }, function(errors) {
                Util.Log.Error("Couldn't add CTS blocks from inserted dom node", errors);
              }
            ).done();
          }
        }
      }
      evt.ctsHandled = true;
    }
  }
});

module.exports = Forrest;
