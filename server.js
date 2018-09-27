/* VARIABLES - SERVIDOR WEB */
var express = require('express');
var app = express();
var server = require('http').Server(app);
var port = process.env.PORT || 8080,
    ip = process.env.IP || '0.0.0.0';

/* CONFIGURACIÓN DEL SERVIDOR WEB */
app.engine('html', require('ejs').renderFile);
app.use(express.static('public'));
app.get('/', function(req, res) { res.render('index.html'); });
app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Error. . .');
});
/* INICIO DEL SERVIDOR WEB */
server.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

/* VARIABLES - SERVIDOR WEBSOCKET */
var io = require('socket.io')(server);
var _usuarios_conectados = new Array(),
    _ids_conectados = new Array();

/*INICIO DEL SERVIDOR WEBSOCKET */
io.on('connection', function(socket) {
    socket.on('crear_unir_sala', function(datos) {
        var usuarios_en_la_sala = io.sockets.adapter.rooms[datos.nombre_sala];
        var numero_usuarios = usuarios_en_la_sala ? Object.keys(usuarios_en_la_sala.sockets).length : 0;
        if (numero_usuarios == 0) {
            socket.join(datos.nombre_sala);
            socket.emit('sala_creada', { id: socket.id });
            _ids_conectados[datos.nombre_sala] = [socket.id];
            _usuarios_conectados[datos.nombre_sala] = [datos.nombre_usuario];
        } else if (numero_usuarios < 4) {
            if (!_usuarios_conectados[datos.nombre_sala].includes(datos.nombre_usuario)) {
                socket.join(datos.nombre_sala);
                socket.emit('agregado_a_sala', {
                    usuarios_conectados: _usuarios_conectados[datos.nombre_sala],
                    ids_conectados: _ids_conectados[datos.nombre_sala],
                    id: socket.id
                });
                _usuarios_conectados[datos.nombre_sala].push(datos.nombre_usuario);
                _ids_conectados[datos.nombre_sala].push(socket.id);
                socket.to(datos.nombre_sala).emit('usuario_agregado', {
                    nuevo_usuario: datos.nombre_usuario,
                    nuevo_id: socket.id
                });
            } else { socket.emit('usuario_existe'); }
        } else { socket.emit('sala_llena'); }
    });

    socket.on('desconectar', function(datos) {
        if (_ids_conectados[datos.nombre_sala] != undefined) {
            for (let x = 0; x < _ids_conectados[datos.nombre_sala].length; x++) {
                if (_ids_conectados[datos.nombre_sala][x] == datos.id) {
                    _usuarios_conectados[datos.nombre_sala].splice(x, 1);
                    _ids_conectados[datos.nombre_sala].splice(x, 1);
                    break;
                }
            }
            socket.to(datos.nombre_sala).emit('desconectar', datos);
        }
    });

    socket.on('candidato', function(datos) {
        io.to(datos.socket_destino).emit('candidato', datos);
    });

    socket.on('descripcion', function(datos) {
        io.to(datos.socket_destino).emit('descripcion', datos);
    });

    socket.on('archivo', function(datos) {
        io.to(datos.id_usuario_destino).emit('archivo', datos);
    });

    socket.on('archivo_respuesta', function(datos) {
        io.to(datos.id_usuario_destino).emit('archivo_respuesta', datos);
    });

    socket.on('mensaje', function(datos) {
        socket.to(datos.nombre_sala).emit('mensaje', datos);
    });
});

module.exports = app;