const POINTER_SIZE_IN_BYTES = 4;

const HEADER_SIZE_IN_QUADS = 5;
const HEADER_OFFSET_IN_QUADS = 1;

const PREV_OFFSET_IN_QUADS = 0;
const NEXT_OFFSET_IN_QUADS = 1;

const POINTER_SIZE_IN_QUADS = 1;
const POINTER_OVERHEAD_IN_QUADS = 2;

const MIN_FREEABLE_SIZE_IN_QUADS = 5;
const FIRST_BLOCK_OFFSET_IN_QUADS = HEADER_OFFSET_IN_QUADS + HEADER_SIZE_IN_QUADS + POINTER_OVERHEAD_IN_QUADS;

type ListNode = {
  size: int32;
  prev: int32;
  next: int32;
};


export default class Allocator {
  constructor (buffer: Buffer|ArrayBuffer, byteOffset: int32 = 0) {
    if (buffer instanceof Buffer) {
      this.buffer = buffer.buffer;
      this.byteOffset = buffer.byteOffset;
      this.length = buffer.length;
    }
    else {
      this.buffer = buffer;
      this.byteOffset = byteOffset;
      this.length = buffer.length - byteOffset;
    }
    this.int32Array = prepare(new Int32Array(this.buffer, this.byteOffset, bytesToQuads(this.length)));
  }


  /**
   * Allocate a given number of bytes and return the offset.
   * If allocation fails, returns 0.
   */
  alloc (numberOfBytes: int32): int32 {
    pre: {
      numberOfBytes >= POINTER_SIZE_IN_BYTES;
      numberOfBytes < this.length;
      numberOfBytes / POINTER_SIZE_IN_BYTES === Math.floor(numberOfBytes / POINTER_SIZE_IN_BYTES), "Allocation size must be a multiple of the pointer size.";
    }
    post: {
      it === 0 || it >= quadsToBytes(FIRST_BLOCK_OFFSET_IN_QUADS);
    }

    trace: `Allocating ${numberOfBytes} bytes.`;

    const minimumSize: int32 = bytesToQuads(numberOfBytes);
    const int32Array: Int32Array = this.int32Array;
    const block: int32 = findFreeBlock(int32Array, minimumSize);
    if (block <= HEADER_OFFSET_IN_QUADS) {
      return 0;
    }
    const blockSize: int32 = readSize(int32Array, block);

    assert: {
      blockSize >= POINTER_SIZE_IN_QUADS;
      blockSize < this.length;
    }

    if (blockSize - minimumSize >= MIN_FREEABLE_SIZE_IN_QUADS) {
      split(int32Array, block, minimumSize, blockSize);
    }
    else {
      remove(int32Array, block, blockSize);
    }
    return quadsToBytes(block);
  }

  /**
   * Free a number of bytes from the given address.
   */
  free (address: int32): int32 {
    pre: {
      address / POINTER_SIZE_IN_BYTES === Math.floor(address / POINTER_SIZE_IN_BYTES), "Block address must be a multiple of the pointer size.";
      address >= quadsToBytes(FIRST_BLOCK_OFFSET_IN_QUADS);
    }
    post: {
      it >= 0;
      it < quadsToBytes(int32Array.length);
    }


    const int32Array: Int32Array = this.int32Array;
    const block = bytesToQuads(address);

    trace: `Freeing ${readSize(int32Array, block)} bytes from block ${address}.`;

    if (block < FIRST_BLOCK_OFFSET_IN_QUADS) {
      return 0;
    }
    const preceding: int32 = getFreeBlockBefore(int32Array, block);
    const trailing: int32 = getFreeBlockAfter(int32Array, block);
    if (preceding !== 0) {
      if (trailing !== 0) {
        return quadsToBytes(insertMiddle(int32Array, preceding, block, trailing));
      }
      else {
        return quadsToBytes(insertAfter(int32Array, preceding, block));
      }
    }
    else if (trailing !== 0) {
      return quadsToBytes(insertBefore(int32Array, trailing, block));
    }
    else {
      return quadsToBytes(insert(int32Array, block, readSize(int32Array, block)));
    }
  }

