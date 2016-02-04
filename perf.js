"use strict";
var Allocator = require("./lib").default;

function go () {
  var instance = new Allocator(new Buffer(20 * 1024 * 1024));
  const addresses = [];
  for (var i = 0; i < 10000; i++) {
    addresses.push(instance.alloc(512));
    if (i > 6 && i % 3 === 0) {
      instance.free(addresses[i - 3]);
      addresses[i - 3] = 0;
    }
  }

  for (var i = 0; i < addresses.length; i++) {
    if (addresses[i] !== 0) {
      instance.free(addresses[i]);
    }
  }

  console.log(instance.inspect());
}

go();