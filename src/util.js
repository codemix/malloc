const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

export function writeInt16 (buffer: Buffer, value: number, offset: number) {
  buffer[offset] = value;
  buffer[offset + 1] = value >>> 8;
}

export function writeInt32 (buffer: Buffer, value: number, offset: number) {
  buffer[offset] = value;
  buffer[offset + 1] = value >>> 8;
  buffer[offset + 2] = value >>> 16;
  buffer[offset + 3] = value >>> 24;
}

export function readInt16 (buffer: Buffer, offset: number): number {
  let value = buffer[offset] | (buffer[offset + 1] << 8);
  return (value & 0x8000) ? value | 0xFFFF0000 : value;
}

export function readInt32 (buffer: Buffer, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
}

export function readUInt16 (buffer: Buffer, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

export function readUInt32 (buffer: Buffer, offset: number): number {
  return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)) + (buffer[offset + 3] * 0x1000000);
}

export function readUInt24 (buffer: Buffer, offset: number): number {
  return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16));
}

export function readInt48 (buffer: Buffer, offset: number): number {
  const value = (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)) + (buffer[offset + 3] * 0x1000000) + ((buffer[offset + 4] | (buffer[offset + 5] << 8)) * SHIFT_LEFT_32);
  if (value > Math.pow(2, 47)) {
    return value - Math.pow(2, 48);
  }
  else {
    return value;
  }
}

export function writeUInt16 (buffer: Buffer, value: number, offset: number) {
  buffer[offset] = value;
  buffer[offset + 1] = value >>> 8;
}

export function writeUInt24 (buffer: Buffer, value: number, offset: number) {
  buffer[offset + 2] = (value >>> 16);
  buffer[offset + 1] = (value >>> 8);
  buffer[offset] = value;
}

export function writeUInt32 (buffer: Buffer, value: number, offset: number) {
  buffer[offset + 3] = (value >>> 24);
  buffer[offset + 2] = (value >>> 16);
  buffer[offset + 1] = (value >>> 8);
  buffer[offset] = value;
}

export function writeInt48 (buffer: Buffer, value: number, offset: number) {
  const wide = value & -1;
  const narrow = Math.floor(value * SHIFT_RIGHT_32);
  buffer[offset] = wide;
  buffer[offset + 1] = wide >>> 8;
  buffer[offset + 2] = wide >>> 16;
  buffer[offset + 3] = wide >>> 24;
  buffer[offset + 4] = narrow;
  buffer[offset + 5] = narrow >>> 8;
}
