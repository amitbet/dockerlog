# dockerlog

## A Docker logger mechanism in nodejs
* Listens to docker events and tracks container creation and removal
* Attaches to docker raw streams and saves them to separate files
* Provides a server with live WebSocket streaming and REST download capabilities.
* Supports a customizable filter function for deciding which containers to log
* Keeps container output after containers have been killed