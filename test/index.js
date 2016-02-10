import {default as Allocator, verifyHeader} from "../src";
import randomNumbers from "./random.json";

const benchmark = createBenchmark();

ensureDeterministicRandom();


describe('Allocator', function () {

  describe('constructor()', function () {
    describe('Buffer', function () {
      let instance;

      it('should create a new instance', function () {
        instance = new Allocator(new Buffer(1024).fill(123));
      });

      it('should prepare the header', function () {
        verifyHeader(instance.int32Array).should.equal(true);
      });

      it('should create a new instance from an existing buffer', function () {
        const dupe = new Allocator(instance.buffer);
        verifyHeader(dupe.int32Array).should.equal(true);
      });
    });

    describe('ArrayBuffer', function () {
      let instance;

      it('should create a new instance', function () {
        instance = new Allocator(new ArrayBuffer(1024));
      });

      it('should prepare the header', function () {
        verifyHeader(instance.int32Array).should.equal(true);
      });

    });

    describe('Bad Constructor', function () {
      it('should not accept undefined', function () {
        (() => new Allocator()).should.throw(TypeError);
      });

      it('should not accept an array', function () {
        (() => new Allocator([1,2,3])).should.throw(TypeError);
      });

      });

    describe('ArrayBuffer offset', function () {
      it('should create a new instance with a byte offset', function () {
        const instance = new Allocator(new ArrayBuffer(1024), 4);
      });

      it('should create a new instance with byte offsets and lengths', function () {
        const instance = new Allocator(new ArrayBuffer(4096), 4, 1024);
      });
    });

  });

  describe('Out of memory', function () {
    let instance;
    it('should create a new instance', function () {
      instance = new Allocator(new Buffer(1024).fill(123));
    });
    it('should allocate some space', function () {
      const address = instance.alloc(512);
      address.should.be.above(0);
    });
    it('should exhaust the space in the instance', function () {
      const address = instance.alloc(512);
      address.should.equal(0);
    });
  });

  describe('workflow', function () {
    let instance = new Allocator(new Buffer(4096).fill(127));

    it('should allocate some bytes', function () {
      const address1 = instance.alloc(64);
      const address2 = instance.alloc(64);
      const address3 = instance.alloc(64);

      instance.alloc(128);
      instance.free(address1);
      instance.free(address3);
    });


    it('should allocate some bytes, free some of them, allocates some more', function () {
      const addresses = Array.from({length: 10}, (_, index) => instance.alloc(index % 2 ? 64 : 128));
      const freed = addresses.filter((_, index) => index % 3 === 1).map(address => instance.free(address));

      const addresses2 = Array.from({length: 10}, (_, index) => instance.alloc(index % 2 ? 64 : 128));
      addresses2.forEach(address => instance.free(address));

    });
  });

  describe('bad alloc(), sizeOf() and free()', function () {
    let instance = new Allocator(new Buffer(4096).fill(127));
    it('should fail to allocate less than the minimum freeable size', function () {
      (() => instance.alloc(8)).should.throw(RangeError);
    });

    it('should fail to allocate more than the capacity', function () {
      (() => instance.alloc(4096 * 2)).should.throw(RangeError);
    });

    it('should fail to allocate an unaligned size', function () {
      (() => instance.alloc(33)).should.throw(RangeError);
    });

    it('should fail to allocate a non integral number of bytes', function () {
      (() => instance.alloc(40.33)).should.throw(Error);
    });

    it('should not free an invalid address', function () {
      (() => instance.free(-1)).should.throw(RangeError);
    });

    it('should not free an address within the header', function () {
      (() => instance.free(16)).should.throw(RangeError);
    });

    it('should not free an address with an invalid alignment', function () {
      (() => instance.free(777)).should.throw(RangeError);
    });

    it('should not free an address larger than the array', function () {
      (() => instance.free(4096 * 2)).should.throw(RangeError);
    });

    it('should not free an unallocated address', function () {
      (() => instance.free(1024)).should.throw(Error);
    });

    it('should not check the size of an address within the header', function () {
      (() => instance.sizeOf(20)).should.throw(Error);
    });

    it('should not check the size of a negative address', function () {
      (() => instance.sizeOf(20)).should.throw(Error);
    });

    it('should not check the size of a too-large address', function () {
      (() => instance.sizeOf(Math.pow(2,32))).should.throw(Error);
    });

    it('should not check the size of an invalid address', function () {
      (() => instance.sizeOf(777)).should.throw(Error);
    });
  });

  describe('Alloc() exhaustively', function () {
    let instance = new Allocator(new Buffer(4096).fill(127));
    const addresses = [];
    it('should repeatedly allocate 16 byte chunks until it exhausts the available space', function () {
      let prev = 0;
      let next = 0;
      let counter = 0;
      while ((next = instance.alloc(16)) !== 0) {
        prev = next;
        addresses.push(next);
        counter++;
      }
      counter.should.equal(159);
    });

    it('should check the size of all the addresses', function () {
      addresses.forEach(address => {
        instance.sizeOf(address).should.be.within(16, 32);
      });
    });

    it('should free all the available addresses in reverse order', function () {
      addresses.reverse().forEach(address => {
        instance.free(address).should.be.within(16, 32);
      });
    });
  });

  if (!process.env.MALLOC_FAST_TESTS) {
    // Warning: Increasing the number of mutations has an exponential effect on test time.
    mutate([
      128,
      64,
      96,
      256,
      128,
      72,
      256
    ]);
  }

  (process.env.NODE_ENV !== "production" ? describe.skip : describe)('Benchmarks', function () {
    let buffer = new Buffer(1024 * 1024 * 20);
    let instance;
    beforeEach(() => {
      buffer.fill(123);
      instance = new Allocator(buffer);
    });

    afterEach(() => {
      instance.buffer = null;
      instance = null;
    });

    after(() => {
      buffer = null;
      if (typeof gc === 'function') {
        gc();
      }
    });

    benchmark('allocate', 1000000, {
      alloc () {
        instance.alloc(20);
      }
    });

    benchmark('allocate and free', 1000000, {
      alloc () {
        instance.free(instance.alloc(128));
      }
    });
  });
});


