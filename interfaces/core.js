/* @flow */

declare type uint8 = number;
declare type uint16 = number;
declare type uint32 = number;

declare type int8 = number;
declare type int16 = number;
declare type int32 = number;

declare type float32 = number;
declare type float64 = number;

declare type double = number;

declare class Function {
  static (): any;
  apply: Function$Prototype$Apply; // (thisArg: any, argArray?: any) => any
  bind: Function$Prototype$Bind; // (thisArg: any, ...argArray: Array<any>) => any;
  call: Function$Prototype$Call; // (thisArg: any, ...argArray: Array<any>) => any
  arguments: any;
  caller: Function | null;
  length: number;
  name: string;
}

declare class Symbol {
  static iterator: string; // polyfill '@@iterator'
  static hasInstance: string; // polyfill '@@hasInstance'
  static (value?:any): Symbol;

  static for (key: string): Symbol
}

declare class ArrayBuffer {
    constructor(byteLength: number): void;
    byteLength: number;
    slice(begin:number, end?:number): ArrayBuffer;
}

declare class ArrayBufferView {
    buffer: ArrayBuffer;
    byteOffset: number;
    byteLength: number;
}

declare class Int8Array extends ArrayBufferView {
    // Constructor(unsigned long length),
    // Constructor(TypedArray array),
    // Constructor(type[] array),
    // Constructor(ArrayBuffer buffer, optional unsigned long byteOffset, optional unsigned long length)
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Int8Array | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Int8Array;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Int8Array;
}

declare class Uint8Array extends ArrayBufferView {
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Uint8Array | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Uint8Array;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Uint8Array;
}

declare class Uint8ClampedArray extends ArrayBufferView {
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Uint8ClampedArray | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Uint8ClampedArray;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Uint8ClampedArray;
}

declare class Int16Array extends ArrayBufferView {
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Int16Array | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Int16Array;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Int16Array;
}

declare class Uint16Array extends ArrayBufferView {
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Uint16Array | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Uint16Array;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Uint16Array;
}

declare class Int32Array extends ArrayBufferView {
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Int32Array | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Int32Array;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Int32Array;
    map(visitor: Function): Int32Array;
    join(separator?: string): string;
}

declare class Uint32Array extends ArrayBufferView {
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Uint32Array | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Uint32Array;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Uint32Array;
}

declare class Float32Array extends ArrayBufferView {
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Float32Array | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Float32Array;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Float32Array;
}

declare class Float64Array extends ArrayBufferView {
    constructor(buffer: ArrayBuffer | number | Array<number> | ArrayBufferView, byteOffset?: number, length?: number): void;
    [index: number]: number;
    BYTES_PER_ELEMENT: number;
    length: number;
    get(index: number): number;
    set(index: number, value: number): void;
    set(array: Float64Array | Array<number>, offset?: number): void;
    subarray(begin: number, end?: number): Float64Array;
    slice(begin: number, end?: number): Array<number>;
    fill(value: number, begin?: number, end?: number): Float64Array;
}

declare class DataView extends ArrayBufferView {
    constructor(buffer: ArrayBuffer, byteOffset?: number, length?: number): void;
    getInt8(byteOffset: number): number;
    getUint8(byteOffset: number): number;
    getInt16(byteOffset: number, littleEndian?: boolean): number;
    getUint16(byteOffset: number, littleEndian?: boolean): number;
    getInt32(byteOffset: number, littleEndian?: boolean): number;
    getUint32(byteOffset: number, littleEndian?: boolean): number;
    getFloat32(byteOffset: number, littleEndian?: boolean): number;
    getFloat64(byteOffset: number, littleEndian?: boolean): number;
    setInt8(byteOffset: number, value: number): void;
    setUint8(byteOffset: number, value: number): void;
    setInt16(byteOffset: number, value: number, littleEndian?: boolean): void;
    setUint16(byteOffset: number, value: number, littleEndian?: boolean): void;
    setInt32(byteOffset: number, value: number, littleEndian?: boolean): void;
    setUint32(byteOffset: number, value: number, littleEndian?: boolean): void;
    setFloat32(byteOffset: number, value: number, littleEndian?: boolean): void;
    setFloat64(byteOffset: number, value: number, littleEndian?: boolean): void;
}
