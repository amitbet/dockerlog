const fs = require('fs');
const path = require('path');
var log = require('npmlog');

// add new import
const { promisify } = require('util');

// create new functions with Promise API on existing Callback API function
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

class LogDataLayer {
    ContainersDB = undefined;

    constructor() {
        this.ContainersDB = {};
        this.setBaseDir("./data/");
    }

    // (private) sets the base path for this data layer
    setBaseDir(myPath) {
        this.baseDir = path.normalize(myPath);
        if (!this.baseDir.endsWith("/") && !this.baseDir.endsWith("\\")) {
            this.baseDir += path.delimiter;
        }
    }

    // (private) returns the file location for the given container Id
    getFileNameForContainer(id) {
        return this.baseDir + "container" + id;
    }

    // (private) saves our "db" to a json file
    async saveDataBase() {
        let dbData = JSON.stringify(this.ContainersDB);
        await writeFile(this.baseDir + "containers-db.json", dbData);
        //  (err) => {
        //     if (err) log.error(err);

        // });
        log.info('Container DataBase saved');
        return Promise.resolve();
    }

    //-- INTERFACE FUNCTION-- getContainerLogData
    // reads and returns all stored data for this container (should be a stream, just a buffer for now) 
    async getContainerLogData(id) {
        return readFile(this.getFileNameForContainer(id));
    }

    //-- INTERFACE FUNCTION-- appendLogForContainer
    //appends some log data into the container's file (should already exist)
    appendLogForContainer(id, data) {
        let fileName = this.getFileNameForContainer(id);
        // this.emit("append" + id, data);
        fs.appendFile(fileName, data, (err) => {
            if (err) log.error("", "problem writing container log to file: %s, err: %s", fileName, err);
        });
    }

    //-- INTERFACE FUNCTION-- addContainer
    // adds a new container and opens a file for it's data, the file should be new (0 bytes)
    // since the container provides the whole history when attached.
    async addContainer(id, containerInfo) {
        this.ContainersDB[id] = containerInfo;
        //updating our "database" on disk for persistance
        await this.saveDataBase();
        return writeFile(this.getFileNameForContainer(id), "");
    }

    //-- INTERFACE FUNCTION-- getContainerInfo
    // returns the container's metadata
    getContainerInfo(id) {
        return this.ContainersDB[id];
    }


    //-- INTERFACE FUNCTION-- init
    // initializes this data layer loads the data from the saved file
    init() {
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

exports.LogDataLayer = LogDataLayer;