function d (input) {
  console.log(JSON.stringify(input, null, 2));
}

function permutations (input: Array) {
  if (input.length == 0) {
    return [[]];
  }
  const result = [];
  for (let i = 0; i < input.length; i++) {
    const clone = input.slice();
    const start = clone.splice(i, 1);
    const tail = permutations(clone);
    for (let j = 0; j < tail.length; j++) {
      result.push(start.concat(tail[j]));
    }
  }

  return result;
}

function debugOnce (input) {
  return [input];
}

function mutate (input: number[]) {
  //debugOnce([ 64, 72, 128, 96, 256, 128, 256]).forEach(sizes => {

  permutations(input).forEach(sizes => {
    describe(`Sizes: ${sizes.join(', ')}`, function () {

      describe('Sequential', function () {
        let instance;
        before(() => {
          instance = new Allocator(new Buffer(16000).fill(123));
        });
        after(() => {
          instance.buffer = null;
          instance = null;
        });

        let addresses;
        it('should allocate', function () {
          addresses = sizes.map(item => instance.alloc(item));
        });

        it('should inspect the results', function () {
          const {blocks} = instance.inspect();
          sizes.forEach((size, index) => {
            blocks[index].type.should.equal('used')
            blocks[index].offset.should.equal(addresses[index]);
            blocks[index].size.should.equal(size);
          });
        });

        it('should free blocks in order', function () {
          addresses.forEach(address => instance.free(address));
        });

        it('should inspect the freed blocks', function () {
          const {blocks} = instance.inspect();
          blocks.length.should.equal(1);
          blocks[0].type.should.equal('free');
        });
      });

      describe('Alloc & Free', function () {
        let instance;
        before(() => {
          instance = new Allocator(new Buffer(16000).fill(123));
        });
        after(() => {
          instance.buffer = null;
          instance = null;
        });

        let addresses;
        it('should allocate', function () {
          addresses = sizes.map(address => instance.alloc(address));
        });
        it('should free & alloc again', function () {
          addresses = addresses.map((address, index) => {
            const size = sizes[(index + 1) % sizes.length];
            instance.free(address);
            return instance.alloc(size);
          });
        });

        it('should inspect the blocks', function () {
          const {blocks} = instance.inspect();
        });

        it('should free the blocks', function () {
          addresses.forEach(address => instance.free(address));
        });

        it('should inspect the freed blocks', function () {
          const {blocks} = instance.inspect();
          blocks.length.should.equal(1);
          blocks[0].type.should.equal('free');
        });
      });

      describe('Alloc, Alloc, Free, Reverse, Alloc', function () {
        let instance;
        before(() => {
          instance = new Allocator(new Buffer(16000).fill(123));
        });
        after(() => {
          instance.buffer = null;
          instance = null;
        });

        let addresses, extra;
        it('should allocate', function () {
          addresses = sizes.reduce((addresses, size) => {
            return addresses.concat(instance.alloc(size), instance.alloc(size));
          }, []);
          addresses.every(value => value.should.be.above(0));
        });

        it('should free half of the allocated addresses', function () {
          addresses = addresses.map((address, index) => {
            if (index % 2 === 0) {
              return address;
            }
            else {
              instance.free(address);
            }
          }).filter(id => id);
        });

        it('should inspect the blocks', function () {
          const {blocks} = instance.inspect();
          blocks.forEach((block, index) => {
            if (index % 2 === 0) {
              block.type.should.equal('used');
            }
            else {
              block.type.should.equal('free');
            }
          });
        });

        it('should allocate', function () {
          extra = sizes.reduce((addresses, size) => {
            return addresses.concat(instance.alloc(size));
          }, []);
        });

        it('should free the blocks', function () {
          addresses.forEach(address => instance.free(address));
          extra.forEach(address => {
            instance.free(address);
          });
        });

        it('should inspect the freed blocks', function () {
          const {blocks} = instance.inspect();
          blocks.length.should.equal(1);
          blocks[0].type.should.equal('free');
        });
      });
    });
  });
}

