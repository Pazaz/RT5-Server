import net from 'net';

import World from '#engine/World.js';
import Client from '#network/Client.js';

export default class Server {
    clients = [];
    world = new World();

    constructor() {
        this.server = net.createServer((socket) => {
            socket.setNoDelay(true);
            socket.setTimeout(30000);

            console.log('Connection from', socket.remoteAddress + ':' + socket.remotePort);
            let client = new Client(this, socket);
            this.clients.push(client);

            socket.on('error', (err) => {
                console.log(err);
            });

            socket.on('end', () => {
                console.log('Disconnected from', socket.remoteAddress + ':' + socket.remotePort);

                let index = this.clients.findIndex(c => c.socket == socket);
                if (index != -1) {
                    this.world.removePlayer(client);
                    this.clients.splice(index, 1);
                }
            });

            socket.on('timeout', () => {
                socket.destroy();

                let index = this.clients.findIndex(c => c.socket == socket);
                if (index != -1) {
                    this.world.removePlayer(client);
                    this.clients.splice(index, 1);
                }
            });

            socket.on('error', (err) => {
                socket.destroy();

                let index = this.clients.findIndex(c => c.socket == socket);
                if (index != -1) {
                    this.world.removePlayer(client);
                    this.clients.splice(index, 1);
                }
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
