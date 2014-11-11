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

    applyTransform: function(transform) {
      console.log("Tree asked to apply transform", transform);
      var nodes = this.find(transform.nodeIdentifier);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].applyTransform(transform);
      }
    },

    announceTransformToRemote: function(transform) {
      var promise = Util.Promise.defer();

      if (!! this.spec.mock) {
        promise.resolve();
        return promise;
      }

      var name = this.spec.name;
      var authenticate = false;
      var path = 'tree/' + name + '/transform';
      var opts = {
        dataType: 'json',
        type: 'POST',
        data: {
          transform: transform.toJson()
        }
      };

      var jqXhr = CTS.engine.server.request(path, opts, (! authenticate));
      jqXhr.done(function(data) {
        if (! data.success) {
          Util.Log.Error("Could not transform tree", data);          
          transform.changeState('failed');
          promise.reject(data.message);
        } else {
          transform.changeState('success');
          promise.resolve(data);
        }
      });
      jqXhr.fail(function(jqXhr, textStatus, errorThrown) {
        Util.Log.Error("Could not load remote tree from server.", textStatus, errorThrown);
        promise.reject("Could not load remote tree from server. Error message: " + textStatus);
      });
      return promise;
    },

    toggleReceiveRelationEvents: function(toggle) {
      this.root.toggleReceiveRelationEvents(toggle, true);
    }

  }
};

module.exports = Tree;