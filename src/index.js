/* @flow */
import {EventEmitter} from "events";
import {readInt32, writeInt32} from "./util";

const readLength: ((buffer: Buffer, offset: number) => number) = readInt32;
const readPointer: ((buffer: Buffer, offset: number) => number) = readInt32;

const writeLength: ((buffer: Buffer, value: number, offset: number) => void) = writeInt32;
const writePointer: ((buffer: Buffer, value: number, offset: number) => void) = writeInt32;

const POINTER_SIZE = 4;
const POINTER_OVERHEAD = POINTER_SIZE * 2;

const HEADER_OFFSET = POINTER_SIZE;
const HEADER_SIZE = 64;
const HEIGHT_OFFSET = 0;
const NEXT_OFFSET = 4;
const PREV_OFFSET = 8;

const MIN_FREEABLE_SIZE = 64;
const FIRST_BLOCK = HEADER_OFFSET + HEADER_SIZE + POINTER_OVERHEAD;

/**
 * The Allocator class takes a buffer and exposes two primary methods, `alloc` and `free`.
 */
export class Allocator {
  constructor (buffer: Buffer) {
    this.buffer = prepare(buffer);
  }

  /**
   * Allocate a given number of bytes and return the offset.
   * If allocation fails, returns 0.
   */
  alloc (numberOfBytes: number): number {
    return alloc(this.buffer, numberOfBytes);
  }

  /**
   * Free a number of bytes from the given address.
   */
  free (block: number): number {
    return free(this.buffer, block);
  }

  inspect () {
    return inspect(this.buffer);
  }
}

/**
 * Prepare the given buffer and ensure it contains a valid header.
 */
export function prepare (buffer: Buffer): Buffer {
  if (!verifyHeader(buffer)) {
    writeInitialHeader(buffer);
  }
  return buffer;
}

/**
 * Allocate a given number of bytes and return the offset.
 * If allocation fails, returns 0.
 */
export function alloc (buffer: Buffer, numberOfBytes: number): number {
  const block: number = findFreeBlock(buffer, numberOfBytes);
  if (block <= HEADER_OFFSET) {
    return 0;
  }
  if (readSize(buffer, block) - numberOfBytes >= MIN_FREEABLE_SIZE) {
    split(buffer, block, numberOfBytes);
  }
  else {
    remove(buffer, block);
  }
  return block;
}

/**
 * Free a number of bytes from the given address.
 */
export function free (buffer: Buffer, block: number): number {
  if (block < FIRST_BLOCK) {
    return 0;
  }
  const preceding: number = getFreeBlockBefore(buffer, block);
  const trailing: number = getFreeBlockAfter(buffer, block);
  if (preceding !== 0) {
    if (trailing !== 0) {
      return insertMiddle(buffer, preceding, block, trailing);
    }
    else {
      return insertAfter(buffer, preceding, block);
    }
  }
  else if (trailing !== 0) {
    return insertBefore(buffer, trailing, block);
  }
  else {
    return insert(buffer, block);
  }
}

/**
 * Inspect a freelist in a buffer and return details about the memory layout.
 */
export function inspect (buffer: Buffer): Object {
  const blocks: {type: string; size: number; pointers?: [number, number][]}[] = [];
  let pointer: number = FIRST_BLOCK;
  while (pointer < buffer.length - POINTER_SIZE) {
    const size: number = readSize(buffer, pointer);
    if (size < POINTER_OVERHEAD) {
      throw new Error(`Got invalid sized chunk at ${pointer} (${size})`);
    }
    if (isFree(buffer, pointer)) {
      blocks.push({
        type: 'free',
        offset: pointer,
        size: size,
        pointers: [
          [readPrev(buffer, pointer), readNext(buffer, pointer)]
        ]
      });
    }
    else {
      blocks.push({
        type: 'used',
        offset: pointer,
        size: size
      });
    }
    pointer += size + POINTER_OVERHEAD;
  }
  return {blocks};
}

/**
 * Verify that the buffer contains a valid header.
 */
export function verifyHeader (buffer: Buffer): boolean {
  return readSize(buffer, HEADER_OFFSET) === HEADER_SIZE && readLength(buffer, HEADER_OFFSET + HEADER_SIZE) === HEADER_SIZE;
}

/**
 * Write the initial header for an empty buffer.
 */
function writeInitialHeader (buffer: Buffer) {
  const block = FIRST_BLOCK;
  const blockSize = buffer.length - (HEADER_OFFSET + HEADER_SIZE + POINTER_OVERHEAD + POINTER_SIZE);
  writeSize(buffer, HEADER_SIZE, HEADER_OFFSET);
  writeNext(buffer, block, HEADER_OFFSET);
  writePrev(buffer, block, HEADER_OFFSET);
  writeSize(buffer, blockSize, block);
  writeNext(buffer, HEADER_OFFSET, block);
  writePrev(buffer, HEADER_OFFSET, block);
}



/**
 * Find a free block with at least the given number of bytes and return its address.
 */
function findFreeBlock (buffer: Buffer, numberOfBytes: number): number {
  let block: number = readPointer(buffer, HEADER_OFFSET + NEXT_OFFSET);
  while (block > HEADER_OFFSET) {
    const blockSize: number = readSize(buffer, block);
    if (blockSize >= numberOfBytes) {
      return block;
    }
    block = readNext(buffer, block);
  }
  return 0;
}

/**
 * Read the next item from the given block.
 */
function readNext (buffer: Buffer, block: number): number {
  return readPointer(buffer, block + NEXT_OFFSET);
}

