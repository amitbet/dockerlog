
class GenericLogDataLayer {


    constructor() {
    }

    //-- INTERFACE FUNCTION-- getContainerLogData
    // reads and returns all stored data for this container (should be a stream, just a buffer for now) 
    async getContainerLogData(id) {
        return Promise.resolve(); //Promise<Buffer>
    }

    //-- INTERFACE FUNCTION-- appendLogForContainer
    //appends some log data into the container's file (should already exist)
    async appendLogForContainer(id, data) {
        return Promise.resolve(); //Promise<void>
    }

    //-- INTERFACE FUNCTION-- addContainer
    // adds a new container and opens a file for it's data, the file should be new (0 bytes)
    // since the container provides the whole history when attached.
    async addContainer(id, containerInfo) {
        return Promise.resolve(); //Promise<void>
    }

    //-- INTERFACE FUNCTION-- getContainerInfo
    // returns the container's metadata
    getContainerInfo(id) {
        return {};
    }


    //-- INTERFACE FUNCTION-- init
    // initializes this data layer loads the data from the saved file
    init() {
    }
}

exports.GenericLogDataLayer = GenericLogDataLayer;