  /**
   * Inspect the instance.
   */
  inspect () {
    const int32Array: Int32Array = this.int32Array;
    const blocks: {type: string; size: int32; node?: ListNode}[] = [];
    const header: ListNode = readListNode(int32Array, HEADER_OFFSET_IN_QUADS);
    let block: int32 = FIRST_BLOCK_OFFSET_IN_QUADS;
    while (block < int32Array.length - POINTER_SIZE_IN_QUADS) {
      const size: int32 = readSize(int32Array, block);
      if (size < POINTER_OVERHEAD_IN_QUADS || size >= this.length) {
        throw new Error(`Got invalid sized chunk at ${quadsToBytes(block)} (${quadsToBytes(size)})`);
      }
      if (isFree(int32Array, block)) {
        blocks.push({
          type: 'free',
          offset: quadsToBytes(block),
          size: quadsToBytes(size),
          node: readListNode(int32Array, block)
        });
      }
      else {
        blocks.push({
          type: 'used',
          offset: quadsToBytes(block),
          size: quadsToBytes(size)
        });
      }
      block += size + POINTER_OVERHEAD_IN_QUADS;
    }
    return {header, blocks};
  }
}

/**
 * Prepare the given int32Array and ensure it contains a valid header.
 */
export function prepare (int32Array: Int32Array): Int32Array {
  if (!verifyHeader(int32Array)) {
    writeInitialHeader(int32Array);
  }
  return int32Array;
}

/**
 * Verify that the int32Array contains a valid header.
 */
export function verifyHeader (int32Array: Int32Array): boolean {
  return int32Array[HEADER_OFFSET_IN_QUADS - 1] === HEADER_SIZE_IN_QUADS
      && int32Array[HEADER_OFFSET_IN_QUADS + HEADER_SIZE_IN_QUADS] === HEADER_SIZE_IN_QUADS;
}

/**
 * Write the initial header for an empty int32Array.
 */
function writeInitialHeader (int32Array: Int32Array) {
  trace: `Writing initial header.`;
  const header = HEADER_OFFSET_IN_QUADS;
  const headerSize = HEADER_SIZE_IN_QUADS;
  const block = FIRST_BLOCK_OFFSET_IN_QUADS;
  const blockSize = int32Array.length - (header + headerSize + POINTER_OVERHEAD_IN_QUADS + POINTER_SIZE_IN_QUADS);

  writeSize(int32Array, headerSize, header);
  int32Array[header + PREV_OFFSET_IN_QUADS] = block;
  int32Array[header + NEXT_OFFSET_IN_QUADS] = block;

  writeSize(int32Array, blockSize, block);
  int32Array[block + PREV_OFFSET_IN_QUADS] = header;
  int32Array[block + NEXT_OFFSET_IN_QUADS] = header;
}

/**
 * Convert quads to bytes.
 */
function quadsToBytes (num: int32): int32 {
  return num * POINTER_SIZE_IN_BYTES;
}

/**
 * Convert bytes to quads.
 */
function bytesToQuads (num: int32): int32 {
  return Math.ceil(num / POINTER_SIZE_IN_BYTES);
}

/**
 * Read the tree pointers for a given block.
 */
function readListNode (int32Array: Int32Array, block: int32): ListNode {
  pre: {
    block + MIN_FREEABLE_SIZE_IN_QUADS < int32Array.length;
  }

  return {
    size: quadsToBytes(int32Array[block - 1]),
    prev: quadsToBytes(int32Array[block + PREV_OFFSET_IN_QUADS]),
    next: quadsToBytes(int32Array[block + NEXT_OFFSET_IN_QUADS])
  };
}


/**
 * Read the size of the block at the given address.
 */
