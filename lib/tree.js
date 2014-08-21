
var Tree = {
  Base: {
    render: function(opts) {
      this.root.render(opts);
    },

    nodesForSelectionSpec: function(spec) {
      if (spec.inline) {
        return [spec.inlineObject];
      } else {
        var results = this.root.find(spec.selectorString);
        return results;
      }
    },

    toggleReceiveRelationEvents: function(toggle) {
      this.root.toggleReceiveRelationEvents(toggle, true);
    }
  }
};

module.exports = Tree;