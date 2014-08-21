exports.Forrest          = require('./forrest.js');
exports.ForrestSpec      = require('./specs/forrest-spec.js');

exports.Node             = require('./node.js');

exports.Selection        = require('./selection.js');
exports.SelectionSpec    = require('./specs/selection-spec.js');

exports.Tree             = require('./tree.js');
exports.TreeSpec         = require('./specs/tree-spec.js');

exports.DependenceySpec  = require('./specs/dependency-spec.js');

exports.Relation         = require('./relation.js');
exports.RelationSpec     = require('./relation-spec.js');

exports.Relation = {
  Is:  require('./relations/is.js'),
  Are: require('./relations/are.js'),
  Graft: require('./relations/graft.js'),
  IfExist: require('./relations/ifexist.js'),
  IfNexist: require('./relations/ifnexist.js')
};