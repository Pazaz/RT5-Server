export default class World {
    constructor() {
        this.players = [];

        // the client index starts at 1
        for (let i = 0; i < 2047; i++) {
            this.players[i] = null;
        }

        this.tick();
    }

    registerPlayer(player) {
        player.id = this.players.indexOf(null) + 1;
    }

    addPlayer(player) {
        player.world = this;
        this.players[player.id - 1] = player;
    }

    removePlayer(client) {
        this.players[client.player.id - 1] = null;
    }

    tick() {
        // console.time('tick');
        let start = Date.now();
        // read packets
        this.players.forEach(p => {
            if (!p) {
                return;
            }

            p.processIn();
        });
        // npc processing
        // player processing
        this.players.forEach(p => {
            if (!p) {
                return;
            }

            p.tick()
        });
        // game tasks
        // flushing packets
        this.players.forEach(p => {
            if (!p) {
                return;
            }

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
