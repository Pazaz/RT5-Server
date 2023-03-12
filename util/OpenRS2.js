import fs from 'fs';

import axios from 'axios';

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

export function getXtea(x, z) {
    return XTEAS.find((xtea) => xtea.mapsquare == (x << 8 | z));
}

export async function getGroup(archive, group) {
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

    return file;
}