function readSize (int32Array: Int32Array, block: int32): int32 {
  pre: {
    block >= 1;
    block < int32Array.length;
  }
  post: {
    it > 0;
    it <= int32Array.length;
    int32Array[block - 1] === int32Array[block + Math.abs(int32Array[block - 1])];
  }
  const size: int32 = int32Array[block - 1];
  return (size ^ (size >> 31)) - (size >> 31);
}

/**
 * Write the size of the block at the given address.
 */
function writeSize (int32Array: Int32Array, size: int32, block: int32): void {
  pre: {
    block >= 1;
    size !== 0;
    if (size > 0) {
      size < int32Array.length;
    }
    else {
      -size < int32Array.length;
    }
  }
  post: {
    int32Array[block - 1] === size;
    int32Array[block + Math.abs(size)] === size;
  }
  int32Array[block - 1] = size;
  int32Array[block + ((size ^ (size >> 31)) - (size >> 31))] = size;
}

/**
 * Find a node in the tree with at least the given size (in quads).
 */
function findCandidateWithSize (int32Array: Int32Array, minimumSize: int32): int32 {
  pre: {
    minimumSize >= MIN_FREEABLE_SIZE_IN_QUADS, "Cannot handle blocks smaller than the minimum freeable size.";
    minimumSize < int32Array.length, "Cannot handle blocks larger than the capacity of the backing array.";
  }
  post: {
    it >= HEADER_OFFSET_IN_QUADS, "Address must be either the header, or a child of it.";
    it < int32Array.length, "Address cannot exceed the size of the backing array.";
    if (it !== HEADER_OFFSET_IN_QUADS) {
      readSize(int32Array, it) >= minimumSize, "If we got a non-header candidate, it must be at least the size we requested.";
    }
  }

  trace: `Finding a candidate of at least ${quadsToBytes(minimumSize)} bytes.`;

  let next: int32 = int32Array[HEADER_OFFSET_IN_QUADS + NEXT_OFFSET_IN_QUADS];
  let block: int32 = next;
  let size: int32 = int32Array[next - 1];

  while (next !== HEADER_OFFSET_IN_QUADS && minimumSize > size) {
    next = int32Array[next + NEXT_OFFSET_IN_QUADS];
    size = int32Array[next - 1];
    block = next;
  }

  trace: `Got candidate block ${quadsToBytes(block)} of ${quadsToBytes(size)} bytes.`;

  return block;
}

/**
 * Find a free block with at least the given size and return its offset in quads.
 */
function findFreeBlock (int32Array: Int32Array, minimumSize: int32): int32 {
  pre: {
    minimumSize >= MIN_FREEABLE_SIZE_IN_QUADS;
    minimumSize < int32Array.length;
  }
  post: {
    it >= 0;
    it < int32Array.length;
    if (it !== 0) {
      readSize(int32Array, it) >= minimumSize;
    }
  }

  trace: `Finding a free block of at least ${quadsToBytes(minimumSize)} bytes.`;

  const block: int32 = findCandidateWithSize(int32Array, minimumSize);
  if (block === HEADER_OFFSET_IN_QUADS) {
    trace: `Could not find a block large enough.`;
    return 0;
  }
  else {
    trace: `Got block: ${quadsToBytes(block)}.`
    return block;
  }
}


/**
 * Split the given block after a certain number of bytes and add the second half to the freelist.
 */
function split (int32Array: Int32Array, block: int32, firstSize: int32, blockSize: int32): void {
  pre: {
    block < int32Array.length;
    firstSize >= MIN_FREEABLE_SIZE_IN_QUADS;
    block + firstSize <= int32Array.length;
    blockSize > firstSize;
    block + blockSize <= int32Array.length;
  }

  const second: int32 = (block + firstSize + POINTER_OVERHEAD_IN_QUADS);
  const secondSize: int32 = (blockSize - (second - block));

  assert: {
    firstSize + secondSize + POINTER_OVERHEAD_IN_QUADS === blockSize;
  }

  trace: `Splitting block ${quadsToBytes(block)} of ${quadsToBytes(blockSize)} bytes into ${quadsToBytes(firstSize)} bytes and ${quadsToBytes(secondSize)} bytes.`;

  remove(int32Array, block, blockSize);
  writeSize(int32Array, -firstSize, block);

  assert: {
    !isFree(int32Array, block);
  }

  writeSize(int32Array, -secondSize, second);
  insert(int32Array, second, secondSize);
}

