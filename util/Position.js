export default class Position {
    x = 0;
    z = 0;
    plane = 0;

    constructor(x = 0, z = 0, plane = 0) {
        this.x = x;
        this.z = z;
        this.plane = plane;
    }

    equals(other) {
        return this.x === other.x && this.z === other.z && this.plane === other.plane;
    }

    copy() {
        return new Location(this.x, this.z, this.plane);
    }

    clone(other) {
        this.x = other.x;
        this.z = other.z;
        this.plane = other.plane;
    }

    toString() {
        return `(${this.x}, ${this.z}, ${this.plane})`;
    }

    near(other, distance) {
        return Math.abs(this.x - other.x) <= distance && Math.abs(this.z - other.z) <= distance;
    }

    distanceTo(other) {
        return Math.sqrt(Math.pow(this.x - other.x, 2) + Math.pow(this.z - other.z, 2));
    }

    // range: 0-200
    get mapsquareX() {
        return this.x >> 6;
    }

    get mapsquareZ() {
        return this.z >> 6;
    }

    // range: 0-1600
    get zoneX() {
        return this.x >> 3;
    }

    get zoneZ() {
        return this.z >> 3;
    }

    // local to the mapsquare
    get mapLocalX() {
        return this.x & 63;
    }

    get mapLocalZ() {
        return this.z & 63;
    }

    // local to the build area (13x13 zones or 104x104 tiles)
    // we subtract 6 from the current zone to get to the edge of the build area
    get baLocalX() {
        // generic version: abs - ((zone - Math.floor(ba / 2)) << 3)
        return this.x - ((this.zoneX - 6) << 3); // = [48-55]
    }

    get baLocalZ() {
        return this.z - ((this.zoneZ - 6) << 3);
    }

    get highRes() {
        return this.z | this.x << 14 | this.plane << 28;
    }

    get lowRes() {
        return this.mapsquareZ | this.mapsquareX << 8 | this.plane;
    }
}