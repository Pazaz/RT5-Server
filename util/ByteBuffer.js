import fs from 'fs';

import crc32 from 'crc-32';
import forge from 'node-forge';
import { IsaacRandom } from '#util/IsaacRandom.js';

const RSA = forge.pki.privateKeyFromPem(fs.readFileSync('data/private.pem'));

const BITMASK = [
    0,
    0x1, 0x3, 0x7, 0xF,
    0x1F, 0x3F, 0x7F, 0xFF,
    0x1FF, 0x3FF, 0x7FF, 0xFFF,
    0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF,
    0x1FFFF, 0x3FFFF, 0x7FFFF, 0xFFFFF,
    0x1FFFFF, 0x3FFFFF, 0x7FFFFF, 0xFFFFFF,
    0x1FFFFFF, 0x3FFFFFF, 0x7FFFFFF, 0xFFFFFFF,
    0x1FFFFFFF, 0x3FFFFFFF, 0x7FFFFFFF, 0xFFFFFFFF
];

let GLOBAL_ENDIANNESS = false;

export class ByteBuffer {
    #buffer;
    #view;

    static crc32(buf) {
        if (buf.raw) {
            buf = buf.raw;
        }

        return crc32.buf(buf);
    }

    static alloc(capacity, fill = 0) {
        let stream = new ByteBuffer(new Uint8Array(capacity));
        if (fill) {
            for (let i = 0; i < capacity; i++) {
                stream.raw[i] = fill;
            }
        }
        return stream;
    }

