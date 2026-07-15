/**
 * Singleton socket.io instance shared across controllers.
 * server.js calls setIo(io) after creating the server.
 */
let _io = null;

function setIo(io) {
  _io = io;
}

function getIo() {
  return _io;
}

module.exports = { setIo, getIo };