/**
 * Read the previous item from the given block.
 */
function readPrev (buffer: Buffer, block: number): number {
  return readPointer(buffer, block + PREV_OFFSET);
}

/**
 * Write the next item to the given block.
 */
function writeNext (buffer: Buffer, value: number, block: number) {
  writePointer(buffer, value, block + NEXT_OFFSET);
}

/**
 * Write the previous item to the given block.
 */
function writePrev (buffer: Buffer, value: number, block: number) {
  writePointer(buffer, value, block + PREV_OFFSET);
}

/**
 * Read the size of the block at the given address.
 */
function readSize (buffer: Buffer, block: number): number {
  return Math.abs(readLength(buffer, block - POINTER_SIZE));
}

/**
 * Write the size of the block at the given address.
 */
function writeSize (buffer: Buffer, size: number, block: number): void {
  writeLength(buffer, size, block - POINTER_SIZE);
  writeLength(buffer, size, block + Math.abs(size));
}

/**
 * Split the given block after a certain number of bytes and add the second half to the freelist.
 */
function split (buffer: Buffer, block: number, numberOfBytes: number): void {
  const blockSize: number = readSize(buffer, block);
  const next: number = readNext(buffer, block);
  const prev: number = readPrev(buffer, block);
  writeNext(buffer, next, prev);
  writePrev(buffer, prev, next);
  // mark the block as allocated
  writeSize(buffer, -numberOfBytes, block);

  const second = block + numberOfBytes + POINTER_OVERHEAD;
  const secondSize = blockSize - (second - block);
  insert(buffer, second, secondSize);
}

/**
 * Remove the given block from the freelist and mark it as allocated.
 */
function remove (buffer: Buffer, block: number, blockSize: number = readSize(buffer, block)): void {
  const next: number = readNext(buffer, block);
  const prev: number = readPrev(buffer, block);
  writeNext(buffer, next, prev);
  writePrev(buffer, prev, next);
  // invert the size sign to signify an allocated block
  writeSize(buffer, -blockSize, block);
}

/**
 * Determine whether the block at the given address is free or not.
 */
function isFree (buffer: Buffer, block: number): boolean {
  if (block < HEADER_SIZE) {
    return false;
  }
  const length: number = readLength(buffer, block - POINTER_SIZE);
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
function getFreeBlockBefore (buffer: Buffer, block: number): number {
  if (block <= FIRST_BLOCK) {
    return 0;
  }
  const beforeSize: number = readLength(buffer, block - POINTER_OVERHEAD)
  if (beforeSize < POINTER_OVERHEAD) {
    return 0;
  }
  return block - (POINTER_OVERHEAD + beforeSize);
}

/**
 * Get the address of the block after the given one and return its address *if it is free*,
 * otherwise 0.
 */
function getFreeBlockAfter (buffer: Buffer, block: number): number {
  const blockSize: number = readSize(buffer, block);
  const next: number = block + blockSize + POINTER_OVERHEAD;
  const nextSize: number = readLength(buffer, next - POINTER_SIZE);
  if (nextSize < POINTER_OVERHEAD) {
    return 0;
  }
  return next;
}


/**
 * Insert the given block into the freelist and return the number of bytes that were freed.
 */
function insert (buffer: Buffer, block: number, blockSize: number = readSize(buffer, block)): number {
  let next: number = readPointer(buffer, NEXT_OFFSET);
  let prev: number = HEADER_OFFSET;
  while (next > HEADER_OFFSET) {
    const nextSize: number = readSize(buffer, next);
    if (nextSize >= blockSize) {
      break;
    }
    prev = next;
    next = readNext(buffer, next);
  }
  writeSize(buffer, blockSize, block);
  writeNext(buffer, next, block);
  writePrev(buffer, prev, block);

  writeNext(buffer, block, prev);
  writePrev(buffer, block, next);

  return blockSize;
}

/**
 * Insert the given block into the freelist before the given free block,
 * joining them together, returning the number of bytes which were freed.
 */
function insertBefore (buffer: Buffer, trailing: number, block: number): number {
  remove(buffer, trailing);
  const blockSize: number = readSize(buffer, block);
  const trailingSize: number = readSize(buffer, trailing);
  const size: number = blockSize + trailingSize + POINTER_OVERHEAD;
  writeLength(buffer, size, block - POINTER_SIZE);
  writeLength(buffer, size, trailing + trailingSize);
  insert(buffer, block);
  return blockSize;
}

/**
 * Insert the given block into the freelist in between the given free blocks,
 * joining them together, returning the number of bytes which were freed.
 */
function insertMiddle (buffer: Buffer, preceding: number, block: number, trailing: number): number {
  const blockSize: number = readSize(buffer, block);
  const trailingSize: number = readSize(buffer, trailing);
  const size: number = (trailing - preceding) + trailingSize;
  remove(buffer, preceding);
  remove(buffer, trailing);
  writeLength(buffer, size, preceding - POINTER_SIZE);
  writeLength(buffer, size, trailing + trailingSize);
  insert(buffer, preceding, size);
  return blockSize;
}

/**
 * Insert the given block into the freelist after the given free block,
 * joining them together, returning the number of bytes which were freed.
 */
function insertAfter (buffer: Buffer, preceding: number, block: number): number {
  remove(buffer, preceding);
  const blockSize: number = readSize(buffer, block);
  const size: number = (block - preceding) + blockSize;
  writeLength(buffer, size, preceding - POINTER_SIZE);
  writeLength(buffer, size, block + blockSize);
  insert(buffer, preceding);
  return blockSize;
}