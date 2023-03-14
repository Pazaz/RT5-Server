import Player from '#engine/Player.js';
import { ByteBuffer } from '#util/ByteBuffer.js';
import ClientProt from '#util/ClientProt.js';
import { IsaacRandom } from '#util/IsaacRandom.js';
import { Js5ProtIn, Js5ProtOut } from '#util/Js5Prot.js';
import { getGroup } from '#util/OpenRS2.js';
import { fromBase37 } from '#util/StringUtils.js';
import TitleProt from '#util/TitleProt.js';
import { WlProtOut, WorldList, WorldListRaw, WorldListChecksum } from '#util/WorldList.js';

const ClientState = {
    CLOSED: -1,
    NEW: 0,
    JS5: 1,
    WL: 2,
    LOGIN: 3,
    GAME: 4
};

export default class Client {
    server = null;
    socket = null;
    state = ClientState.NEW;

    netOut = [];

    randomIn = null;
    randomOut = null;

    player = null;
    bufferStart = 0;
    bufferInOffset = 0;
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
            case TitleProt.JS5_OPEN: {
                let clientVersion = data.g4();

                if (clientVersion == 578) {
                    this.socket.write(Uint8Array.from([Js5ProtOut.SUCCESS]));
                    this.state = ClientState.JS5;
                } else {
                    this.socket.write(Uint8Array.from([Js5ProtOut.OUT_OF_DATE]));
                    this.socket.end();
                    this.state = ClientState.CLOSED;
                }
            } break;
            case TitleProt.WORLDLIST_FETCH: {
                let checksum = data.g4b();

                this.socket.write(Uint8Array.from([WlProtOut.SUCCESS]));
                this.state = ClientState.WL;

                let response = new ByteBuffer();
                response.p2(0);
                let start = response.offset;

                response.pbool(true); // encoding a world list update
                if (checksum != WorldListChecksum) {
                    response.pbool(true); // encoding all information about the world list (countries, size of list, etc.)
                    response.pdata(WorldListRaw);
                    response.p4(WorldListChecksum);
                } else {
                    response.pbool(false); // not encoding any world list information, just updating the player counts
                }

                let minId = WorldList.reduce((min, world) => Math.min(min, world.id), Infinity);
                for (let i = 0; i < WorldList.length; i++) {
                    let world = WorldList[i];
                    response.psmart(world.id - minId);
                    response.p2(world.players);
                }

                response.psize2(response.offset - start);
                this.socket.write(response.raw);
            } break;
            case TitleProt.WORLD_HANDSHAKE: { // login
                let response = new ByteBuffer();
                response.p1(0);
                response.p8(BigInt(Math.floor(Math.random() * 0xFFFF_FFFF)) << 32n | BigInt(Math.floor(Math.random() * 0xFFFF_FFFF)));

                this.socket.write(response.raw);
                this.state = ClientState.LOGIN;
            } break;
            case TitleProt.CREATE_LOG_PROGRESS: {
                let day = data.g1();
                let month = data.g1();
                let year = data.g2();
                let country = data.g2();

                this.socket.write(Uint8Array.from([2]));
            } break;
            case TitleProt.CREATE_CHECK_NAME: {
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
            case TitleProt.CREATE_ACCOUNT: {
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

                // 0 - unexpected response
                // 1 - could not display video ad
                // 2 - success
                // 3 - invalid username/password
                // 4 - account is banned
                // 5 - account is logged in
                // 6 - client out of date
                // 7 - world is full
                // 8 - login server offline
                // 9 - too many connections
                // 10 - bad session id
                // 11 - weak password
                // 12 - f2p account, p2p world
                // 13 - could not login
                // 14 - server is updating
                // 15 - reconnecting
                // 16 - too many login attempts
                // 17 - p2p area, f2p world
                // 18 - account locked
                // 19 - members beta
                // 20 - invalid login server
                // 21 - moving worlds
                // 22 - malformed login packet
                // 23 - no reply from login server
                // 24 - error loading profile
                // 26 - mac address banned
                // 27 - service unavailable
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
                case Js5ProtIn.REQUEST:
                case Js5ProtIn.PRIORITY_REQUEST: {
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

            let file = await getGroup(archive, group);

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
                if (type == Js5ProtIn.REQUEST) {
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
        if (opcode == TitleProt.WORLD_RECONNECT) {
            player.reconnecting = true;
        }
        player.windowMode = windowMode;
        player.username = username;
        this.player = player;
        this.bufferStart = this.player.id * 30000;

        let response = new ByteBuffer();
        response.p1(opcode == TitleProt.WORLD_RECONNECT ? 15 : 2);

        if (opcode == TitleProt.WORLD_CONNECT) {
            response.p1(0); // staff mod level
            response.p1(0); // player mod level
            response.pbool(false); // player underage
            response.pbool(false); // parentalChatConsent
            response.pbool(false); // parentalAdvertConsent
            response.pbool(false); // mapQuickChat
            response.p2(player.id); // selfId
            response.pbool(false); //MouseRecorder
            response.pbool(true); // mapMembers
        }

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

            if (length > 30000 - this.bufferInOffset) {
                throw new Error('Packet overflow for this tick');
            }

            if (this.packetCount[opcode] + 1 > 10) {
                offset += length;
                continue;
            }

            this.packetCount[opcode]++;

            let slice = data.slice(start, offset + length);
            offset += length;

            this.server.bufferIn.set(slice, this.bufferStart + this.bufferInOffset);
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
            let opcode = this.server.bufferIn[this.bufferStart + offset++];
            let length = ClientProt.Length[opcode];
            if (length == -1) {
                length = this.server.bufferIn[this.bufferStart + offset++];
            } else if (length == -2) {
                length = this.server.bufferIn[this.bufferStart + offset++] << 8 | this.server.bufferIn[this.bufferStart + offset++];
            }

            decoded.push({
                id: opcode,
                data: new ByteBuffer(this.server.bufferIn.slice(this.bufferStart + offset, this.bufferStart + offset + length))
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
            const untilNextFlush = 30000 - this.bufferOutOffset;

            if (remaining > untilNextFlush) {
                this.server.bufferOut.set(data.slice(offset, offset + untilNextFlush), this.bufferStart + this.bufferOutOffset);
                this.bufferOutOffset += untilNextFlush;
                this.flush();
                offset += untilNextFlush;
                remaining -= untilNextFlush;
            } else {
                this.server.bufferOut.set(data.slice(offset, offset + remaining), this.bufferStart + this.bufferOutOffset);
                this.bufferOutOffset += remaining;
                offset += remaining;
                remaining = 0;
            }
        }
    }

    flush() {
        if (this.bufferOutOffset) {
            this.socket.write(this.server.bufferOut.slice(this.bufferStart, this.bufferStart + this.bufferOutOffset));
            this.bufferOutOffset = 0;
        }
    }

    queue(data, encrypt = true) {
        if (data instanceof ByteBuffer) {
            data = data.raw;
        }

        this.netOut.push({ data, encrypt });
    }

    encodeOut() {
        for (let i = 0; i < this.netOut.length; i++) {
            let packet = this.netOut[i];

            if (this.randomOut && packet.encrypt) {
                packet.data[0] += this.randomOut.nextInt();
            }

            this.write(packet.data);
        }
    }
}