/**
 * Remove the given block from the freelist and mark it as allocated.
 */
function remove (int32Array: Int32Array, block: int32, blockSize: int32): void {
  pre: {
    block !== HEADER_OFFSET_IN_QUADS, "Cannot remove the header block.";
    block < int32Array.length, "Block must be within bounds.";
    blockSize >= MIN_FREEABLE_SIZE_IN_QUADS, "Block size must be at least the minimum freeable size.";
    block + blockSize <= int32Array.length, "Block cannot exceed the length of the backing array.";
  }
  post: {
    int32Array[block - 1] === -blockSize, "Block is marked as allocated.";
    int32Array[block + blockSize] === -blockSize, "Block is marked as allocated.";
  }

  trace: `Removing block ${quadsToBytes(block)} of ${quadsToBytes(blockSize)} bytes.`;

  const prev: int32 = int32Array[block + PREV_OFFSET_IN_QUADS];
  let next: int32 = int32Array[block + NEXT_OFFSET_IN_QUADS];
  if (next === prev) {
    next = HEADER_OFFSET_IN_QUADS;
  }
  int32Array[prev + NEXT_OFFSET_IN_QUADS] = next;
  int32Array[next + PREV_OFFSET_IN_QUADS] = prev;

  // invert the size sign to signify an allocated block
  writeSize(int32Array, -blockSize, block);
}



/**
 * Determine whether the block at the given address is free or not.
 */
function isFree (int32Array: Int32Array, block: int32): boolean {
  pre: {
    block < int32Array.length;
  }

  if (block < HEADER_SIZE_IN_QUADS) {
    return false;
  }
  const size: int32 = int32Array[block - POINTER_SIZE_IN_QUADS];

  assert: {
    size !== 0;
    if (size > 0) {
      size >= MIN_FREEABLE_SIZE_IN_QUADS;
      size < int32Array.length;
      int32Array[block + size] === size;
    }
    else {
      -size >= MIN_FREEABLE_SIZE_IN_QUADS;
      -size < int32Array.length;
      int32Array[block + -size] === size;
    }
  }

  if (size < 0) {
    return false;
  }
  else {
    return true;
  }
}


/**
 * Get the address of the block before the given one and return the address *if it is free*,
 * otherwise 0.
 */
function getFreeBlockBefore (int32Array: Int32Array, block: int32): int32 {
  pre: {
    block < int32Array.length;
  }
  post: {
    it >= 0;
    it < block;
  }

  if (block <= FIRST_BLOCK_OFFSET_IN_QUADS) {
    return 0;
  }
  const beforeSize: int32 = int32Array[block - POINTER_OVERHEAD_IN_QUADS];

  assert: {
    beforeSize < int32Array.length;
  }

  if (beforeSize < POINTER_OVERHEAD_IN_QUADS) {
    return 0;
  }
  return block - (POINTER_OVERHEAD_IN_QUADS + beforeSize);
}

/**
 * Get the address of the block after the given one and return its address *if it is free*,
 * otherwise 0.
 */
function getFreeBlockAfter (int32Array: Int32Array, block: int32): int32 {
  pre: {
    block < int32Array.length;
  }
  post: {
    if (it !== 0) {
      it > block;
      it < int32Array.length - MIN_FREEABLE_SIZE_IN_QUADS;
    }
  }

  const blockSize: int32 = readSize(int32Array, block);
  const next: int32 = (block + blockSize + POINTER_OVERHEAD_IN_QUADS);
  const nextSize: int32 = int32Array[next - POINTER_SIZE_IN_QUADS];

  assert: {
    if (nextSize > 0) {
      nextSize >= MIN_FREEABLE_SIZE_IN_QUADS;
      next + nextSize <= int32Array.length;
    }
  }

  if (nextSize < POINTER_OVERHEAD_IN_QUADS) {
    return 0;
  }
  return next;
}


