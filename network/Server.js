import net from 'net';

import World from '#engine/World.js';
import Client from '#network/Client.js';

export default class Server {
    clients = [];
    world = new World();

    bufferIn = new Uint8Array(2048 * 30000); // pre-allocate 61MB for incoming packets, reduces GC pressure
    bufferOut = new Uint8Array(2048 * 30000); // pre-allocate 61MB for outgoing packets, reduces GC pressure

    constructor() {
        this.server = net.createServer((socket) => {
            socket.setNoDelay(true);
            socket.setTimeout(30000);

            console.log('Connection from', socket.remoteAddress + ':' + socket.remotePort);
            let client = new Client(this, socket);
            this.clients.push(client);

            socket.on('end', () => {
                console.log('Disconnected from', socket.remoteAddress + ':' + socket.remotePort);

                let index = this.clients.findIndex(c => c.socket == socket);
                if (index != -1) {
                    this.world.removePlayer(client);
                    this.clients.splice(index, 1);
                }
            });

            socket.on('timeout', () => {
                console.log('Timeout from', socket.remoteAddress + ':' + socket.remotePort);
                socket.destroy();

                let index = this.clients.findIndex(c => c.socket == socket);
                if (index != -1) {
                    this.world.removePlayer(client);
                    this.clients.splice(index, 1);
                }
            });

            socket.on('error', (err) => {
                console.log('Disconnected from', socket.remoteAddress + ':' + socket.remotePort + ' (error)');
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
