const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const timespan = require('timespan');
const { PassThrough } = require('stream')
var log = require('npmlog');
var express = require('express');
var expressWs = require('express-ws');
// add new import
const { promisify } = require('util');
const EventEmitter = require('events');


// create new functions with Promise API on existing Callback API function
const appendFile = promisify(fs.appendFile);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

class LogDataLayer extends EventEmitter {
    ContainersDB = undefined;

    constructor() {
        super();
        this.ContainersDB = {};
        this.setBaseDir("./data/");
    }

    // sets the base path for this data layer
    setBaseDir(myPath) {
        this.baseDir = path.normalize(myPath);
        if (!this.baseDir.endsWith("/") && !this.baseDir.endsWith("\\")) {
            this.baseDir += path.delimiter;
        }
    }

    // returns the file location for the given container Id
    getFileNameForContainer(id) {
        return this.baseDir + "container" + id;
    }

    // appends some log data into the container's file (should already exist)
    appendLogForContainer(id, data) {
        let fileName = this.getFileNameForContainer(id);
        this.emit("append" + id, data);
        fs.appendFile(fileName, data, (err) => {
            if (err) log.error("", "problem writing container log to file: %s, err: %s", fileName, err);
        });
    }

    // adds a new container and opens a file for it's data, the file should be new (0 bytes)
    // since the container provides the whole history when attached.
    async addContainer(id, containerInfo) {
        this.ContainersDB[id] = containerInfo;
        //updating our "database" on disk for persistance
        await this.saveDataBase();
        return writeFile(this.getFileNameForContainer(id), "");
    }

    // returns the container's metadata
    getContainerInfo(id) {
        return this.ContainersDB[id];
    }

    // saves our "db" to a json file
    async saveDataBase() {
        let dbData = JSON.stringify(this.ContainersDB);
        await writeFile(this.baseDir + "containers-db.json", dbData);
        //  (err) => {
        //     if (err) log.error(err);

        // });
        log.info('Container DataBase saved');
        return Promise.resolve();
    }

    // loads the data from the saved file
    loadDataBase() {
        let dataFile = this.baseDir + "containers-db.json";
        if (fs.existsSync(dataFile)) {
            fs.readFile(dataFile, (err, data) => {
                if (err) {
                    log.error(err);
                    return;
                }
                this.ContainersDB = JSON.parse(data);
                log.info('Container DataBase loaded');
            });
        } else {
            this.ContainersDB = {};
            log.info('DataBase is empty, initializing.');
        }
    }
}

class ContainerManager {
    knownContainers = undefined;
    dockerDeamon = undefined;

    constructor(logStorage) {
        this.logStorage = logStorage;
        this.knownContainers = {};
        // on linux: var docker = new Docker({socketPath: '/var/run/docker.sock'});
        this.dockerDeamon = new Docker({
            host: 'localhost',
            port: 2375
        });
    }

    shouldLog(containerInfo) {
        //check it is a service (has open ports, is not the 'POD' container, did not exceed it's time to live... )
        let uptime = timespan.fromDates(new Date(containerInfo.Created * 1000), Date(Date.now()));
        if (!containerInfo.Names.includes("POD")
            && uptime.totalHours() < 24
            //  && containerInfo.Ports.length >= 1
        ) {
            return true;
        }
        return false;
    }

    // enumerates the containers and creates new entites for the ones we select to track in the data layer
    async enumContainers() {

        let containers = await this.dockerDeamon.listContainers();

        // this.dockerDeamon.listContainers(function (err, containers) {
        containers.forEach(async (containerInfo) => {
            let cId = containerInfo.Id;

            let container = this.dockerDeamon.getContainer(cId);//.stop(cb);

            if (!this.knownContainers[cId] && this.shouldLog(containerInfo)) {
                this.knownContainers[cId] = container;
                await this.logStorage.addContainer(cId, containerInfo);

                log.info('enumContainers:', 'watching container: %s called: %s', cId, containerInfo.Names)

                let stream = await container.attach({ logs: true, stream: true, stdout: true, stderr: true });
                var sout = new PassThrough();

                //clone id for closure
                const idStr = JSON.stringify(cId);
                const newId = JSON.parse(idStr);
                sout.on('data', (data) => {
                    this.logStorage.appendLogForContainer(newId, data);
                });

                //let stdout1 = fs.createWriteStream("out" + containerInfo.Id);
                stream.pipe(sout);
            }
        });
    }
}

async function main() {
    let storage = new LogDataLayer();
    storage.loadDataBase();
    let manager = new ContainerManager(storage);

    setInterval(manager.enumContainers.bind(manager), 5000);
    const app = express();

    var exWsApp = expressWs(app);
    // a simple rest api to get the continer metadata
    app.get('/v1/container/:containerId/info', (req, res) => {
        let id = req.params["containerId"];
        let info = storage.getContainerInfo(id);
        res.send(info);
    });

    // a simple api to download the whole log up to current position
    app.get('/v1/container/:containerId/log', async (req, res) => {
        let id = req.params["containerId"];
        let filename = storage.getFileNameForContainer(id);
        res.sendfile(filename);
    });
    // a websocket api for realtime streaming:
    app.ws('/v1/container/:containerId', async (ws, req) => {
        let id = req.params["containerId"];
        let tailOnly = req.params["tail"] | false;
        // storage.registerWsForLiveStream(ws);

        let filename = storage.getFileNameForContainer(id);
        storage.on("append" + id, (data1) => {
            //using toString here so it will show up better (will be binary otherwise)
            ws.send(data1.toString());
        });

        if (!tailOnly) {
            //practically no size limit on ws binary content according to the litrature...
            //A single frame, by RFC-6455 base framing, has a maximum size limit of 18,446,744,073,709,551,615 bytes (maximum value of a 64-bit unsigned value).
            let data = await readFile(filename);
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

