import { ByteBuffer } from '#util/ByteBuffer.js';

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

let WorldList = [];
for (let i = 0; i < 300; i++) {
    let id = i + 1;
    WorldList.push(
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

let WorldListRaw = new ByteBuffer();
let WorldListChecksum = 0;

WorldListRaw.psmart(countries.length);
for (let i = 0; i < countries.length; i++) {
    let country = countries[i];
    WorldListRaw.psmart(country.flag);
    WorldListRaw.pjstr2(country.name);
}

let minId = WorldList.reduce((min, world) => Math.min(min, world.id), Infinity);
let maxId = WorldList.reduce((max, world) => Math.max(max, world.id), -Infinity);
let size = WorldList.length;

WorldListRaw.psmart(minId);
WorldListRaw.psmart(maxId);
WorldListRaw.psmart(size);

for (let i = 0; i < WorldList.length; i++) {
    let world = WorldList[i];
    WorldListRaw.psmart(world.id - minId);
    WorldListRaw.p1(world.country);

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

    WorldListRaw.p4(flags);
    WorldListRaw.pjstr2(world.activity); // if there is no activity name, client will fallback to country flag + name
    WorldListRaw.pjstr2(world.hostname);
}

WorldListChecksum = ByteBuffer.crc32(WorldListRaw);

export const WlProtOut = {
    SUCCESS: 0,
    REJECT: 1
};

export { WorldList, WorldListRaw, WorldListChecksum };