/**
 * Insert the given block into the freelist and return the number of bytes that were freed.
 */
function insert (int32Array: Int32Array, block: int32, blockSize: int32): int32 {
  pre: {
    block < int32Array.length;
    blockSize >= MIN_FREEABLE_SIZE_IN_QUADS;
    block + blockSize <= int32Array.length;
    !isFree(int32Array, block);
  }

  trace: `Inserting block ${quadsToBytes(block)} of ${quadsToBytes(blockSize)} bytes.`;

  let prev: int32 = HEADER_OFFSET_IN_QUADS;
  let next: int32 = int32Array[HEADER_OFFSET_IN_QUADS + NEXT_OFFSET_IN_QUADS];

  while (next !== HEADER_OFFSET_IN_QUADS && blockSize > int32Array[next - 1]) {
    prev = next;
    next = int32Array[next + NEXT_OFFSET_IN_QUADS];
    trace: `Checking next block: ${quadsToBytes(next)}`;
  }


  int32Array[prev + NEXT_OFFSET_IN_QUADS] = block;
  int32Array[next + PREV_OFFSET_IN_QUADS] = block;

  int32Array[block + PREV_OFFSET_IN_QUADS] = prev;
  int32Array[block + NEXT_OFFSET_IN_QUADS] = next;
  writeSize(int32Array, blockSize, block);
  return blockSize;
}

/**
 * Insert the given block into the freelist before the given free block,
 * joining them together, returning the number of bytes which were freed.
 */
function insertBefore (int32Array: Int32Array, trailing: int32, block: int32): int32 {
  pre: {
    block > 0;
    trailing > block;
    trailing < int32Array.length;
  }
  post: {
    it > 0;
    it < int32Array.length;
  }

  const blockSize: int32 = readSize(int32Array, block);
  const trailingSize: int32 = readSize(int32Array, trailing);
  remove(int32Array, trailing, trailingSize);
  const size: int32 = (blockSize + trailingSize + POINTER_OVERHEAD_IN_QUADS);
  int32Array[block - POINTER_SIZE_IN_QUADS] = -size;
  int32Array[trailing + trailingSize] = -size;
  insert(int32Array, block, size);
  return blockSize;
}

/**
 * Insert the given block into the freelist in between the given free blocks,
 * joining them together, returning the number of bytes which were freed.
 */
function insertMiddle (int32Array: Int32Array, preceding: int32, block: int32, trailing: int32): int32 {
  const blockSize: int32 = readSize(int32Array, block);
  const precedingSize: int32 = (block - preceding) - POINTER_OVERHEAD_IN_QUADS;
  const trailingSize: int32 = readSize(int32Array, trailing);
  const size: int32 = ((trailing - preceding) + trailingSize);
  remove(int32Array, preceding, precedingSize);
  remove(int32Array, trailing, trailingSize);
  int32Array[preceding - POINTER_SIZE_IN_QUADS] = -size;
  int32Array[trailing + trailingSize] = -size;
  insert(int32Array, preceding, size);
  return blockSize;
}

/**
 * Insert the given block into the freelist after the given free block,
 * joining them together, returning the number of bytes which were freed.
 */
function insertAfter (int32Array: Int32Array, preceding: int32, block: int32): int32 {
  const precedingSize: int32 = (block - preceding) - POINTER_OVERHEAD_IN_QUADS;
  remove(int32Array, preceding, precedingSize);
  const blockSize: int32 = readSize(int32Array, block);
  const size: int32 = ((block - preceding) + blockSize);
  int32Array[preceding - POINTER_SIZE_IN_QUADS] = -size;
  int32Array[block + blockSize] = -size;
  insert(int32Array, preceding, size);
  return blockSize;
}
