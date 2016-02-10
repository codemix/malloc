/* @flow */

const POINTER_SIZE_IN_BYTES = 4;
const MAX_HEIGHT = 32;


const HEADER_SIZE_IN_QUADS = 1 + (MAX_HEIGHT * 2);
const HEADER_OFFSET_IN_QUADS = 1;

const HEIGHT_OFFSET_IN_QUADS = 0;
const PREV_OFFSET_IN_QUADS = 1;
const NEXT_OFFSET_IN_QUADS = 2;

const POINTER_SIZE_IN_QUADS = 1;
const POINTER_OVERHEAD_IN_QUADS = 2;

const MIN_FREEABLE_SIZE_IN_QUADS = 3;
const FIRST_BLOCK_OFFSET_IN_QUADS = HEADER_OFFSET_IN_QUADS + HEADER_SIZE_IN_QUADS + POINTER_OVERHEAD_IN_QUADS;

const MIN_FREEABLE_SIZE_IN_BYTES = MIN_FREEABLE_SIZE_IN_QUADS * POINTER_SIZE_IN_BYTES;
const FIRST_BLOCK_OFFSET_IN_BYTES = FIRST_BLOCK_OFFSET_IN_QUADS * POINTER_SIZE_IN_BYTES;
const OVERHEAD_IN_BYTES = (FIRST_BLOCK_OFFSET_IN_QUADS + 1) * POINTER_SIZE_IN_BYTES;

const UPDATES: Int32Array = (new Int32Array(MAX_HEIGHT)).fill(HEADER_OFFSET_IN_QUADS);

type ListNode = {
  type: string;
  offset: int32;
  size: int32;
  height: int32;
  pointers: int32[];
};

type InspectionResult = {
  header: ListNode;
  blocks: Array<{
    type: string;
    size: int32;
    node?: ListNode
  }>;
};

export default class Allocator {

  buffer: ArrayBuffer;
  byteOffset: uint32;
  length: uint32;
  int32Array: Int32Array;

  constructor (buffer: Buffer|ArrayBuffer, byteOffset: uint32 = 0, byteLength: uint32 = 0) {
    pre: {
      if (buffer instanceof Buffer) {
        byteLength <= buffer.length;
      }
      else if (buffer instanceof ArrayBuffer) {
        byteLength <= buffer.byteLength;
      }
    }
    if (buffer instanceof Buffer) {
      this.buffer = buffer.buffer;
      this.byteOffset = buffer.byteOffset + byteOffset;
      this.length = byteLength === 0 ? buffer.length : byteLength;
    }
    else if (buffer instanceof ArrayBuffer) {
      this.buffer = buffer;
      this.byteOffset = byteOffset;
      this.length = byteLength === 0 ? buffer.byteLength - byteOffset : byteLength;
    }
    else {
      throw new TypeError(`Expected buffer to be an instance of Buffer or ArrayBuffer`);
    }
    assert: this.length >= OVERHEAD_IN_BYTES;
    this.int32Array = prepare(new Int32Array(this.buffer, this.byteOffset, bytesToQuads(this.length)));
    checkListIntegrity(this.int32Array);
  }


