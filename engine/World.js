export default class World {
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
