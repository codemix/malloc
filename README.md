# malloc

A skip-list based memory allocator built on top of typed arrays (and node buffers).

## What?

It lets you allocate a large, contiguous slab of memory up front and then `alloc()` and `free()` within that buffer.
It is mostly useful in conjunction with things like [mmap.js](https://github.com/indutny/mmap.js).

It's developed using [design by contract](https://github.com/codemix/babel-plugin-contracts), so you might find the library's own code style a bit unusual, but it doesn't affect usage.

## Installation

Install via [npm](https://npmjs.org/package/malloc).

## Usage

```js
import Allocator from "malloc";

const heap = new Buffer(1024 * 1024);
const allocator = new Allocator(heap); // heap could also be an ArrayBuffer
console.log(allocator.inspect());

const input = "Hello World";
const offset = allocator.alloc(Buffer.byteLength(input));
heap.write(input, offset);

console.log(allocator.inspect());

console.log(allocator.sizeOf(offset));

console.log('freed', allocator.free(offset), 'bytes');
```


## License

Published by [codemix](http://codemix.com/) under a permissive MIT License, see [LICENSE.md](./LICENSE.md).
