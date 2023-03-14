import { ByteBuffer } from '#util/ByteBuffer.js';
import ClientProt from '#util/ClientProt.js';
import { getXtea } from '#util/OpenRS2.js';
import Position from '#util/Position.js';

export default class Player {
    client = null;

    firstLoad = true;
    reconnecting = false;
    loaded = false;
    loading = false;
    appearance = null;
    placement = false;
    verifyId = 1;

    id = 1;
    username = '';
    windowMode = 0;

    lastPos = new Position(0, 0, 0);

    // make-over mage: 2925, 3323, 0
    // varrock square: 3213, 3443
    pos = new Position(3213, 3433, 0);

    constructor(client) {
        this.client = client;
    }

    tick() {
        if (!this.loaded && !this.loading) {
            this.loading = true;

            if (this.reconnecting) {
                let response = new ByteBuffer();
                response.p2(0);
                let start = response.offset;

                // INIT_GPI

                response.accessBits();
                response.pBit(30, this.pos.highRes);
                this.lastPos.clone(this.pos);

                for (let i = 1; i < 2048; i++) {
                    if (this.id == i) {
                        continue;
                    }

                    response.pBit(18, 0);
                }
                response.accessBytes();

                response.psize2(response.offset - start);
                this.client.queue(response, false);
            } else if (this.firstLoad) {
                let response = new ByteBuffer();
                response.p1(98);
                response.p2(0);
                let start = response.offset;

                // INIT_GPI

                response.accessBits();
                response.pBit(30, this.pos.highRes);
                this.lastPos.clone(this.pos);

                for (let i = 1; i < 2048; i++) {
                    if (this.id == i) {
                        continue;
                    }

                    response.pBit(18, 0);
                }
                response.accessBytes();

                // REBUILD_NORMAL

                response.ip2(this.pos.zoneX);
                response.p2(this.pos.zoneZ);
                response.p1(this.pos.baIndex);
                response.p1neg(0);

                for (let mapsquareX = (this.pos.zoneX - (this.pos.baSizeX >> 4)) >> 3; mapsquareX <= (this.pos.zoneX + (this.pos.baSizeX >> 4)) >> 3; mapsquareX++) {
                    for (let mapsquareZ = (this.pos.zoneZ - (this.pos.baSizeZ >> 4)) >> 3; mapsquareZ <= (this.pos.zoneZ + (this.pos.baSizeZ >> 4)) >> 3; mapsquareZ++) {
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
                this.openGameFrame(this.isClientResizable() ? 746 : 548); // fixed : resizable
                this.openChatbox(752);
                
                this.openTab(0, 884);
                this.openTab(1, 320);
                this.openTab(2, 190);
                this.openTab(3, 259);
                this.openTab(4, 149);
                this.openTab(5, 387);
                this.openTab(6, 271);
                this.openTab(7, 192);
                this.openTab(8, 891);
                this.openTab(9, 550);
                this.openTab(10, 551);
                this.openTab(11, 589);
                this.openTab(12, 261);
                this.openTab(13, 464);
                this.openTab(14, 187);
                this.openTab(15, 34);
                this.openTab(16, 182);
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

    isClientResizable() {
        // 1 = fixed, 2 = resizable, 3 = fullscreen
        return this.windowMode > 1;
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
                //     buffer.pBit(30, this.pos.z | this.pos.x << 14 | this.pos.plane << 28);
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

                //     this.pos.x = x;
                //     this.pos.z = z;

                //     // if (ctrlClick) {
                //     //     this.placement = true;
                //     // }
                // } break;
                case ClientProt.CLIENT_CHEAT: {
                    let tele = data.g1();
                    let cmd = data.gjstr().toLowerCase();
                    let args = cmd.split(' ');
                    cmd = args.shift();

                    if (cmd == 'logout') {
                        this.logout();
                    }
                } break;
                default: {
                    console.log('Unhandled packet', ClientProt[id] ?? id);
                    break;
                }
            }
        }
    }

    // ---- events

    openChatbox(interfaceId) {
        if (interfaceId == 752) {
            this.openInterface(this.isClientResizable() ? 746 : 548, this.isClientResizable() ? 15 : 20, 751, 3);
            this.openInterface(this.isClientResizable() ? 746 : 548, this.isClientResizable() ? 18 : 142, 752, 3);

            if (this.isClientResizable()) {
                this.openInterface(752, 9, 137, 3);
            }
        }
    }

    openTab(tabId, interfaceId) {
        this.openInterface(this.isClientResizable() ? 746 : 548, (this.isClientResizable() ? 33 : 152) + tabId, interfaceId, 3);
    }

    // ---- encoders

    logout() {
        let response = new ByteBuffer();
        response.p1(58);
        this.client.queue(response);
    }

    openGameFrame(interfaceId) {
        let response = new ByteBuffer();
        response.p1(93);

        response.p1(0);
        response.ip2(interfaceId);
        response.ip2(this.verifyId++);

        this.client.queue(response);
    }

    openInterface(windowId, componentId, interfaceId, flags) {
        let response = new ByteBuffer();
        response.p1(52);

        response.p2add(this.verifyId++);
        response.p1sub(flags);
        response.ip2(componentId);
        response.ip2(windowId);
        response.p2(interfaceId);

        this.client.queue(response);
    }
}
