'use strict';

import WebSocket from 'ws13';
import http from 'node:http';
import fs from 'node:fs';
import { pipeline } from 'node:stream';

var server = new http.createServer(),
    wsList = [];

server.on('upgrade', function upgrade(request, socket) {

    // creates WebSocket
    var websocket = WebSocket({
        isDebug: true,
        request,
        //protocol = '',
        origin: 'http://localhost',
        //heartbeatInterval_ms = 30000, /*in milliseconds*/
        /*extension: null*/
    });

    // has WebSocket, the handshake is done
    if (websocket) {

        // inserts a WebSocket from the list
        wsList.push(websocket);

        // add listeners
        websocket
            .on('error', console.error)
            .on('open', () => {

                /* now you can send and receive messages */
            })
            .on('message', (event) => {

                // send to everyone
                wsList.forEach(function (socket) {

                    socket.send(`ws-${wsList.indexOf(websocket)}: ${event.data}`);
                });
            })
            .on('close', function (event) {

                // removing an WebSocket from list 
                wsList = wsList.filter(ws => ws !== websocket);
            });
    }
    // handshake not accepted
    else { socket.end(); }

});
server.on('request', function (req, res) {

    if (req.url === '/') {
        console.log(process.cwd());
        var raw = fs.createReadStream('./index.html');
        res.writeHead(200, { 'Content-Type': 'text/html;charset=UTF-8' });
        pipeline(raw, res, function (err) { res.end(err + ''); });

        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});
server.on('error', console.error);
server.listen(80, '0.0.0.0');