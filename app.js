import net from 'net';
import fs from 'fs';

import axios from 'axios';

import { ByteBuffer } from '#util/ByteBuffer.js';
import { fromBase37, toBase37 } from '#util/StringUtils.js';
import { IsaacRandom } from '#util/IsaacRandom.js';

const OPENRS2_SCOPE = 'runescape';
const OPENRS2_ID = '259'; // links to rev 578, dated 2009-12-22
const OPENRS2_API = `https://archive.openrs2.org/caches/${OPENRS2_SCOPE}/${OPENRS2_ID}`;

if (!fs.existsSync('data/xteas.json')) {
    console.log('Downloading XTEAs...');
    axios.get(`${OPENRS2_API}/keys.json`).then((response) => {
        fs.writeFileSync('data/xteas.json', JSON.stringify(response.data));
    });
}

const XTEAS = JSON.parse(fs.readFileSync('data/xteas.json'));

function getXtea(x, z) {
    return XTEAS.find((xtea) => xtea.mapsquare == (x << 8 | z));
}

//#region Update Server

const JS5_IN = {
    // opcode
    OPEN: 15,

    // type
    REQUEST: 0,
    PRIORITY_REQUEST: 1,
    LOGGED_IN: 2,
    LOGGED_OUT: 3,
    ENCRYPTION: 4,
    INITIATING: 6,
    TERMINATE: 7,
}

const JS5_OUT = {
    // opcode
    SUCCESS: 0,
    RETRY: 5,
    OUT_OF_DATE: 6,
    FULL1: 7,
    FULL2: 9,
};

// #endregion

//#region World List Server

const COUNTRY_FLAG = {
    UNITED_STATES: 0, // fallback flag actually
    AUSTRIA: 15,
    AUSTRALIA: 16,
    GERMANY: 22,
    BRAZIL: 31,
    CANADA: 38,
    SWITZERLAND: 43,
    CHINA: 48,
    DENMARK: 58,
    FINLAND: 69,
    FRANCE: 74,
    UNITED_KINGDOM: 77,
    IRELAND: 101,
    INDIA: 103,
    MEXICO: 152,
    NETHERLANDS: 161,
    NORWAY: 162,
    NEW_ZEALAND: 166,
    PORTUGAL: 179,
    SWEDEN: 191
};