  /**
   * Allocate a given number of bytes and return the offset.
   * If allocation fails, returns 0.
   */
  alloc (numberOfBytes: int32): int32 {

    pre: checkListIntegrity(this.int32Array);

    post: {
      it === 0 || it >= quadsToBytes(FIRST_BLOCK_OFFSET_IN_QUADS);
      checkListIntegrity(this.int32Array);
    }

    if (numberOfBytes < MIN_FREEABLE_SIZE_IN_BYTES || numberOfBytes > this.length || typeof numberOfBytes !== 'number' || isNaN(numberOfBytes)) {
      throw new RangeError(`Allocation size must be between ${MIN_FREEABLE_SIZE_IN_BYTES} bytes and ${this.length - OVERHEAD_IN_BYTES} bytes`);
    }

    if (numberOfBytes / POINTER_SIZE_IN_BYTES !== Math.floor(numberOfBytes / POINTER_SIZE_IN_BYTES)) {
      throw new RangeError(`Allocation size must be a multiple of the pointer size (${POINTER_SIZE_IN_BYTES}).`);
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

    if (blockSize - (minimumSize + POINTER_OVERHEAD_IN_QUADS) >= MIN_FREEABLE_SIZE_IN_QUADS) {
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

    pre: checkListIntegrity(this.int32Array);

    post: {
      it >= 0;
      it < quadsToBytes(this.int32Array.length);
      checkListIntegrity(this.int32Array);
    }


    if (address < FIRST_BLOCK_OFFSET_IN_BYTES || address > this.length || typeof address !== 'number' || isNaN(address)) {
      throw new RangeError(`Address must be between ${FIRST_BLOCK_OFFSET_IN_BYTES} and ${this.length - OVERHEAD_IN_BYTES}`);
    }

    if (address / POINTER_SIZE_IN_BYTES !== Math.floor(address / POINTER_SIZE_IN_BYTES)) {
      throw new RangeError(`Address must be a multiple of the pointer size (${POINTER_SIZE_IN_BYTES}).`);
    }


    const int32Array: Int32Array = this.int32Array;
    const block = bytesToQuads(address);

    const blockSize: uint32 = readSize(int32Array, block);

    trace: `Freeing ${quadsToBytes(blockSize)} bytes from block ${address}.`;

    /* istanbul ignore if  */
    if (blockSize < MIN_FREEABLE_SIZE_IN_QUADS || blockSize > (this.length - OVERHEAD_IN_BYTES) / 4) {
      throw new RangeError(`Invalid block: ${block}, got block size: ${quadsToBytes(blockSize)}`);
    }

    const preceding: int32 = getFreeBlockBefore(int32Array, block);
    const trailing: int32 = getFreeBlockAfter(int32Array, block);
    if (preceding !== 0) {
      if (trailing !== 0) {
        return quadsToBytes(insertMiddle(int32Array, preceding, block, blockSize, trailing));
      }
      else {
        return quadsToBytes(insertAfter(int32Array, preceding, block, blockSize));
      }
    }
    else if (trailing !== 0) {
      return quadsToBytes(insertBefore(int32Array, trailing, block, blockSize));
    }
    else {
      return quadsToBytes(insert(int32Array, block, blockSize));
    }
  }

  /**
   * Return the size of the block at the given address.
   */
  sizeOf (address: int32): uint32 {
    if (address < FIRST_BLOCK_OFFSET_IN_BYTES || address > this.length || typeof address !== 'number' || isNaN(address)) {
      throw new RangeError(`Address must be between ${FIRST_BLOCK_OFFSET_IN_BYTES} and ${this.length - OVERHEAD_IN_BYTES}`);
    }

    if (address / POINTER_SIZE_IN_BYTES !== Math.floor(address / POINTER_SIZE_IN_BYTES)) {
      throw new RangeError(`Address must be a multiple of the pointer size (${POINTER_SIZE_IN_BYTES}).`);
    }

    return quadsToBytes(readSize(this.int32Array, bytesToQuads(address)));
  }

  /**
   * Inspect the instance.
   */
  inspect (): InspectionResult {
    return inspect(this.int32Array);
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

  writeFreeBlockSize(int32Array, headerSize, header);
  int32Array[header + HEIGHT_OFFSET_IN_QUADS] = 1;
  int32Array[header + NEXT_OFFSET_IN_QUADS] = block;
  for (let height = 1; height < MAX_HEIGHT; height++) {
    int32Array[header + NEXT_OFFSET_IN_QUADS + height] = HEADER_OFFSET_IN_QUADS;
  }

  writeFreeBlockSize(int32Array, blockSize, block);
  int32Array[block + HEIGHT_OFFSET_IN_QUADS] = 1;
  int32Array[block + NEXT_OFFSET_IN_QUADS] = header;
}

/**
 * Check the integrity of the freelist in the given array.
 */
export function checkListIntegrity (int32Array: Int32Array): boolean {
  let block: int32 = FIRST_BLOCK_OFFSET_IN_QUADS;
  while (block < int32Array.length - POINTER_SIZE_IN_QUADS) {
    const size: int32 = readSize(int32Array, block);
    /* istanbul ignore if  */
    if (size < POINTER_OVERHEAD_IN_QUADS || size >= int32Array.length - FIRST_BLOCK_OFFSET_IN_QUADS) {
      throw new Error(`Got invalid sized chunk at ${quadsToBytes(block)} (${quadsToBytes(size)} bytes).`);
    }
    else if (isFree(int32Array, block)) {
      checkFreeBlockIntegrity(int32Array, block, size);
    }
    else {
      checkUsedBlockIntegrity(int32Array, block, size);
    }
    block += size + POINTER_OVERHEAD_IN_QUADS;
  }
  return true;
}

function checkFreeBlockIntegrity (int32Array: Int32Array, block: int32, blockSize: int32): boolean {
  /* istanbul ignore if  */
  if (int32Array[block - 1] !== int32Array[block + blockSize]) {
    throw new Error(`Block length header does not match footer (${quadsToBytes(int32Array[block - 1])} vs ${quadsToBytes(int32Array[block + blockSize])}).`);
  }
  const height: int32 = int32Array[block + HEIGHT_OFFSET_IN_QUADS];
  /* istanbul ignore if  */
  if (height < 1 || height > MAX_HEIGHT) {
    throw new Error(`Block ${quadsToBytes(block)} height must be between 1 and ${MAX_HEIGHT}, got ${height}.`);
  }
  for (let i = 0; i < height; i++) {
    const pointer = int32Array[block + NEXT_OFFSET_IN_QUADS + i];
    /* istanbul ignore if  */
    if (pointer >= FIRST_BLOCK_OFFSET_IN_QUADS && !isFree(int32Array, pointer)) {
      throw new Error(`Block ${quadsToBytes(block)} has a pointer to a non-free block (${quadsToBytes(pointer)}).`);
    }
  }
  return true;
}

function checkUsedBlockIntegrity (int32Array: Int32Array, block: int32, blockSize: int32): boolean {
  /* istanbul ignore if  */
  if (int32Array[block - 1] !== int32Array[block + blockSize]) {
    throw new Error(`Block length header does not match footer (${quadsToBytes(int32Array[block - 1])} vs ${quadsToBytes(int32Array[block + blockSize])}).`);
  }
  else {
    return true;
  }
}


/**
 * Inspect the freelist in the given array.
 */
export function inspect (int32Array: Int32Array): InspectionResult {
  const blocks: {type: string; size: int32; node?: ListNode}[] = [];
  const header: ListNode = readListNode(int32Array, HEADER_OFFSET_IN_QUADS);
  let block: int32 = FIRST_BLOCK_OFFSET_IN_QUADS;
  while (block < int32Array.length - POINTER_SIZE_IN_QUADS) {
    const size: int32 = readSize(int32Array, block);
    /* istanbul ignore if  */
    if (size < POINTER_OVERHEAD_IN_QUADS || size >= int32Array.length) {
      throw new Error(`Got invalid sized chunk at ${quadsToBytes(block)} (${quadsToBytes(size)})`);
    }
    if (isFree(int32Array, block)) {
      // @flowIssue todo
      blocks.push(readListNode(int32Array, block));
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
 * Read the list pointers for a given block.
 */
function readListNode (int32Array: Int32Array, block: int32): ListNode {
  pre: {
    block + MIN_FREEABLE_SIZE_IN_QUADS < int32Array.length;
  }

  const height: int32 = int32Array[block + HEIGHT_OFFSET_IN_QUADS];
  const pointers: int32[] = [];
  for (let i = 0; i < height; i++) {
    pointers.push(quadsToBytes(int32Array[block + NEXT_OFFSET_IN_QUADS + i]));
  }

  return {
    type: 'free',
    offset: quadsToBytes(block),
    height,
    pointers,
    size: quadsToBytes(int32Array[block - 1])
  };
}


/**
 * Read the size (in quads) of the block at the given address.
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
  return Math.abs(int32Array[block - 1]);
}

/**
 * Write the size of the block at the given address.
 * Note: This ONLY works for free blocks, not blocks in use.
 */
function writeFreeBlockSize (int32Array: Int32Array, size: int32, block: int32): void {
  pre: {
    block >= 1;
    size !== 0;
  }
  post: {
    int32Array[block - 1] === size;
    int32Array[block + size] === size;
  }

  int32Array[block - 1] = size;
  int32Array[block + size] = size;
}

/**
 * Populate the `UPDATES` array with the offset of the last item in each
 * list level, *before* a node of at least the given size.
 */
function findPredecessors (int32Array: Int32Array, minimumSize: int32): void {
  pre: {
    minimumSize >= MIN_FREEABLE_SIZE_IN_QUADS, "Cannot handle blocks smaller than the minimum freeable size.";
    minimumSize < int32Array.length, "Cannot handle blocks larger than the capacity of the backing array.";
  }

  const listHeight: int32 = int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS];

  let node: int32 = HEADER_OFFSET_IN_QUADS;

  for (let height = listHeight; height > 0; height--) {
    let next: int32 = node + NEXT_OFFSET_IN_QUADS + (height - 1);
    while (int32Array[next] >= FIRST_BLOCK_OFFSET_IN_QUADS && int32Array[int32Array[next] - 1] < minimumSize) {
      node = int32Array[next];
      next = node + NEXT_OFFSET_IN_QUADS + (height - 1);
    }
    UPDATES[height - 1] = node;
  }
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
    it >= HEADER_OFFSET_IN_QUADS;
    it < int32Array.length;
    if (it !== HEADER_OFFSET_IN_QUADS) {
      readSize(int32Array, it) >= minimumSize;
    }
  }

  trace: `Finding a free block of at least ${quadsToBytes(minimumSize)} bytes.`;

  let block: int32 = HEADER_OFFSET_IN_QUADS;

  for (let height = int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS]; height > 0; height--) {
    let next: int32 = int32Array[block + NEXT_OFFSET_IN_QUADS + (height - 1)];

    while (next !== HEADER_OFFSET_IN_QUADS && int32Array[next - 1] < minimumSize) {
      block = next;
      next = int32Array[block + NEXT_OFFSET_IN_QUADS + (height - 1)];
    }
  }

  block = int32Array[block + NEXT_OFFSET_IN_QUADS];
  if (block === HEADER_OFFSET_IN_QUADS) {
    trace: `Could not find a block large enough.`;
    return block;
  }
  else {
    trace: `Got block ${quadsToBytes(block)} (${quadsToBytes(int32Array[block - 1])} bytes).`
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
    secondSize >= MIN_FREEABLE_SIZE_IN_QUADS;
    firstSize + secondSize + POINTER_OVERHEAD_IN_QUADS === blockSize;
  }

  trace: `Splitting block ${quadsToBytes(block)} (${quadsToBytes(blockSize)} bytes) into ${quadsToBytes(firstSize)} bytes and ${quadsToBytes(secondSize)} bytes.`;

  remove(int32Array, block, blockSize);
  assert: !hasPointersTo(int32Array, block), `All traces of the node must be removed.`;

  int32Array[block - 1] = -firstSize;
  int32Array[block + firstSize] = -firstSize;

  assert: {
    !isFree(int32Array, block);
  }

  trace: "Removed first block, inserting second.";
  int32Array[second - 1] = -secondSize;
  int32Array[second + secondSize] = -secondSize;

  insert(int32Array, second, secondSize);

  assert: isFree(int32Array, second);
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
    !hasPointersTo(int32Array, block), `All traces of the block (${quadsToBytes(block)}) must be removed. ${UPDATES.map(quadsToBytes).join(', ')}`;
  }

  trace: `Removing block ${quadsToBytes(block)} (${quadsToBytes(blockSize)} bytes).`;
  findPredecessors(int32Array, blockSize);

  let node: int32 = int32Array[UPDATES[0] + NEXT_OFFSET_IN_QUADS];

  while (node !== block && node !== HEADER_OFFSET_IN_QUADS && int32Array[node - 1] <= blockSize) {
    trace: `Skipping ${quadsToBytes(node)}`;
    for (let height: number = int32Array[node + HEIGHT_OFFSET_IN_QUADS] - 1; height >= 0; height--) {
      if (int32Array[node + NEXT_OFFSET_IN_QUADS + height] === block) {
        UPDATES[height] = node;
      }
    }
    node = int32Array[node + NEXT_OFFSET_IN_QUADS];
  }

  /* istanbul ignore if  */
  if (node !== block) {
    throw new Error(`Could not find block to remove.`);
  }

  let listHeight: int32 = int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS];
  for (let height = 0; height < listHeight; height++) {
    const next: int32 = int32Array[UPDATES[height] + NEXT_OFFSET_IN_QUADS + height];
    if (next !== block) {
      trace: `No higher level points to this node, so breaking early.`;
      break;
    }
    int32Array[UPDATES[height] + NEXT_OFFSET_IN_QUADS + height] = int32Array[block + NEXT_OFFSET_IN_QUADS + height];
  }

  while (listHeight > 0 && int32Array[HEADER_OFFSET_IN_QUADS + NEXT_OFFSET_IN_QUADS + (listHeight - 1)] === HEADER_OFFSET_IN_QUADS) {
    listHeight--;
    int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS] = listHeight;
    trace: `Reducing list height to ${listHeight}`;
  }
  // invert the size sign to signify an allocated block
  int32Array[block - 1] = -blockSize;
  int32Array[block + blockSize] = -blockSize;
}

