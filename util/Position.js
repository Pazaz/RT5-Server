export default class Position {
    static BUILD_AREA = [104, 120, 136, 168];

    x = 0;
    z = 0;
    plane = 0;

    // build area
    baIndex = 0;
    baSizeX = Position.BUILD_AREA[this.baIndex];
    baSizeZ = Position.BUILD_AREA[this.baIndex];

    constructor(x = 0, z = 0, plane = 0) {
        this.x = x;
        this.z = z;
        this.plane = plane;
    }

    updateBuildArea(index) {
        this.baIndex = index;
        this.baSizeX = Position.BUILD_AREA[this.baIndex];
        this.baSizeZ = Position.BUILD_AREA[this.baIndex];
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

    // local to the build area
    get baStartX() {
        return (this.zoneX - (this.baSizeX >> 4)) << 3;
    }

    get baEndX() {
        return (this.zoneX + (this.baSizeX >> 4)) << 3;
    }

    get baStartZ() {
        return (this.zoneZ - (this.baSizeZ >> 4)) << 3;
    }

    get baEndZ() {
        return (this.zoneZ + (this.baSizeZ >> 4)) << 3;
    }

    get baLocalX() {
        return this.x - this.baStartX;
    }

    get baLocalZ() {
        return this.z - this.baStartZ;
    }

    // GPI
    get highRes() {
        return this.z | this.x << 14 | this.plane << 28;
    }

    get lowRes() {
        return this.mapsquareZ | this.mapsquareX << 8 | this.plane;
    }
}