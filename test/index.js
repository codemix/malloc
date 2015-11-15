import {default as Allocator, verifyHeader} from "../src";

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


describe('Allocator', function () {

  describe('constructor()', function () {
    let instance;
    it('should create a new instance', function () {
      instance = new Allocator(new Buffer(1024));
    });

    it('should prepare the header', function () {
      verifyHeader(instance.int32Array).should.equal(true);
    });
  });

  mutate([
    128,
    64,
    96,
    256,
    128,
    72,
    256,
    512
  ]);

  describe('Benchmarks', function () {
    let instance;
    beforeEach(() => {
      instance = new Allocator(new Buffer(1024 * 1024 * 10));
    });

    benchmark('allocate', 100000, {
      alloc () {
        instance.free(instance.alloc(128));
      }
    });
  });
});


function d (input) {
  console.log(JSON.stringify(input, null, 2));
}

function mutate (input: number[]) {
  const total = input.reduce((a, b) => a + b);
  input.forEach((start, index) => {
    const sizes = [start].concat(input.map(item => item).filter((_, i) => i !== index));
    describe(`Sizes: ${sizes.join(', ')}`, function () {
      describe('Sequential', function () {
        const instance = new Allocator(new Buffer(4096));
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
        const instance = new Allocator(new Buffer(4096));
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
        const instance = new Allocator(new Buffer(4096 * 2));
        let addresses;
        it('should allocate', function () {
          addresses = sizes.reduce((addresses, size) => {
            return addresses.concat(instance.alloc(size), instance.alloc(size));
          }, []);
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

        it('should free the blocks', function () {
          addresses.forEach(address => instance.free(address));
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