const POINTER_SIZE_IN_BYTES = 4;

const HEADER_SIZE_IN_QUADS = 16;
const HEADER_OFFSET_IN_QUADS = 1;
const HEIGHT_OFFSET_IN_QUADS = 0;
const NEXT_OFFSET_IN_QUADS = 1;
const PREV_OFFSET_IN_QUADS = 2;
const POINTER_SIZE_IN_QUADS = 1;
const POINTER_OVERHEAD_IN_QUADS = 2;

const MIN_FREEABLE_SIZE_IN_QUADS = 6;
const FIRST_BLOCK_OFFSET_IN_QUADS = HEADER_OFFSET_IN_QUADS + HEADER_SIZE_IN_QUADS + POINTER_OVERHEAD_IN_QUADS;

const MAX_HEIGHT = 32;

export default class Allocator {
  constructor (buffer: Buffer|ArrayBuffer, byteOffset: number = 0) {
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
  alloc (numberOfBytes: number): number {
    const minimumSize: number = bytesToQuads(numberOfBytes|0);
    const int32Array: Int32Array = this.int32Array;
    const block: number = findFreeBlock(int32Array, minimumSize)|0;
    if (block <= HEADER_OFFSET_IN_QUADS) {
      return 0;
    }
    const blockSize: number = readSize(int32Array, block)|0;
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
  free (block: number): number {
    const int32Array: Int32Array = this.int32Array;
    block = bytesToQuads(block|0);
    if (block < FIRST_BLOCK_OFFSET_IN_QUADS) {
      return 0;
    }
    const preceding: number = getFreeBlockBefore(int32Array, block)|0;
    const trailing: number = getFreeBlockAfter(int32Array, block)|0;
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
      return quadsToBytes(insert(int32Array, block, readSize(int32Array, block)|0));
    }
  }

  inspect () {
    const int32Array: Int32Array = this.int32Array;
    const blocks: {type: string; size: number; pointers?: [number, number][]}[] = [];
    let pointer: number = FIRST_BLOCK_OFFSET_IN_QUADS;
    while (pointer < int32Array.length - POINTER_SIZE_IN_QUADS) {
      const size: number = readSize(int32Array, pointer);
      if (size < POINTER_OVERHEAD_IN_QUADS) {
        throw new Error(`Got invalid sized chunk at ${quadsToBytes(pointer)} (${quadsToBytes(size)})`);
      }
      if (isFree(int32Array, pointer)) {
        blocks.push({
          type: 'free',
          offset: quadsToBytes(pointer),
          size: quadsToBytes(size),
          pointers: [
            [quadsToBytes(readPrev(int32Array, pointer)), quadsToBytes(readNext(int32Array, pointer))]
          ]
        });
      }
      else {
        blocks.push({
          type: 'used',
          offset: quadsToBytes(pointer),
          size: quadsToBytes(size)
        });
      }
      pointer += size + POINTER_OVERHEAD_IN_QUADS;
    }
    return {blocks};
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
  return readSize(int32Array, HEADER_OFFSET_IN_QUADS) === HEADER_SIZE_IN_QUADS
      && int32Array[HEADER_OFFSET_IN_QUADS + HEADER_SIZE_IN_QUADS] === HEADER_SIZE_IN_QUADS;
}

/**
 * Write the initial header for an empty int32Array.
 */
function writeInitialHeader (int32Array: Int32Array) {
  const header = HEADER_OFFSET_IN_QUADS;
  const headerSize = HEADER_SIZE_IN_QUADS;
  const block = FIRST_BLOCK_OFFSET_IN_QUADS;
  const blockSize = int32Array.length - (header + headerSize + POINTER_OVERHEAD_IN_QUADS + POINTER_SIZE_IN_QUADS);

  writeSize(int32Array, headerSize, header);
  writeHeight(int32Array, 1, header);
  writeNext(int32Array, block, header);
  writePrev(int32Array, block, header);

  writeSize(int32Array, blockSize, block);
  writeHeight(int32Array, 1, block);
  writeNext(int32Array, header, block);
  writePrev(int32Array, header, block);
}

/**
 * Convert quads to bytes.
 */
function quadsToBytes (num: number): number {
  num = num|0;
  return num * POINTER_SIZE_IN_BYTES;
}

/**
 * Convert bytes to quads.
 */
function bytesToQuads (num: number): number {
  num = num|0;
  return Math.ceil(num / POINTER_SIZE_IN_BYTES);
}

/**
 * Read the height from the given block.
 */
function readHeight (int32Array: Int32Array, block: number): number {
  block = block|0;
  return int32Array[block + HEIGHT_OFFSET_IN_QUADS];
}

/**
 * Write the height to the given block.
 */
function writeHeight (int32Array: Int32Array, value: number, block: number) {
  block = block|0;
  value = value|0;
  int32Array[block + HEIGHT_OFFSET_IN_QUADS] = value;
}

/**
 * Read the next item from the given block.
 */
function readNext (int32Array: Int32Array, block: number): number {
  block = block|0;
  return int32Array[block + NEXT_OFFSET_IN_QUADS];
}

/**
 * Write the next item to the given block.
 */
function writeNext (int32Array: Int32Array, value: number, block: number) {
  block = block|0;
  value = value|0;
  int32Array[block + NEXT_OFFSET_IN_QUADS] = value;
}

/**
 * Read the previous item from the given block.
 */
function readPrev (int32Array: Int32Array, block: number): number {
  block = block|0;
  return int32Array[block + PREV_OFFSET_IN_QUADS];
}

/**
 * Write the previous item to the given block.
 */
function writePrev (int32Array: Int32Array, value: number, block: number) {
  block = block|0;
  value = value|0;
  int32Array[block + PREV_OFFSET_IN_QUADS] = value;
}

/**
 * Read the size of the block at the given address.
 */
function readSize (int32Array: Int32Array, block: number): number {
  block = block|0;
  const size: number = int32Array[block - 1];
  return (size ^ (size >> 31)) - (size >> 31);
}

/**
 * Write the size of the block at the given address.
 */
function writeSize (int32Array: Int32Array, size: number, block: number): void {
  block = block|0;
  size = size|0;
  int32Array[block - 1] = size;
  int32Array[block + ((size ^ (size >> 31)) - (size >> 31))] = size;
}


/**
 * Find a free block with at least the given size and return its address.
 */
function findFreeBlock (int32Array: Int32Array, minimumSize: number): number {
  minimumSize = minimumSize|0;
  let block: number = int32Array[HEADER_OFFSET_IN_QUADS + NEXT_OFFSET_IN_QUADS];
  while (block > HEADER_OFFSET_IN_QUADS) {
    const blockSize: number = readSize(int32Array, block);
    if (blockSize >= minimumSize) {
      return block;
    }
    block = readNext(int32Array, block);
  }
  return 0;
}


/**
 * Split the given block after a certain number of bytes and add the second half to the freelist.
 */
function split (int32Array: Int32Array, block: number, firstSize: number, blockSize: number): void {
  const next: number = readNext(int32Array, block);
  const prev: number = readPrev(int32Array, block);
  writeNext(int32Array, next, prev);
  writePrev(int32Array, prev, next);
  // mark the block as allocated
  writeSize(int32Array, -firstSize, block);

  const second: number = (block + firstSize + POINTER_OVERHEAD_IN_QUADS);
  const secondSize: number = (blockSize - (second - block));
  insert(int32Array, second, secondSize);
}

/**
 * Remove the given block from the freelist and mark it as allocated.
 */
function remove (int32Array: Int32Array, block: number, blockSize: number): void {
  block = block|0;
  blockSize = blockSize|0;
  const next: number = readNext(int32Array, block);
  const prev: number = readPrev(int32Array, block);
  writeNext(int32Array, next, prev);
  writePrev(int32Array, prev, next);
  // invert the size sign to signify an allocated block
  writeSize(int32Array, -blockSize, block);
}

/**
 * Determine whether the block at the given address is free or not.
 */
function isFree (int32Array: Int32Array, block: number): boolean {
  if (block < HEADER_SIZE_IN_QUADS) {
    return false;
  }
  const length: number = int32Array[block - POINTER_SIZE_IN_QUADS];
  if (length < 0) {
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
function getFreeBlockBefore (int32Array: Int32Array, block: number): number {
  if (block <= FIRST_BLOCK_OFFSET_IN_QUADS) {
    return 0;
  }
  const beforeSize: number = int32Array[block - POINTER_OVERHEAD_IN_QUADS];
  if (beforeSize < POINTER_OVERHEAD_IN_QUADS) {
    return 0;
  }
  return block - (POINTER_OVERHEAD_IN_QUADS + beforeSize);
}

/**
 * Get the address of the block after the given one and return its address *if it is free*,
 * otherwise 0.
 */
function getFreeBlockAfter (int32Array: Int32Array, block: number): number {
  const blockSize: number = readSize(int32Array, block);
  const next: number = (block + blockSize + POINTER_OVERHEAD_IN_QUADS);
  const nextSize: number = int32Array[next - POINTER_SIZE_IN_QUADS];
  if (nextSize < POINTER_OVERHEAD_IN_QUADS) {
    return 0;
  }
  return next;
}


/**
 * Insert the given block into the freelist and return the number of bytes that were freed.
 */
function insert (int32Array: Int32Array, block: number, blockSize: number): number {
  let next: number = int32Array[HEADER_OFFSET_IN_QUADS + NEXT_OFFSET_IN_QUADS];
  let prev: number = HEADER_OFFSET_IN_QUADS;
  while (next > HEADER_OFFSET_IN_QUADS) {
    const nextSize: number = readSize(int32Array, next);
    if (nextSize >= blockSize) {
      break;
    }
    prev = next;
    next = readNext(int32Array, next);
  }
  writeSize(int32Array, blockSize, block);
  const blockHeight = generateHeight(int32Array, blockSize);
  writeHeight(int32Array, blockHeight, block);
  for (let i = 0; i < blockHeight; i++) {
    int32Array[block + NEXT_OFFSET_IN_QUADS + (i * 2)] = next;
    int32Array[block + PREV_OFFSET_IN_QUADS + (i * 2)] = prev;

    /*int32Array[prev + NEXT_OFFSET_IN_QUADS + (i * 2)] = block;
    int32Array[next + PREV_OFFSET_IN_QUADS + (i * 2)] = block;*/
  }
  int32Array[prev + NEXT_OFFSET_IN_QUADS] = block;
  int32Array[next + PREV_OFFSET_IN_QUADS] = block;

  return blockSize;
}

/**
 * Insert the given block into the freelist before the given free block,
 * joining them together, returning the number of bytes which were freed.
 */
function insertBefore (int32Array: Int32Array, trailing: number, block: number): number {
  const blockSize: number = readSize(int32Array, block);
  const trailingSize: number = readSize(int32Array, trailing);
  remove(int32Array, trailing, trailingSize);
  const size: number = (blockSize + trailingSize + POINTER_OVERHEAD_IN_QUADS);
  int32Array[block - POINTER_SIZE_IN_QUADS] = size;
  int32Array[trailing + trailingSize] = size;
  insert(int32Array, block, size);
  return blockSize;
}

/**
 * Insert the given block into the freelist in between the given free blocks,
 * joining them together, returning the number of bytes which were freed.
 */
function insertMiddle (int32Array: Int32Array, preceding: number, block: number, trailing: number): number {
  const blockSize: number = readSize(int32Array, block);
  const precedingSize: number = (block - preceding) - POINTER_OVERHEAD_IN_QUADS;
  const trailingSize: number = readSize(int32Array, trailing);
  const size: number = ((trailing - preceding) + trailingSize);
  remove(int32Array, preceding, precedingSize);
  remove(int32Array, trailing, trailingSize);
  int32Array[preceding - POINTER_SIZE_IN_QUADS] = size;
  int32Array[trailing + trailingSize] = size;
  insert(int32Array, preceding, size);
  return blockSize;
}

/**
 * Insert the given block into the freelist after the given free block,
 * joining them together, returning the number of bytes which were freed.
 */
function insertAfter (int32Array: Int32Array, preceding: number, block: number): number {
  const precedingSize: number = (block - preceding) - POINTER_OVERHEAD_IN_QUADS;
  remove(int32Array, preceding, precedingSize);
  const blockSize: number = readSize(int32Array, block);
  const size: number = ((block - preceding) + blockSize);
  int32Array[preceding - POINTER_SIZE_IN_QUADS] = size;
  int32Array[block + blockSize] = size;
  insert(int32Array, preceding, size);
  return blockSize;
}

/**
 * Generate a random height for a block, growing the list height by 1 if required.
 */
function generateHeight (int32Array: Int32Array, blockSize: number): number {
  const listHeight = int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS];
  let height = randomHeight();
  if (blockSize < (height * 2) + 1) {
    height = (blockSize - 1) / 2;
  }
  if (height > listHeight) {
    return int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS] = listHeight + 1;
  }
  else {
    return height;
  }
}

/**
 * Generate a random height for a new block.
 */
function randomHeight (): number {
  let height: number = 1;
  for (let r: number =  Math.ceil(Math.random() * 2147483648); (r & 1) === 1 && height < MAX_HEIGHT; r >>= 1) {
    height++;
  }
  return height;
}
