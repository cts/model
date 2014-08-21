var Node = require('./node');
var Util = require('cts/util');

var AbstractNode = function() {
  this.initializeNodeBase();
  this.value = null;
};

Util.Fn.extend(AbstractNode.prototype, Util.Events, Node.Base, {
   _subclass_beginClone: function() {
     var d = CTS.Promise.defer();
     var n = new CTS.Adapters.Abstract.AbstractNode();
     n.setValue(this.getValue());
     var kidPromises = CTS.Fn.map(this.children, function(kid) {
       return kid.clone();
     });
     CTS.Promise.all(kidPromises).then(
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


