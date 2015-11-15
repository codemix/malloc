import {Allocator} from "../src";

describe('Allocator', function () {
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