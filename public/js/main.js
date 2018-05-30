'use strict';

(function() {
    //Variables globales
    var glob_nombre_sala = '';
    var glob_nombre_usuario = '';
    var pcConfig = {
        'iceServers': [{
            'urls': 'stun:stun.l.google.com:19302'
        }],
        mandatory: {
            OfferToReceiveAudio: true
        }
    };
    var sdpConstraints = {
        //offerToReceiveAudio: true,
        offerToReceiveVideo: true
    };
    var pcs = [],
        sockets_ids = [],
        mi_socket_id,
        local_stream,
        iniciador = false;

    //Iniciar los sockets
    var socket = io();

    //Poner el foco al nombre de la sala
    $('#txt-nombre-sala').focus();

    //Click en botón conectar
    $('#btn-conectar').click(function() {
        //Ocultar los mensajes de error
        $('#msj-error-conectar').addClass('hide');
        //Obtener nombre de sala y de usuario
        glob_nombre_sala = $('#txt-nombre-sala').val();
        glob_nombre_usuario = $('#txt-nombre-usuario').val();
        //Si el nombre de sala es vacío, mostrar error
        if (glob_nombre_sala == '') {
            $('#msj-error-conectar').html('Debe escribir el nombre de la sala...').removeClass('hide');
            return;
        }
        //Si el nombre de usuario es vacío, mostrar error
        if (glob_nombre_usuario == '') {
            $('#msj-error-conectar').html('Debe escribir el nombre de usuario...').removeClass('hide');
            return;
        }
        //Establecer nombre de sala y usuario en la barra superior
        $('#li-nombre-sala').html(glob_nombre_sala);
        $('#li-nombre-usuario').html(glob_nombre_usuario);
        //Unirse o crear(si no existe) la sala
        socket.emit('crear_unir_sala', {
            nombre_sala: glob_nombre_sala,
            nombre_usuario: glob_nombre_usuario
        });
    });

    //Cuando el servidor indica que se creó la sala, pasamos a la siguiente vista
    socket.on('sala_creada', function(datos) {
        $('#inicio').toggleClass('hide');
        $('#principal').toggleClass('hide');
        iniciador = true;
        mi_socket_id = datos.id;
        iniciar_WebRTC(datos);
    });

    //Cuando el servidor indica que se nos agregó a la sala, pasamos a la siguiente vista
    socket.on('agregado_a_sala', function(datos) {
        $('#inicio').toggleClass('hide');
        $('#principal').toggleClass('hide');
        mi_socket_id = datos.id;
        console.log(datos);
        iniciar_WebRTC(datos);
    });

    //Cuando la sala está llena, se le indica al usuario
    socket.on('sala_llena', function() { $('#msj-error-conectar').html('Lo sentimos, la sala está llena. . .').removeClass('hide'); });

    //Verificar el nombre de usuario
    socket.on('usuario_existe', function() { $('#msj-error-conectar').html('Lo sentimos, ya existe otro usuario con el mismo nombre en la sala. . .').removeClass('hide'); });

    //Pegar mensajes recibidos de otros usuarios en la lista de mensajes
    socket.on('mensaje', function(datos) { $('#lista-mensajes').append('<li><strong>' + datos.nombre_usuario + ':</strong> ' + datos.mensaje + '</li>'); });

    //Agregar nuevos usuarios conectados
    socket.on('usuario_agregado', function(datos) {
        //Agregar usuario nuevo a la lista de usuarios conectados
        $('#lista-usuarios-conectados').append('<li>' + datos.nuevo_usuario + '</li>');
        //Crear conexión con el nuevo usuario
        pcs[datos.nuevo_id] = new RTCPeerConnection(pcConfig);
        pcs[datos.nuevo_id].addTrack(local_stream.getVideoTracks()[0], local_stream);
        //Cuando hayan candidatos enviarlo al nuevo usuario
        pcs[datos.nuevo_id].onicecandidate = enviar_candidato;
        //Una vez que se tenga la descripción local, crear y enviar la oferta al nuevo usuario
        pcs[datos.nuevo_id].onnegotiationneeded = function() {}; //crear_oferta(datos.nuevo_id);
        //Cuando el usuario nuevo agregue video a la conexión, mostrar en el control de video
        pcs[datos.nuevo_id].ontrack = function(evt) {
            var video_remoto = document.getElementById(datos.nuevo_id);
            video_remoto.srcObject = evt.streams[0];
        };
    });

    //Enviar chat escrito
    $('#btn-enviar').click(function() {
        //Obtener el texto escrito
        var _mensaje = $('#txt-mensaje-enviar').val();
        //Si el texto es diferente de vacío enviar mensaje
        if (_mensaje != '') {
            //Pegar mi mj en la lista de mensajes
            $('#lista-mensajes').append('<li><strong>' + glob_nombre_usuario + ':</strong> ' + _mensaje + '</li>');
            //Objeto a enviar, se envía el usuario para que el remitente sepa de quién es el mensaje
            var obj_msg = {
                nombre_sala: glob_nombre_sala,
                nombre_usuario: glob_nombre_usuario,
                mensaje: _mensaje
            };
            socket.emit('mensaje', obj_msg);
            //Se limpia la caja de texto
            $('#txt-mensaje-enviar').val('');
        }
    });

    //Mostrar lista de usuarios conectados
    $('#lbl-usuarios-conectados').click(function() {
        if ($('#lista-usuarios-conectados').html() != '')
            $('#lista-usuarios-conectados').toggleClass('visible');
    });


    function iniciar_WebRTC(datos) {
        //Dependiendo de la cantidad de usuarios conectados se hará una u otra cosa
        if (iniciador) {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(function(stream) {
                    var video_local = document.getElementById('video-local');
                    video_local.srcObject = stream;
                    local_stream = stream;
                })
                .catch(mostrar_error);
        } else {
            var usuarios_conectados = datos.usuarios_conectados;
            var ids_conectados = datos.ids_conectados;
            // get a local stream, show it in a self-view and add it to be sent
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(function(stream) {
                    var video_local = document.getElementById('video-local');
                    video_local.srcObject = stream;
                    local_stream = stream;

                    var x = 0;
                    for (x; x < usuarios_conectados.length; x++) {
                        //Crear conexión 1
                        pcs.push(ids_conectados[x]);
                        pcs[ids_conectados[x]] = new RTCPeerConnection(pcConfig);
                        pcs[ids_conectados[x]].addTrack(stream.getVideoTracks()[0], stream);
                        //Cuando hayan candidatos enviarlo a otros usuarios
                        pcs[ids_conectados[x]].onicecandidate = enviar_candidato;
                        //Una vez que se tenga la descripción local, crear y enviar la oferta a otros usuarios
                        pcs[ids_conectados[x]].onnegotiationneeded = crear_oferta(ids_conectados[x]);

                        // once remote track arrives, show it in the remote video element
                        pcs[ids_conectados[x]].ontrack = function(evt, id_origen = ids_conectados[x]) {
                            debugger
                            var video_remoto = document.getElementById(id_origen);
                            video_remoto.srcObject = evt.streams[0];
                        };
                    }
                })
                .catch(mostrar_error);
        }
    }

    function enviar_candidato(evt) {
        if (evt.candidate) {
            socket.emit('candidato', {
                nombre_sala: glob_nombre_sala,
                id_origen: mi_socket_id,
                candidato: evt.candidate
            });
        }
    }

    function crear_oferta(_id_enviar) {
        //if (!iniciador) {
        pcs[_id_enviar].createOffer().then(function(offer) {
                return pcs[_id_enviar].setLocalDescription(offer);
            })
            .then(function() {
                enviar_descripcion(_id_enviar);
            })
            .catch(mostrar_error);
        //}
    };

    function enviar_descripcion(_id_enviar) {
        socket.emit('descripcion', {
            nombre_sala: glob_nombre_sala,
            id_origen: mi_socket_id,
            id_enviar: _id_enviar,
            descripcion: pcs[_id_enviar].localDescription
        });
    }

    socket.on('descripcion', function(datos) {
        if (datos.descripcion.type == 'offer') {
            pcs[datos.id_origen].setRemoteDescription(datos.descripcion).then(function() {
                    return pcs[datos.id_origen].createAnswer();
                })
                .then(function(answer) {
                    return pcs[datos.id_origen].setLocalDescription(answer);
                })
                .then(function() {
                    enviar_descripcion(datos.id_origen);

                    //Obtener la lista de etiquetas de video que no tienen un id
                    $('video:not([id])').eq(0).attr('id', datos.id_origen);
                    console.log(datos.id_origen);
                })
                .catch(mostrar_error);
        } else {
            pcs[datos.id_origen].setRemoteDescription(datos.descripcion).catch(mostrar_error);
            //Obtener la lista de etiquetas de video que no tienen un id
            $('video:not([id])').eq(0).attr('id', datos.id_origen);
            console.log(datos.id_origen);
        }
    });

    socket.on('candidato', function(datos) {
        pcs[datos.id_origen].addIceCandidate(datos.candidato);
    });

    function mostrar_error(error) { console.log(error.name + ': ' + error.message); }

    window.onbeforeunload = function() {
        socket.onclose = function() {};
        socket.close();
    };
})();