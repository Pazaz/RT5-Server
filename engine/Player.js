import { ByteBuffer } from '#util/ByteBuffer.js';
import ClientProt from '#util/ClientProt.js';
import { getXtea } from '#util/OpenRS2.js';

export default class Player {
    client = null;

    firstLoad = true;
    loaded = false;
    loading = false;
    appearance = null;
    placement = false;
    verifyId = 1;

    id = 1;
    username = '';
    windowMode = 0;

    lastX = -1;
    lastZ = -1;
    lastPlane = -1;
    x = 3213; // 2925;
    z = 3433; // 3323;
    plane = 0;

    constructor(client) {
        this.client = client;
    }

    tick() {
        if (!this.loaded && !this.loading) {
            this.loading = true;

            if (this.firstLoad) {
                let response = new ByteBuffer();
                response.p1(98);
                response.p2(0);
                let start = response.offset;

                //

                response.accessBits();
                response.pBit(30, this.z | this.x << 14 | this.plane << 28);
                this.lastX = this.x;
                this.lastZ = this.z;
                this.lastPlane = this.plane;

                for (let i = 1; i < 2048; i++) {
                    if (this.id == i) {
                        continue;
                    }

                    response.pBit(18, 0);
                }
                response.accessBytes();

                // REBUILD_NORMAL

                response.ip2(this.x >> 3);
                response.p2(this.z >> 3);
                response.p1(0); // map size?
                response.p1neg(0);

                for (let mapsquareX = ((this.x >> 3) - 6) >> 3; mapsquareX <= ((this.x >> 3) + 6) >> 3; mapsquareX++) {
                    for (let mapsquareZ = ((this.z >> 3) - 6) >> 3; mapsquareZ <= ((this.z >> 3) + 6) >> 3; mapsquareZ++) {
                        let xtea = getXtea(mapsquareX, mapsquareZ);
                        if (xtea) {
                            for (let i = 0; i < xtea.key.length; i++) {
                                response.p4(xtea.key[i]);
                            }
                        } else {
                            for (let i = 0; i < 4; i++) {
                                response.p4(0);
                            }
                        }
                    }
                }

                response.psize2(response.offset - start);
                this.client.queue(response);
            }

            if (this.firstLoad) {
                // send game frame
                let response = new ByteBuffer();
                response.p1(93);

                response.p1(0);
                response.ip2(this.windowMode == 1 ? 548 : 746); // fixed : resizable
                response.ip2(this.verifyId++);

                this.client.queue(response);
            }

            if (this.firstLoad) {
                // TODO: send chatbox/varps
            }

            if (this.firstLoad) {
                // TODO: send tabs/varps
            }

            this.firstLoad = false;
            this.loading = false;
            this.loaded = true;
        }

        // player info
        if (this.loaded) {
            let response = new ByteBuffer();
            let updateBlock = new ByteBuffer();

            response.p1(72);
            response.p2(0);
            let start = response.offset;

            this.processActivePlayers(response, updateBlock, true);
            this.processActivePlayers(response, updateBlock, false);
            this.processInactivePlayers(response, updateBlock, true);
            this.processInactivePlayers(response, updateBlock, false);
            response.pdata(updateBlock);

            response.psize2(response.offset - start);
            this.client.queue(response);
        }
    }

    processActivePlayers(buffer, updateBlock, nsn0) {
        buffer.accessBits();
        // TODO: this is supposed to loop, and "nsn0" is supposed to check against a player flag to skip
        if (nsn0) {
            let needsMaskUpdate = this.appearance == null;
            let needsUpdate = this.placement || needsMaskUpdate;

            buffer.pBit(1, needsUpdate ? 1 : 0);

            if (needsUpdate) {
                buffer.pBit(1, needsMaskUpdate ? 1 : 0);
                buffer.pBit(2, 0); // no further update

                // if (this.placement) {
                //     buffer.pBit(2, 3); // teleport
                //     buffer.pBit(1, 1); // full location update
                //     buffer.pBit(30, this.z | this.x << 14 | this.plane << 28);
                // }
            }

            if (needsMaskUpdate) {
                this.appendUpdateBlock(updateBlock);
            }
        }
        buffer.accessBytes();
    }

    processInactivePlayers(buffer, updateBlock, nsn2) {
        buffer.accessBits();
        // TODO: "nsn2" is supposed to check against a player flag to skip
        if (nsn2) {
            for (let i = 1; i < 2048; i++) {
                if (this.id == i) {
                    continue;
                }

                buffer.pBit(1, 0);
                buffer.pBit(2, 0);
            }
        }
        buffer.accessBytes();
    }

    generateAppearance() {
        let buffer = new ByteBuffer();

        buffer.p1(0); // flags
        buffer.p1(-1); // title-related
        buffer.p1(-1); // pkIcon
        buffer.p1(-1); // prayerIcon

        // for (let i = 0; i < 12; i++) {
        //     buffer.p1(0); // body
        // }

        // hat, cape, amulet, weapon, chest, shield, arms, legs, hair, wrists, hands, feet, beard
        let body = [ -1, -1, -1, -1, 18, -1, 26, 36, 0, 33, 42, 10 ];
        for (let i = 0; i < body.length; i++) {
            if (body[i] == -1) {
                buffer.p1(0);
            } else {
                buffer.p2(body[i] | 0x100);
            }
        }

        for (let i = 0; i < 5; i++) {
            buffer.p1(0); // color
        }

        buffer.p2(1426); // bas id
        buffer.pjstr(this.username);
        buffer.p1(3); // combat level
        buffer.p2(27); // total level
        buffer.p1(0); // sound radius

        this.appearance = new ByteBuffer();
        this.appearance.ipdata(buffer);
    }

    appendUpdateBlock(buffer) {
        let flags = 0;

        if (!this.appearance) {
            this.generateAppearance();
            flags |= 0x1;
        }

        buffer.p1(flags);

        if (flags & 0x1) {
            buffer.p1sub(this.appearance.length);
            buffer.pdata(this.appearance);
        }
    }

    processIn() {
        let decoded = this.client.decodeIn();

        for (let i = 0; i < decoded.length; i++) {
            const { id, data } = decoded[i];

            switch (id) {
                // case 78: { // MOVE_GAMECLICK
                //     let ctrlClick = data.g1(); // g1add
                //     let x = data.g2();
                //     let z = data.ig2();

                //     this.x = x;
                //     this.z = z;

                //     // if (ctrlClick) {
                //     //     this.placement = true;
                //     // }
                // } break;
                default: {
                    console.log('Unhandled packet', ClientProt[id] ?? id);
                    break;
                }
            }
        }
    }
}
