import type { IOBuffer } from './types'

export function createBuffer(capacity: number, initialBytes: Uint8Array = new Uint8Array()): IOBuffer {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError('La capacidad del búfer debe ser un entero no negativo.')
  }
  if (initialBytes.length > capacity) {
    throw new RangeError('Los bytes iniciales no caben en el búfer.')
  }

  const data = new Uint8Array(capacity)
  data.set(initialBytes)
  return { capacity, data, validLength: initialBytes.length }
}

export function cloneBuffer(buffer: IOBuffer): IOBuffer {
  return { capacity: buffer.capacity, data: buffer.data.slice(), validLength: buffer.validLength }
}

export function validBufferBytes(buffer: IOBuffer): Uint8Array {
  return buffer.data.slice(0, buffer.validLength)
}

export function bufferFromBytes(bytes: Uint8Array): IOBuffer {
  return createBuffer(bytes.length, bytes)
}
