const ClientProt = {
    Length: [],

    EVENT_CAMERA_POSITION: 7,
    WINDOW_STATUS: 8, // todo: confirm
    CLICKWORLDMAP: 12, // todo: confirm
    SOUND_SONGEND: 20,
    EVENT_KEYBOARD: 23,
    TRANSMITVAR_VERIFYID: 25, // todo: confirm
    EVENT_FRAME_MAP_LOADED: 33, // not an official name
    EVENT_MOUSE_CLICK: 37,
    EVENT_APPLET_FOCUS: 44,
    MAP_BUILD_COMPLETE: 55, // todo: confirm
    MOVE_MINIMAPCLICK: 59,
    MESSAGE_PUBLIC: 60,
    EVENT_MOUSE_MOVE: 61,
    GET_EXAMINE: 66, // not an official name
    NO_TIMEOUT: 71,
    OPLOC1: 73,
    CLIENT_CHEAT: 76,
    MOVE_GAMECLICK: 78,
    IDLE_TIMER: 81, // not an official name
};

// reverse-lookup
for (let i = 1; i < Object.keys(ClientProt).length; i++) {
    ClientProt[Object.values(ClientProt)[i]] = Object.keys(ClientProt)[i];
}

for (let i = 0; i < 128; i++) {
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
ClientProt.Length[81] = 2;;

export default ClientProt;