function toTitleCase(str) {
    return str.replace(
        /\w\S*/g,
        (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
}

let countries = [];
for (let i = 0; i < Object.keys(COUNTRY_FLAG).length; i++) {
    let name = Object.keys(COUNTRY_FLAG)[i]
    let displayName = toTitleCase(name.replace('_', ' ').toLowerCase());
    let flag = COUNTRY_FLAG[name];

    countries.push({
        flag,
        name: displayName
    });
}

let worlds = [];
for (let i = 0; i < 300; i++) {
    let id = i + 1;
    worlds.push(
        {
            id,
            hostname: 'localhost',
            port: 43594,
            country: Math.floor(Math.random() * countries.length),
            activity: Math.random() < 0.25 ? ('Example Activity for World ' + id) : '',
            members: Math.random() < 0.5,
            quickChat: Math.random() < 0.25,
            pvp: Math.random() < 0.25,
            lootShare: Math.random() < 0.5,
            highlight: Math.random() < 0.25,
            players: Math.random() * 2000
        }
    );
}

let worldList = new ByteBuffer();
let worldListChecksum = 0;

worldList.psmart(countries.length);
for (let i = 0; i < countries.length; i++) {
    let country = countries[i];
    worldList.psmart(country.flag);
    worldList.pjstr2(country.name);
}

let minId = worlds.reduce((min, world) => Math.min(min, world.id), Infinity);
let maxId = worlds.reduce((max, world) => Math.max(max, world.id), -Infinity);
let size = worlds.length;

worldList.psmart(minId);
worldList.psmart(maxId);
worldList.psmart(size);

for (let i = 0; i < worlds.length; i++) {
    let world = worlds[i];
    worldList.psmart(world.id - minId);
    worldList.p1(world.country);

    let flags = 0;

    if (world.members) {
        flags |= 0x1;
    }

    if (world.quickChat) {
        flags |= 0x2;
    }

    if (world.pvp) {
        // flags |= 0x4;
    }

    if (world.lootShare) {
        flags |= 0x8;
    }

    if (world.activity && world.highlight) {
        flags |= 0x10;
    }

    worldList.p4(flags);
    worldList.pjstr2(world.activity); // if there is no activity name, client will fallback to country flag + name
    worldList.pjstr2(world.hostname);
}

worldListChecksum = ByteBuffer.crc32(worldList);

const WL_IN = {
    // opcode
    OPEN: 23
};

const WL_OUT = {
    // opcode
    SUCCESS: 0,
    REJECT: 1
};

//#endregion

const ClientState = {
    CLOSED: -1,
    NEW: 0,
    JS5: 1,
    WL: 2,
    LOGIN: 3,
    GAME: 4
};

const ClientProt = {
    Length: []
};

for (let i = 0; i < 256; i++) {
    ClientProt.Length[i] = 0;
}

ClientProt.Length[0] = 2;
ClientProt.Length[1] = -1;
ClientProt.Length[2] = 8;
ClientProt.Length[3] = 7;
ClientProt.Length[4] = 8;
ClientProt.Length[5] = 7;
ClientProt.Length[6] = 15;
ClientProt.Length[7] = 4;
ClientProt.Length[8] = 6;
ClientProt.Length[9] = 15;
ClientProt.Length[10] = 8;
ClientProt.Length[11] = 16;
ClientProt.Length[12] = 8;
ClientProt.Length[13] = 16;
ClientProt.Length[14] = 8;
ClientProt.Length[15] = -1;
ClientProt.Length[16] = -1;
ClientProt.Length[17] = 8;
ClientProt.Length[18] = -1;
ClientProt.Length[19] = -1;
ClientProt.Length[20] = 4;
ClientProt.Length[21] = 6;
ClientProt.Length[22] = 7;
ClientProt.Length[23] = -1;
ClientProt.Length[24] = -1;
ClientProt.Length[25] = 2;
ClientProt.Length[26] = 7;
ClientProt.Length[27] = 3;
ClientProt.Length[28] = 3;
ClientProt.Length[29] = -1;
ClientProt.Length[30] = -1;
ClientProt.Length[31] = 3;
ClientProt.Length[32] = 3;
ClientProt.Length[33] = 4;
ClientProt.Length[34] = -1;
ClientProt.Length[35] = 3;
ClientProt.Length[36] = 3;
ClientProt.Length[37] = 6;
ClientProt.Length[38] = 4;
ClientProt.Length[39] = 3;
ClientProt.Length[40] = 7;
ClientProt.Length[41] = 3;
ClientProt.Length[42] = -1;
ClientProt.Length[43] = 8;
ClientProt.Length[44] = 1;
ClientProt.Length[45] = 3;
ClientProt.Length[46] = 2;
ClientProt.Length[47] = 7;
ClientProt.Length[48] = 11;
ClientProt.Length[49] = -1;
ClientProt.Length[50] = 3;
ClientProt.Length[51] = 0;
ClientProt.Length[52] = 12;
ClientProt.Length[53] = -1;
ClientProt.Length[54] = 8;
ClientProt.Length[55] = 0;
ClientProt.Length[56] = -1;
ClientProt.Length[57] = 8;
ClientProt.Length[58] = 2;
ClientProt.Length[59] = 18;
ClientProt.Length[60] = -1;
ClientProt.Length[61] = -1;
ClientProt.Length[62] = 3;
ClientProt.Length[63] = 8;
ClientProt.Length[64] = -1;
ClientProt.Length[65] = 4;
ClientProt.Length[66] = 2;
ClientProt.Length[67] = 4;
ClientProt.Length[68] = 3;
ClientProt.Length[69] = 3;
ClientProt.Length[70] = 3;
ClientProt.Length[71] = 0;
ClientProt.Length[72] = 7;
ClientProt.Length[73] = 7;
ClientProt.Length[74] = -1;
ClientProt.Length[75] = 11;
ClientProt.Length[76] = -1;
ClientProt.Length[77] = -1;
ClientProt.Length[78] = 5;
ClientProt.Length[79] = 7;
ClientProt.Length[80] = 7;
ClientProt.Length[81] = 2;

class Client {
    server = null;
    socket = null;
    state = ClientState.NEW;

    netOut = [];

    randomIn = null;
    randomOut = null;

    bufferIn = new Uint8Array(30000);
    bufferInOffset = 0;

    bufferOut = new Uint8Array(30000);
    bufferOutOffset = 0;

    packetCount = new Uint8Array(256);

    constructor(server, socket) {
        this.server = server;
        this.socket = socket;
        this.socket.on('data', (data) => {
            this.#handleData(new ByteBuffer(data));
        });
    }

    #handleData(data) {
        try {
            switch (this.state) {
                case ClientState.CLOSED:
                    this.socket.end();
                    break;
                case ClientState.NEW:
                    this.#handleNew(data);
                    break;
                case ClientState.JS5:
                    this.#handleJs5(data);
                    break;
                case ClientState.WL:
                    this.#handleWl(data);
                    break;
                case ClientState.LOGIN:
                    this.#handleLogin(data);
                    break;
                case ClientState.GAME:
                    this.#handleGame(data);
                    break;
            }
        } catch (err) {
            console.error(err);
            this.socket.end();
            this.state = ClientState.CLOSED;
        }
    }

    #handleNew(data) {
        let opcode = data.g1();

        switch (opcode) {
            case JS5_IN.OPEN: {
                let clientVersion = data.g4();

                if (clientVersion == 578) {
                    this.socket.write(Uint8Array.from([JS5_OUT.SUCCESS]));
                    this.state = ClientState.JS5;
                } else {
                    this.socket.write(Uint8Array.from([JS5_OUT.OUT_OF_DATE]));
                    this.socket.end();
                    this.state = ClientState.CLOSED;
                }
            } break;
            case WL_IN.OPEN: {
                let checksum = data.g4b();

                this.socket.write(Uint8Array.from([WL_OUT.SUCCESS]));
                this.state = ClientState.WL;

                let response = new ByteBuffer();
                response.p2(0);
                let start = response.offset;

                response.pbool(true); // encoding a world list update
                if (checksum != worldListChecksum) {
                    response.pbool(true); // encoding all information about the world list (countries, size of list, etc.)
                    response.pdata(worldList);
                    response.p4(worldListChecksum);
                } else {
                    response.pbool(false); // not encoding any world list information, just updating the player counts
                }

                for (let i = 0; i < worlds.length; i++) {
                    let world = worlds[i];
                    response.psmart(world.id - minId);
                    response.p2(world.players);
                }

                response.psize2(response.offset - start);
                this.socket.write(response.raw);
            } break;
            case 14: { // login
                let response = new ByteBuffer();
                response.p1(0);
                response.p8(BigInt(Math.floor(Math.random() * 0xFFFF_FFFF)) << 32n | BigInt(Math.floor(Math.random() * 0xFFFF_FFFF)));

                this.socket.write(response.raw);
                this.state = ClientState.LOGIN;
            } break;
            case 20: { // registration step 1 (birthdate and country)
                let day = data.g1();
                let month = data.g1();
                let year = data.g2();
                let country = data.g2();

                this.socket.write(Uint8Array.from([2]));
            } break;
            case 21: { // validate username
                let username = fromBase37(data.g8());

                // success:
                this.socket.write(Uint8Array.from([2]));

                // suggested names:
                // let response = new ByteBuffer();
                // response.p1(21);

                // let names = ['test', 'test2'];
                // response.p1(names.length);
                // for (let i = 0; i < names.length; i++) {
                //     response.p8(toBase37(names[i]));
                // }

                // this.socket.write(response.raw);
            } break;
            case 22: { // registration step 2 (email)
                let length = data.g2();
                data = data.gdata(length);

                let revision = data.g2();
                let decrypted = data.rsadec();
                let rsaMagic = decrypted.g1();
                if (rsaMagic != 10) {
                    // TODO: read failure
                }

                let key = [];
                let optIn = decrypted.g2();
                let username = fromBase37(decrypted.g8());
                key.push(decrypted.g4());
                let password = decrypted.gjstr();
                key.push(decrypted.g4());
                let affiliate = decrypted.g2();
                let day = decrypted.g1();
                let month = decrypted.g1();
                key.push(decrypted.g4());
                let year = decrypted.g2();
                let country = decrypted.g2();
                key.push(decrypted.g4());

                let extra = data.gdata();
                extra.tinydec(key, extra.length);
                let email = extra.gjstr();

                this.socket.write(Uint8Array.from([2]));
            } break;
            default:
                console.log('Unknown opcode', opcode, data.raw);
                this.state = -1;
                break;
        }
    }

    #handleJs5(data) {
        let queue = [];

        while (data.available > 0) {
            let type = data.g1();

            switch (type) {
                case JS5_IN.REQUEST:
                case JS5_IN.PRIORITY_REQUEST: {
                    let archive = data.g1();
                    let group = data.g2();

                    queue.push({ type, archive, group });
                } break;
                default:
                    data.seek(3);
                    break;
            }
        }

        // TODO: move this out of the network handler and into a dedicated Js5 queue loop (for all requests)
        queue.forEach(async (request) => {
            const { type, archive, group } = request;

            if (!fs.existsSync(`data/cache/${archive}`)) {
                fs.mkdirSync(`data/cache/${archive}`, { recursive: true });
            }

            let file;
            if (!fs.existsSync(`data/cache/${archive}/${group}.dat`)) {
                file = await axios.get(`${OPENRS2_API}/archives/${archive}/groups/${group}.dat`, { responseType: 'arraybuffer' });
                file = new Uint8Array(file.data);
                fs.writeFileSync(`data/cache/${archive}/${group}.dat`, file);
            } else {
                file = fs.readFileSync(`data/cache/${archive}/${group}.dat`);
            }

            if (archive == 255 && group == 255) {
                // checksum table for all archives
                let response = new ByteBuffer();
                response.p1(archive);
                response.p2(group);
                response.pdata(file);
                this.socket.write(response.raw);
            } else {
                let compression = file[0];
                let length = file[1] << 24 | file[2] << 16 | file[3] << 8 | file[4];
                let realLength = compression != 0 ? length + 4 : length;

                let settings = compression;
                if (type == JS5_IN.REQUEST) {
                    settings |= 0x80;
                }

                let response = ByteBuffer.alloc(8 + realLength + Math.floor(file.length / 512));
                response.p1(archive);
                response.p2(group);
                response.p1(settings);
                response.p4(length);

                for (let i = 5; i < realLength + 5; i++) {
                    if ((response.offset % 512) == 0) {
                        response.p1(0xFF);
                    }

                    response.p1(file[i]);
                }

                this.socket.write(response.raw);
            }
        });
    }

    #handleWl(data) {
        // no communication
    }

    #handleLogin(data) {
        let opcode = data.g1();

        let length = data.g2();
        data = data.gdata(length);

        let revision = data.g4();
        let byte1 = data.g1();
        let windowMode = data.g1();
        let canvasWidth = data.g2();
        let canvasHeight = data.g2();
        let prefInt = data.g1();
        let uid = data.gdata(24);
        let settings = data.gjstr();
        let affiliate = data.g4();
        let preferences = data.gdata(data.g1());
        let verifyId = data.g2();
        let checksums = [];
        for (let i = 0; i < 29; i++) {
            checksums.push(data.g4());
        }

        let decrypted = data.rsadec();
        let rsaMagic = decrypted.g1();
        let key = [];
        for (let i = 0; i < 4; i++) {
            key.push(decrypted.g4());
        }
        let username = fromBase37(decrypted.g8());
        let password = decrypted.gjstr();

        this.randomIn = new IsaacRandom(key);
        for (let i = 0; i < 4; i++) {
            key[i] += 50;
        }
        this.randomOut = new IsaacRandom(key);

        let player = new Player(this);
        player.id = 1;
        player.windowMode = windowMode;
        player.username = username;

        let response = new ByteBuffer();
        response.p1(2); // success

        response.p1(0); // staff mod level
        response.p1(0); // player mod level
        response.pbool(false); // player underage
        response.pbool(false); // parentalChatConsent
        response.pbool(false); // parentalAdvertConsent
        response.pbool(false); // mapQuickChat
        response.p2(player.id); // selfId
        response.pbool(false); //MouseRecorder
        response.pbool(true); // mapMembers

        this.socket.write(response.raw);
        this.state = ClientState.GAME;

        this.server.world.addPlayer(player);
    }

    #handleGame(data) {
        if (data instanceof ByteBuffer) {
            data = data.raw;
        }

        let offset = 0;
        while (offset < data.length) {
            let start = offset;

            if (this.randomIn) {
                data[offset] -= this.randomIn.nextInt();
            }

            let opcode = data[offset++];
            let length = ClientProt.Length[opcode];
            
            if (length == -1) {
                length = data[offset++];
            } else if (length == -2) {
                length = data[offset++] << 8 | data[offset++];
            }

            if (length > this.bufferIn.length - this.bufferInOffset) {
                throw new Error('Packet overflow');
            }

            if (this.packetCount[opcode] + 1 > 10) {
                offset += length;
                continue;
            }

            this.packetCount[opcode]++;

            let slice = data.slice(start, offset + length);
            offset += length;

            this.bufferIn.set(slice, this.bufferInOffset);
            this.bufferInOffset += slice.length;
        }
    }

    resetIn() {
        this.bufferInOffset = 0;
        this.packetCount.fill(0);
    }

    decodeIn() {
        let offset = 0;

        let decoded = [];
        while (offset < this.bufferInOffset) {
            let opcode = this.bufferIn[offset++];
            let length = ClientProt.Length[opcode];
            if (length == -1) {
                length = this.bufferIn[offset++];
            } else if (length == -2) {
                length = this.bufferIn[offset++] << 8 | this.bufferIn[offset++];
            }

            decoded.push({
                id: opcode,
                data: new ByteBuffer(this.bufferIn.slice(offset, offset + length))
            });

            offset += length;
        }

        return decoded;
    }

    write(data) {
        if (data instanceof ByteBuffer) {
            data = data.raw;
        }

        let offset = 0;
        let remaining = data.length;

        // pack as much data as we can into a single chunk, then flush and repeat
        while (remaining > 0) {
            const untilNextFlush = this.bufferOut.length - this.bufferOutOffset;

            if (remaining > untilNextFlush) {
                this.bufferOut.set(data.slice(offset, offset + untilNextFlush), this.bufferOutOffset);
                this.bufferOutOffset += untilNextFlush;
                this.flush();
                offset += untilNextFlush;
                remaining -= untilNextFlush;
            } else {
                this.bufferOut.set(data.slice(offset, offset + remaining), this.bufferOutOffset);
                this.bufferOutOffset += remaining;
                offset += remaining;
                remaining = 0;
            }
        }
    }

    flush() {
        if (this.bufferOutOffset) {
            this.socket.write(this.bufferOut.slice(0, this.bufferOutOffset));
            this.bufferOutOffset = 0;
        }
    }

    queue(data) {
        if (data instanceof ByteBuffer) {
            data = data.raw;
        }

        this.netOut.push(data);
    }

    encodeOut() {
        for (let i = 0; i < this.netOut.length; i++) {
            let packet = this.netOut[i];

            if (this.randomOut) {
                packet[0] += this.randomOut.nextInt();
            }

            this.write(packet);
        }
    }
}

