var Util = require("cts/util");

var Tree = {
  Base: {
    render: function(opts) {
      this.root.render(opts);
    },

    find: function(spec) {
      if (spec.inline) {
        return [spec.inlineObject];
      } else {
        var results = this.root.find(spec.selectorString);
        return results;
      }
    },

    applyTransform: function(transform, announce) {
      var nodes = this.find(transform.nodeIdentifier);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].applyTransform(transform, announce);
      }
    },

    announceTransformToRemote: function(transform) {
      if (!! this.spec.mock) {
        var promise = Util.Promise.defer();
        promise.resolve();
        setTimeout(function() {
          transform.changeState('success')
        }, 100);
        return promise;
      }
      return this.forrest.engine.server.announceTransformToRemote(transform);
    },

    toggleReceiveRelationEvents: function(toggle) {
      this.root.toggleReceiveRelationEvents(toggle, true);
    },

    // _remote_enabled: true,
    loadRemote: function(spec) {
      if ((!! spec.mock) && (!! spec.mockData)) {
        var promise = Util.Promise.defer();
        promise.resolve(spec.mockData);
        return promise;
      }
      return this.forrest.engine.server.loadRemoteTree(spec);
    }

  }
};

module.exports = Tree;