/**
 * Iterate all of the free blocks in the list, looking for pointers to the given block.
 */
function hasPointersTo (int32Array: Int32Array, block: int32): boolean {
  let next: int32 = FIRST_BLOCK_OFFSET_IN_QUADS;

  while (next < int32Array.length - POINTER_SIZE_IN_QUADS) {
    if (isFree(int32Array, next)) {
      for (let height = int32Array[next + HEIGHT_OFFSET_IN_QUADS] - 1; height >= 0; height--) {
        const pointer: int32 = int32Array[next + NEXT_OFFSET_IN_QUADS + height];
        if (pointer === block) {
          /* istanbul ignore if  */
          return true;
        }
      }
    }
    next += readSize(int32Array, next) + POINTER_OVERHEAD_IN_QUADS;
  }
  return false;
}

/**
 * Determine whether the block at the given address is free or not.
 */
function isFree (int32Array: Int32Array, block: int32): boolean {
  pre: {
    block < int32Array.length;
  }

  /* istanbul ignore if  */
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
  if (block + blockSize + POINTER_OVERHEAD_IN_QUADS >= int32Array.length - 2) {
    // Block is the last in the list.
    return 0;
  }
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
  post: {
    isFree(int32Array, block);
  }

  trace: `Inserting block ${quadsToBytes(block)} (${quadsToBytes(blockSize)} bytes).`;

  findPredecessors(int32Array, blockSize);

  const blockHeight: int32 = generateHeight(int32Array, block, blockSize);
  const listHeight: int32 = int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS];

  for (let height = 1; height <= blockHeight; height++) {
    assert: UPDATES[height - 1] > 0;
    const update: int32 = UPDATES[height - 1] + NEXT_OFFSET_IN_QUADS + (height - 1);
    trace: `Writing next (${height}) pointer (${quadsToBytes(UPDATES[height])}) to ${quadsToBytes(block)}.`;
    int32Array[block + NEXT_OFFSET_IN_QUADS + (height - 1)] = int32Array[update];
    int32Array[update] = block;
    UPDATES[height - 1] = HEADER_OFFSET_IN_QUADS;
  }

  int32Array[block - 1] = blockSize;
  int32Array[block + blockSize] = blockSize;
  return blockSize;
}


