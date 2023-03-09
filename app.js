import { ByteBuffer } from '#util/ByteBuffer.js';
import axios from 'axios';
import net from 'net';
import fs from 'fs';

const OPENRS2_SCOPE = 'runescape';
const OPENRS2_ID = '259'; // links to rev 578, dated 2009-12-22
const OPENRS2_API = `https://archive.openrs2.org/caches/${OPENRS2_SCOPE}/${OPENRS2_ID}`;

// Update Server

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

// World List Server

const countries = [
    {
        flag: 0,
        name: 'Anywhere'
    },
    {
        flag: 1,
        name: 'United States'
    }
];

const worlds = [
    {
        id: 1,
        hostname: 'localhost',
        port: 43594,
        country: 1,
        activity: 'Example World',
        members: true,
        quickChat: false,
        pvp: false,
        lootShare: true,
        players: 0
    }
];

let worldList = new ByteBuffer();
let worldListChecksum = 0;

worldList.psmart(countries.length);
for (let i = 0; i < countries.length; i++) {
    let country = countries[i];
    worldList.p1(country.flag);
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
        flags |= 0x4;
    }

    if (world.lootShare) {
        flags |= 0x8;
    }

    worldList.p4(flags);
    worldList.pjstr2(world.activity);
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

// ----

class Server {
    constructor() {
        this.server = net.createServer((socket) => {
            console.log('Connection from', socket.remoteAddress + ':' + socket.remotePort);

            socket.on('data', async (data) => {
                try {
                    data = new ByteBuffer(data);

                    if (!socket.state && socket.state != -1) {
                        let opcode = data.g1();

                        switch (opcode) {
                            case JS5_IN.OPEN: {
                                let clientVersion = data.g4();

                                if (clientVersion == 578) {
                                    socket.write(Uint8Array.from([JS5_OUT.SUCCESS]));
                                    socket.state = 1;
                                } else {
                                    socket.write(Uint8Array.from([JS5_OUT.OUT_OF_DATE]));
                                    socket.end();
                                }
                            } break;
                            case WL_IN.OPEN: {
                                let checksum = data.g4b();

                                socket.write(Uint8Array.from([WL_OUT.SUCCESS]));
                                socket.state = 2;

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
                                socket.write(response.raw);
                            } break;
                            default:
                                console.log('Unknown opcode', opcode, data.raw);
                                socket.state = -1;
                                break;
                        }
                    } else if (socket.state == 1) {
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
                                socket.write(response.raw);
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

                                socket.write(response.raw);
                            }
                        });
                    } else if (socket.state == 2) {
                        console.log('Received', data.raw);
                    } else {
                        socket.end();
                    }
                } catch (err) {
                    console.log(err);
                    socket.end();
                }
            });

            socket.on('end', () => {
                console.log('Disconnected from', socket.remoteAddress + ':' + socket.remotePort);
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
}

let server = new Server();
server.listen(43595);
