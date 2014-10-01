var Node = require('./node');
var Util = require('cts/util');

var AbstractNode = function(value) {
  this.initializeNodeBase();
  this.value = value || null;
  this.kind = 'abstract';
};

Util._.extend(AbstractNode.prototype, Util.Events, Node.Base, {
   _subclass_beginClone: function() {
     var d = Util.Promise.defer();
     var n = new AbstractNode();
     n.setValue(this.getValue());
     var kidPromises = CTS._.map(this.children, function(kid) {
       return kid.clone();
     });
     Util.Promise.all(kidPromises).then(
       function(kids) {
         for (var i = 0; i < kids.length; i++) {
           kids[i].parentNode = n;
           n.insertChild(kids[i]);
         }
         deferred.resolve(n);
       },
       function(reason) {
         d.reject(reason);
       }
     )
     return d.promise;
   },

   getValue: function() {
     return "";
   }
});

module.exports = AbstractNode;


