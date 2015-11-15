"use strict";
var Allocator = require("./lib").default;

function go () {
  var instance = new Allocator(new Buffer(1024 * 1024));
  for (var i = 0; i < 10000; i++) {
    instance.free(instance.alloc(512));
  }
}

go();