    constructor(source, endianness = GLOBAL_ENDIANNESS) {
        // bit-writing
        this.bitOffset = 0;

        if (!source) {
            this.#buffer = new Uint8Array().buffer;
            this.raw = new Uint8Array(this.#buffer);
            this.#view = new DataView(this.#buffer);
            this.offset = 0;
            this.endianness = endianness;
            return;
        }

        if (ArrayBuffer.isView(source)) {
            source = new Uint8Array(source).buffer;
        }

        this.#buffer = source;
        this.raw = new Uint8Array(source);
        this.#view = new DataView(source);
        this.offset = 0;
        this.endianness = endianness;
    }

    clone(other) {
        this.#buffer = other.raw.buffer;
        this.raw = new Uint8Array(this.#buffer);
        this.#view = new DataView(this.#buffer);
        this.offset = other.offset;
        this.bitOffset = other.bitOffset;
        this.endianness = other.endianness;
        return this;
    }

    append(bytes) {
        if (bytes <= 0) {
            throw new RangeError(`Invalid number of bytes ${bytes}`);
        }

        const data = new Uint8Array(this.length + bytes);
        data.set(this.raw, 0);
        this.#buffer = data.buffer;
        this.raw = data;
        this.#view = new DataView(data.buffer);
        return this;
    }

    toString() {
        return Buffer.from(this.raw).toString();
    }

    // getters

    get buffer() {
        return this.#buffer;
    }

    get view() {
        return this.#view;
    }

    get length() {
        return this.#buffer.byteLength;
    }

    get available() {
        return this.length - this.offset;
    }

    get availableBits() {
        return (this.length * 8) - this.bitOffset;
    }

    // offset-related functions

    front() {
        this.offset = 0;
        this.bitOffset = 0;
        return this;
    }

    back() {
        this.offset = this.length;
        return this;
    }

    seek(bytes = 1) {
        bytes = Number(bytes);
        this.offset += bytes;
        return this;
    }

    seekTo(offset) {
        this.offset = offset;
        return this;
    }

    // read-related functions

    slice(begin = this.offset, end = this.length) {
        return new ByteBuffer(this.#buffer.slice(begin, end), this.endianness);
    }

    gdata(bytes = this.available) {
        bytes = Number(bytes);
        const value = this.slice(this.offset, this.offset + bytes);
        this.seek(bytes);
        return value;
    }

    gbool() {
        return this.g1() === 1;
    }

    // 0 to 32768
    gsmart() {
        let i = this.peek1();
        if (i < 0x80) {
            return this.g1();
        } else {
            return this.g2() - 0x8000;
        }
    }

    // -16384 to 16383
    gsmarts() {
        let i = this.peek1();
        if (i < 0x80) {
            return this.g1() - 0x40;
        } else {
            return this.g2() - 0xC000;
        }
    }

    gjstr() {
        const start = this.offset;
        for (; this.available && this.peek1() !== 0; ++this.offset) { }
        let length = this.offset - start;
        if (!length) {
            this.seek(1);
            return '';
        }
        this.front().seek(start);
        const str = new TextDecoder('ascii').decode(this.gdata(length).view);
        this.seek(1);
        return str;
    }

    // write-related functions

    pdata(data) {
        if (data.raw) {
            data = data.raw;
        }
        if (this.available < data.length) {
            this.append(data.length - this.available);
        }
        this.raw.set(data, this.offset);
        this.seek(data.length);
        return this;
    }

    psize1(length) {
        this.raw[this.offset - length - 1] = length;
        return this;
    }

    psize2(length) {
        this.raw[this.offset - length - 2] = length >> 8;
        this.raw[this.offset - length - 1] = length;
        return this;
    }

    pjstr(str) {
        if (typeof str !== 'string') {
            str = str.toString();
        }

        for (let i = 0; i < str.length; ++i) {
            this.p1(str.charCodeAt(i));
        }
        this.p1(0);
        return this;
    }

    pjstr2(str) {
        if (typeof str !== 'string') {
            str = str.toString();
        }

        this.p1(0); // version prepended
        for (let i = 0; i < str.length; ++i) {
            this.p1(str.charCodeAt(i));
        }
        this.p1(0); // null-terminated
        return this;
    }

    pbool(value) {
        this.p1(value);
        return this;
    }

    // 0 to 32768
    psmart(value) {
        if (value < 0x80) {
            this.p1(value);
        } else {
            this.p2(value + 0x8000);
        }
    }

    // -16384 to 16383
    psmarts(value) {
        if (value < 0x80) {
            this.p1(value + 0x40);
        } else {
            this.p2(value + 0xC000);
        }
    }

    // bit-level access

    accessBits() {
        this.bitOffset = this.offset << 3;
    }

    pBit(n, value) {
        let bytePos = this.bitOffset >>> 3;
        let remaining = 8 - (this.bitOffset & 7);
        this.bitOffset += n;

        // grow if necessary
        if (bytePos + 1 > this.length) {
            this.append((bytePos + 1) - this.length);
        }

        for (; n > remaining; remaining = 8) {
            this.raw[bytePos] &= ~BITMASK[remaining];
            this.raw[bytePos++] |= (value >>> (n - remaining)) & BITMASK[remaining];
            n -= remaining;

            // grow if necessary
            if (bytePos + 1 > this.length) {
                this.append((bytePos + 1) - this.length);
            }
        }

        if (n == remaining) {
            this.raw[bytePos] &= ~BITMASK[remaining];
            this.raw[bytePos] |= value & BITMASK[remaining];
        } else {
            this.raw[bytePos] &= ~BITMASK[n] << (remaining - n);
            this.raw[bytePos] |= (value & BITMASK[n]) << (remaining - n);
        }
        // this.accessBytes(); // just in case mixed bit/byte access occurs
    }

    gBit(n) {
        let bytePos = this.bitOffset >> 3;
        let remaining = 8 - (this.bitOffset & 7);
        let value = 0;
        this.bitOffset += n;

        for (; n > remaining; remaining = 8) {
            value += (this.raw[bytePos++] & BITMASK[remaining]) << (n - remaining);
            n -= remaining;
        }

        if (n == remaining) {
            value += this.raw[bytePos] & BITMASK[remaining];
        } else {
            value += (this.raw[bytePos] >> (remaining - n)) & BITMASK[n];
        }

        // this.accessBytes(); // just in case mixed bit/byte access occurs
        return value;
    }

    seekBits(n) {
        this.bitOffset += n;
    }

    peekBits(n) {
        let value = this.getBits(n);
        this.seekBits(-n);
        return value;
    }

    // similar to align() for bits
    accessBytes() {
        this.offset = (this.bitOffset + 7) >>> 3;
    }

    tinydec(key, len, off = 0) {
        let start = this.offset;
        this.offset = off;

        let blocks = Math.ceil((len - off) / 8);
        for (let i = 0; i < blocks; i++) {
            let v0 = this.g4();
            let v1 = this.g4();
            let sum = 0xC6EF3720;
            let rounds = 32;

            while (rounds-- > 0) {
                v1 -= (v0 << 4 ^ v0 >>> 5) + v0 ^ sum + key[sum >>> 11 & 3];
                sum -= 0x9E3779B9;
                v0 -= (v1 << 4 ^ v1 >>> 5) + v1 ^ sum + key[sum & 3];
            }

            this.offset -= 8;
            this.p4(v0);
            this.p4(v1);
        }

        this.offset = start;
    }

    rsadec() {
        // we aren't using BigInteger, so we have to do this manually
        let rsa = this.gdata(this.g1()).raw;
        if (rsa.length == 65 && rsa[0] == 0) {
            // Java BigInteger adds a 0 to indicate it's unsigned
            rsa = rsa.slice(1);
        } else if (rsa.length == 63) {
            // Java BigInteger didn't pad to 64
            let temp = new Uint8Array(64);
            temp.set(rsa, 1);
            rsa = temp;
        }

        let decrypted = new ByteBuffer(Buffer.from(RSA.decrypt(rsa, 'RAW', 'NONE'), 'ascii'));

        // BigInteger would also remove all the preceeding 0s so we seek past them
        while (decrypted.peek1() == 0) {
            decrypted.seek(1);
        }

        return decrypted;
    }

    g1isaac(random) {
        return (this.g1() - random.nextInt()) & 0xFF;
    }

    g1sub() {
        return 128 - this.g1();
    }

    ig2() {
        return this.raw[this.offset++] | this.raw[this.offset++] << 8;
    }

    p1isaac(op, random) {
        this.p1(op + random.nextInt());
    }

    ip2(value) {
        this.p1(value);
        this.p1(value >> 8);
    }

    p1neg(value) {
        this.p1(-value);
    }

    p1sub(value) {
        this.p1(128 - value);
    }

    ipdata(data) {
        if (data instanceof ByteBuffer) {
            data = data.raw;
        }

        for (let i = data.length - 1; i >= 0; i--) {
            this.p1(data[i]);
        }
    }
}

const reader = function (method, bytes) {
    return function (endianness = null) {
        if (bytes > this.available) {
            throw new Error(`Cannot read ${bytes} byte(s), ${this.available} available`);
        }

        const value = this.view[method](this.offset, endianness ?? this.endianness);
        this.seek(bytes);
        return value;
    };
};

const peeker = function (method, bytes) {
    return function (endianness = null) {
        if (bytes > this.available) {
            throw new Error(`Cannot read ${bytes} byte(s), ${this.available} available`);
        }

        let order = this.endianness;
        if (endianness != null) {
            order = endianness;
        }
        const value = this.view[method](this.offset, order);
        return value;
    };
};

const writer = function (method, bytes) {
    return function (value, endianness = null) {
        if (bytes > this.available) {
            this.append(bytes - this.available);
        }

        let order = this.endianness;
        if (endianness != null) {
            order = endianness;
        }
        if (bytes === 8 && method === 'setBigUint64') {
            value = BigInt(value);
        } else {
            value = Number(value);
        }
        this.view[method](this.offset, value, order);
        this.seek(bytes);
        return this;
    };
};

// readers
ByteBuffer.prototype.g1b = reader('getInt8', 1);
ByteBuffer.prototype.g1 = reader('getUint8', 1);
ByteBuffer.prototype.g2b = reader('getInt16', 2);
ByteBuffer.prototype.g2 = reader('getUint16', 2);
ByteBuffer.prototype.g4b = reader('getInt32', 4);
ByteBuffer.prototype.g4 = reader('getUint32', 4);
ByteBuffer.prototype.g8b = reader('getBigInt64', 8);
ByteBuffer.prototype.g8 = reader('getBigUint64', 8);

// peekers
ByteBuffer.prototype.peek1 = peeker('getUint8', 1);
ByteBuffer.prototype.peek4 = peeker('getUint32', 4);

// writers
ByteBuffer.prototype.p1 = writer('setUint8', 1);
ByteBuffer.prototype.p2 = writer('setUint16', 2);
ByteBuffer.prototype.p4 = writer('setUint32', 4);
ByteBuffer.prototype.p8 = writer('setBigUint64', 8);
