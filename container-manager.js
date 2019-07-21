
const { PassThrough } = require('stream')
var log = require('npmlog');
const DockerEvents = require('docker-events');
const EventEmitter = require('events');

class ContainerManager extends EventEmitter {
    knownContainers = undefined;
    dockerDeamon = undefined;
    dockerEmitter = undefined;

    constructor(logStorage, dockerDeamon, filterFunction) {
        super();
        this.shouldLog = filterFunction;
        this.logStorage = logStorage;
        this.knownContainers = {};
        // on linux: var docker = new Docker({socketPath: '/var/run/docker.sock'});
        this.dockerDeamon = dockerDeamon


        this.dockerEmitter = new DockerEvents({
            docker: this.dockerDeamon,
        });

        this.dockerEmitter.start();

        this.dockerEmitter.on("stop", (message) => {
            console.log("container stopped: %j", message);
            this.closeContainer(message.id)
        });

        this.dockerEmitter.on("die", (message) => {
            console.log("container died: %j", message);
            this.closeContainer(message.id)
        });

        this.dockerEmitter.on("destroy", (message) => {
            console.log("container destroyed: %j", message);
            this.closeContainer(message.id)
        });

        this.dockerEmitter.on("create", (c) => {
            let attr = c.Actor.Attributes
            let names = [attr.name];
            let id = c.id;
            let created = c.time;
            let containerInfo = {
                Created: created,
                Id: id,
                Names: names
            }
            if (!this.knownContainers[id] && this.shouldLog(containerInfo)) {
                this.trackContainer(id, containerInfo);
            }

            console.log("container created, base image: " + c.from + " id: " + c.id);
        });
    }

    //stops listening to a container stream when it exits
    closeContainer(id) {
        let stream = this.knownContainers[id].stream;
        if (stream) {
            stream.destroy();
            this.knownContainers[id] = undefined;
        }
        this.emit("closed" + id);
    }

    close() {
        dockerEmitter.stop();
    }

    // sets the container filter that decides which containers get listened to
    setContainerFilter(filterFunction) {
        this.shouldLog = filterFunction;
    }

    // initial container filter function (no filtering)
    shouldLog(containerInfo) {
        return true;
    }

    clone(obj) {
        const strObj = JSON.stringify(obj);
        const newObj = JSON.parse(strObj);
        return newObj;
    }

    async trackContainer(cId, containerInfo) {
        let container = this.dockerDeamon.getContainer(cId);//.stop(cb);

        await this.logStorage.addContainer(cId, containerInfo);

        log.info('enumContainers:', 'watching container: %s called: %s', cId, containerInfo.Names)

        let stream = await container.attach({ logs: true, stream: true, stdout: true, stderr: true });
        let sout = new PassThrough();
        this.knownContainers[cId] = { container: container, stream: stream };

        //clone id for closure
        const newId = this.clone(cId);
        sout.on('data', async (data) => {
            try {
                await this.logStorage.appendLogForContainer(newId, data);
            } catch (err) {
                log.error("error appending log data to container: " + newId);
                return;
            }
            this.emit("append" + newId, data);
        });

        stream.pipe(sout);
    }

    // enumerates the containers and creates new entites for the ones we select to track in the data layer
    async enumContainers() {

        let containers = await this.dockerDeamon.listContainers();

        // this.dockerDeamon.listContainers(function (err, containers) {
        containers.forEach(async (containerInfo) => {
            let cId = containerInfo.Id;

            if (!this.knownContainers[cId] && this.shouldLog(containerInfo)) {
                await this.trackContainer(cId, containerInfo)
            }
        });
    }
}

exports.ContainerManager = ContainerManager;