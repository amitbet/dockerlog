var express = require('express');
var expressWs = require('express-ws');
const Docker = require('dockerode');
const timespan = require('timespan');
const { LogDataLayer } = require("./log-data-layer");
const { ContainerManager } = require("./container-manager");

function containerFilter(containerInfo) {
    //check it is a service (has open ports, is not the 'POD' container, did not exceed it's time to live... )
    let uptime = timespan.fromDates(new Date(containerInfo.Created * 1000), Date(Date.now()));
    if (!containerInfo.Names.includes("POD")
        && uptime.totalHours() < 5
        //  && containerInfo.Ports.length >= 1
    ) {
        return true;
    }
    return false;
}

async function main() {
    let storage = new LogDataLayer();
    storage.init();

    let dockerDeamon = new Docker({
        host: 'localhost',
        port: 2375
    });

    let manager = new ContainerManager(storage, dockerDeamon, containerFilter);

    manager.enumContainers();
    const app = express();

    expressWs(app);
    // a simple rest api to get the continer metadata
    app.get('/v1/container/:containerId/info', (req, res) => {
        let id = req.params["containerId"];
        let info = storage.getContainerInfo(id);
        res.send(info);
    });

    // a simple api to download the whole log up to current position
    app.get('/v1/container/:containerId/log', async (req, res) => {
        let id = req.params["containerId"];
        let data = await storage.getContainerLogData(id)
        res.send(data);
    });

    // a websocket api for realtime streaming:
    app.ws('/v1/container/:containerId', async (ws, req) => {
        let id = req.params["containerId"];
        let tailOnly = req.params["tail"] | false;

        manager.on("append" + id, (data1) => {
            //using toString here so it will show up better (will be binary otherwise)
            ws.send(data1.toString());
        });

        manager.on("closed" + id, () => {
            ws.terminate();
        });

        if (!tailOnly) {
            //practically no size limit on ws binary content according to the litrature...
            //A single frame, by RFC-6455 base framing, has a maximum size limit of 18,446,744,073,709,551,615 bytes (maximum value of a 64-bit unsigned value).
            let data = await storage.getContainerLogData(id)
            ws.send(data.toString());
        }

        ws.on('message', function (msg) {
            console.log(msg);
        });
        ws.on('open', function (msg) {
            console.log("connected");
        });
    });

    app.listen(3000);
}

main();

