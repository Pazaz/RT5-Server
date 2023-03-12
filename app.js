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

class Client {
    server = null;
    socket = null;
    state = ClientState.NEW;
    randomIn = null;
    randomOut = null;

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
        // console.log(data.raw);
    }
}

class Player {
    client = null;

    firstLoad = true;
    loaded = false;
    loading = false;
    appearance = null;
    updated = false;
    verifyId = 1;

    id = 1;
    username = '';
    windowMode = 0;

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
                response.p1isaac(98, this.client.randomOut);
                response.p2(0);
                let start = response.offset;

                //

                response.accessBits();
                response.pBit(30, this.z | this.x << 14 | this.plane << 28);
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
                this.client.socket.write(response.raw);
            }

            if (this.firstLoad) {
                // send game frame
                let response = new ByteBuffer();
                response.p1isaac(93, this.client.randomOut);

                response.p1(0);
                response.ip2(this.windowMode == 1 ? 548 : 746); // fixed : resizable
                response.ip2(this.verifyId++);

                this.client.socket.write(response.raw);
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

        if (this.loaded) {
            let response = new ByteBuffer();
            let updateBlock = new ByteBuffer();

            response.p1isaac(72, this.client.randomOut);
            response.p2(0);
            let start = response.offset;

            this.processActivePlayers(response, updateBlock, true);
            this.processActivePlayers(response, updateBlock, false);
            this.processInactivePlayers(response, updateBlock, true);
            this.processInactivePlayers(response, updateBlock, false);
            response.pdata(updateBlock);

            response.psize2(response.offset - start);
            this.client.socket.write(response.raw);
        }
    }

    processActivePlayers(buffer, updateBlock, nsn0) {
        buffer.accessBits();
        // TODO: this is supposed to loop, and "nsn0" is supposed to check against a player flag to skip
        if (nsn0) {
            let needsMaskUpdate = this.appearance == null;
            let needsUpdate = this.updated || needsMaskUpdate;

            buffer.pBit(1, needsUpdate ? 1 : 0);

            if (needsUpdate) {
                buffer.pBit(1, needsMaskUpdate ? 1 : 0);

                buffer.pBit(2, 0); // no further update

                // buffer.pBit(2, 3); // teleport
                // buffer.pBit(1, 1); // full location update
                // buffer.pBit(30, this.z | this.x << 14 | this.plane << 28);
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
        buffer.p1(1); // title-related
        buffer.p1(0); // pkIcon
        buffer.p1(0); // prayerIcon

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
        // read packets
        // npc processing
        // player processing
        this.players.forEach(p => p.tick());
        // game tasks
        // flushing packets
        // npc aggro etc

        setTimeout(() => this.tick(), 600);
    }
}

class Server {
    clients = [];
    world = new World();

    constructor() {
        this.server = net.createServer((socket) => {
            console.log('Connection from', socket.remoteAddress + ':' + socket.remotePort);
            let client = new Client(this, socket);
            this.clients.push(client);

            socket.on('end', () => {
                console.log('Disconnected from', socket.remoteAddress + ':' + socket.remotePort);
                this.world.removePlayer(client);
                this.clients.splice(this.clients.findIndex(c => c.socket == socket), 1);
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