/**
 * Insert the given block into the freelist before the given free block,
 * joining them together, returning the number of bytes which were freed.
 */
function insertBefore (int32Array: Int32Array, trailing: int32, block: int32, blockSize: int32): int32 {
  pre: {
    block > 0;
    trailing > block;
    trailing < int32Array.length;
  }
  post: {
    it > 0;
    it < int32Array.length;
  }

  const trailingSize: int32 = readSize(int32Array, trailing);
  trace: `Inserting block ${quadsToBytes(block)} (${quadsToBytes(blockSize)} bytes) before block ${quadsToBytes(trailing)} (${quadsToBytes(trailingSize)} bytes).`;
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
function insertMiddle (int32Array: Int32Array, preceding: int32, block: int32, blockSize: int32, trailing: int32): int32 {
  pre: {
    block > 0;
    preceding < block;
    trailing > block;
    trailing < int32Array.length;
  }
  post: {
    it > 0;
    it < int32Array.length;
  }

  const precedingSize: int32 = readSize(int32Array, preceding);
  const trailingSize: int32 = readSize(int32Array, trailing);
  const size: int32 = ((trailing - preceding) + trailingSize);

  trace: `Inserting block ${quadsToBytes(block)} (${quadsToBytes(blockSize)} bytes) between blocks ${quadsToBytes(preceding)} (${quadsToBytes(precedingSize)} bytes) and ${quadsToBytes(trailing)} (${quadsToBytes(trailingSize)} bytes).`;

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
function insertAfter (int32Array: Int32Array, preceding: int32, block: int32, blockSize: int32): int32 {
  pre: {
    block > 0;
    preceding < block;
    block < int32Array.length;
  }
  post: {
    it > 0;
    it < int32Array.length;
  }

  const precedingSize: int32 = (block - preceding) - POINTER_OVERHEAD_IN_QUADS;

  trace: `Inserting block ${quadsToBytes(block)} (${quadsToBytes(blockSize)} bytes) after block ${quadsToBytes(preceding)} (${quadsToBytes(precedingSize)} bytes).`;

  const size: int32 = ((block - preceding) + blockSize);
  remove(int32Array, preceding, precedingSize);
  int32Array[preceding - POINTER_SIZE_IN_QUADS] = -size;
  int32Array[block + blockSize] = -size;
  insert(int32Array, preceding, size);
  return blockSize;
}



/**
 * Generate a random height for a block, growing the list height by 1 if required.
 */
function generateHeight (int32Array: Int32Array, block: int32, blockSize: int32): int32 {
  pre: {
    blockSize >= MIN_FREEABLE_SIZE_IN_QUADS;
    blockSize < int32Array.length;
  }
  post: {
    it > 0;
    it <= MAX_HEIGHT;
    Math.floor(it) === it;
  }

  const listHeight: int32 = int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS];
  let height: int32 = randomHeight();

  trace: `Generating a block height for block ${quadsToBytes(block)} (${quadsToBytes(blockSize)} bytes, ${blockSize} quads), got ${height}.`;

  if (blockSize - 1 < height + 1) {
    height = blockSize - 2;
    trace: `Block size is too small for the generated height, reducing height to ${height}.`;
  }

  if (height > listHeight) {
    const newHeight: int32 = listHeight + 1;
    trace: `Increasing list height from ${listHeight} to ${newHeight}.`;
    int32Array[HEADER_OFFSET_IN_QUADS + HEIGHT_OFFSET_IN_QUADS] = newHeight;
    int32Array[HEADER_OFFSET_IN_QUADS + NEXT_OFFSET_IN_QUADS + (newHeight - 1)] = HEADER_OFFSET_IN_QUADS;
    UPDATES[newHeight] = HEADER_OFFSET_IN_QUADS;
    int32Array[block + HEIGHT_OFFSET_IN_QUADS] = newHeight;
    return newHeight;
  }
  else {
    int32Array[block + HEIGHT_OFFSET_IN_QUADS] = height;
    return height;
  }
}

/**
 * Generate a random height for a new block.
 */
function randomHeight (): number {
  post: {
    it > 0;
    it <= MAX_HEIGHT;
    Math.floor(it) === it;
  }
  let height: number = 1;
  for (let r: number = Math.ceil(Math.random() * 2147483648); (r & 1) === 1 && height < MAX_HEIGHT; r >>= 1) {
    height++;
    Math.ceil(Math.random() * 2147483648)
  }
  return height;
}