function createBenchmark () {

  function benchmark (name, limit, ...fns) {
    let factor = 1;
    if (typeof limit === 'function') {
      fns.unshift(limit);
      limit = 1000;
    }
    if (typeof fns[0] === 'number') {
      factor = fns.shift();
    }
    it(`benchmark: ${name}`, benchmarkRunner(name, limit, factor, flattenBenchmarkFunctions(fns)));
  };

  benchmark.skip = function skipBenchmark (name) {
    it.skip(`benchmark: ${name}`);
  }

  benchmark.only = function benchmark (name, limit, ...fns) {
    let factor = 1;
    if (typeof limit !== 'number') {
      fns.unshift(limit);
      limit = 1000;
    }
    if (typeof fns[0] === 'number') {
      factor = fns.shift();
    }
    it.only(`benchmark: ${name}`, benchmarkRunner(name, limit, factor, flattenBenchmarkFunctions(fns)));
  };


  function benchmarkRunner (name, limit, factor, fns) {
    return async function () {
      this.timeout(10000);
      console.log(`\tStarting benchmark: ${name}\n`);
      let fastest = {
        name: null,
        score: null
      };
      let slowest = {
        name: null,
        score: null
      };
      fns.forEach(([name,fn]) => {
        const start = process.hrtime();
        for (let j = 0; j < limit; j++) {
          fn(j, limit);
        }
        let [seconds, ns] = process.hrtime(start);
        seconds += ns / 1000000000;
        const perSecond = Math.round(limit / seconds) * factor;
        if (fastest.score === null || fastest.score < perSecond) {
          fastest.name = name;
          fastest.score = perSecond;
        }
        if (slowest.score === null || slowest.score > perSecond) {
          slowest.name = name;
          slowest.score = perSecond;
        }
        console.log(`\t${name} benchmark done in ${seconds.toFixed(4)} seconds, ${perSecond} operations per second.`);
      });
      if (fns.length > 1) {
        const diff = (fastest.score - slowest.score) / slowest.score * 100;
        console.log(`\n\t${fastest.name} was ${diff.toFixed(2)}% faster than ${slowest.name}`);
      }
    };
  }

  function flattenBenchmarkFunctions (fns: Array<Object|Function>): Array {
    return fns.reduce((flat, item, index) => {
      if (typeof item === "object") {
        flat.push(...Object.keys(item).map(name => [name, item[name]]));
      }
      else {
        flat.push([item.name || "fn" + index, item]);
      }
      return flat;
    }, []);
  }

  return benchmark;
}

function ensureDeterministicRandom () {
  let index = 21;
  Math.random = function () {
    return randomNumbers[index++ % randomNumbers.length];
  };
}