class Player {
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
                case 78: { // MOVE_GAMECLICK
                    let ctrlClick = data.g1(); // g1add
                    let x = data.g2();
                    let z = data.ig2();

                    this.x = x;
                    this.z = z;

                    // if (ctrlClick) {
                    //     this.placement = true;
                    // }
                } break;
                default: {
                    console.log('Unhandled packet', id, data.length, ClientProt.Length[id]);
                    break;
                }
            }
        }
    }
}

class World {
    constructor() {
        this.players = [];

        this.tick();
    }

    addPlayer(player) {
        this.players.push(player);
    }

    removePlayer(client) {
        this.players.splice(this.players.findIndex(p => p.client == client), 1);
    }

    tick() {
        // console.time('tick');
        let start = Date.now();
        // read packets
        this.players.forEach(p => {
            p.processIn();
        });
        // npc processing
        // player processing
        this.players.forEach(p => p.tick());
        // game tasks
        // flushing packets
        this.players.forEach(p => {
            if (p.client.netOut.length) {
                p.client.encodeOut();
                p.client.netOut = [];
            }

            p.client.flush();
            p.client.resetIn();

            p.placement = false;
        });
        // npc aggro etc
        let end = Date.now();
        // console.timeEnd('tick');

        let delta = 600 - (end - start);
        setTimeout(() => this.tick(), delta);
    }
}

class Server {
    clients = [];
    world = new World();

    constructor() {
        this.server = net.createServer((socket) => {
            socket.setNoDelay(true);
            socket.setTimeout(30000);

            console.log('Connection from', socket.remoteAddress + ':' + socket.remotePort);
            let client = new Client(this, socket);
            this.clients.push(client);

            socket.on('end', () => {
                console.log('Disconnected from', socket.remoteAddress + ':' + socket.remotePort);
                this.world.removePlayer(client);
                this.clients.splice(this.clients.findIndex(c => c.socket == socket), 1);
            });

            socket.on('timeout', () => {
                socket.end();
            });

            socket.on('error', (err) => {
                socket.destroy();
            });
        });
    }

    listen(port) {
        this.server.listen(port, () => {
            console.log('Server listening on port ' + port);
        });
    }

    tick() {
    }
}

let server = new Server();
server.listen(40001);
