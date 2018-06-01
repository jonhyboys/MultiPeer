'use strict';

(function() {
    //Variables globales
    var glob_nombre_sala = '';
    var glob_nombre_usuario = '';
    var pcConfig = {
        'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }],
        mandatory: { OfferToReceiveAudio: true }
    };
    var sdpConstraints = {
        //offerToReceiveAudio: true,
        offerToReceiveVideo: true
    };
    var pcs = new Array(),
        pc_iniciador,
        mi_socket_id,
        glob_local_stream,
        glob_es_iniciador = false;

    function mostrar_video_local(objeto, ofertar, stream) {
        var video_local = document.getElementById('video-local');
        video_local.srcObject = stream;
        glob_local_stream = stream;
        if (!glob_es_iniciador) {
            pcs[objeto].cliente.addTrack(stream.getVideoTracks()[0], stream);
            //Cuando hayan candidatos enviarlo a otros usuarios
            pcs[objeto].cliente.onicecandidate = enviar_candidato.bind(null, pcs[objeto]);
            //Una vez que se tenga la descripción local, crear y enviar la oferta a otros usuarios
            if (ofertar) { pcs[objeto].cliente.onnegotiationneeded = crear_oferta.bind(null, pcs[objeto]); }
            // once remote track arrives, show it in the remote video element
            pcs[objeto].cliente.ontrack = mostrar_video_remoto.bind(null, pcs[objeto]);
        }
    }

    function conexion(destino, ofertar) {
        this.socket_id_destino = destino;
        this.cliente = new RTCPeerConnection(pcConfig);

        navigator.mediaDevices.getUserMedia({ video: true })
            .then(mostrar_video_local.bind(null, this.socket_id_destino, ofertar))
            .catch(mostrar_error);
    }

    function mostrar_video_remoto(objeto, evt) {
        var video_remoto = document.getElementById(objeto.socket_id_destino);
        video_remoto.srcObject = evt.streams[0];
    }

    function enviar_candidato(objeto, evt) {
        if (evt.candidate) {
            console.log('Enviando candidato a:' + objeto.socket_id_destino);
            socket.emit('candidato', {
                nombre_sala: glob_nombre_sala,
                socket_destino: objeto.socket_id_destino,
                socket_origen: mi_socket_id,
                candidato: evt.candidate
            });
        }
    }

    function crear_oferta(objeto, evt) {
        objeto.cliente.createOffer().then(establecer_descripcion_local.bind(null, objeto))
            .then(enviar_descripcion.bind(null, objeto))
            .catch(mostrar_error);
    }

    function establecer_descripcion_local(objeto, oferta) {
        return objeto.cliente.setLocalDescription(oferta);
    }

    function enviar_descripcion(objeto, evt) {
        console.log('Enviando descripción a: ' + objeto.socket_id_destino);
        socket.emit('descripcion', {
            nombre_sala: glob_nombre_sala,
            socket_origen: mi_socket_id,
            socket_destino: objeto.socket_id_destino,
            descripcion: objeto.cliente.localDescription
        });
    }

    function mostrar_error(error) { console.log(error.name + ': ' + error.message); }

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
    $('#lbl-usuarios-conectados').click(function() { if ($('#lista-usuarios-conectados').html() != '') { $('#lista-usuarios-conectados').toggleClass('visible'); } });

    //Cuando el servidor indica que se creó la sala, pasamos a la siguiente vista
    socket.on('sala_creada', function(datos) {
        $('#inicio').toggleClass('hide');
        $('#principal').toggleClass('hide');
        glob_es_iniciador = true;
        mi_socket_id = datos.id;
        pc_iniciador = new conexion(0, false);
    });

    //Cuando el servidor indica que se nos agregó a la sala, pasamos a la siguiente vista
    socket.on('agregado_a_sala', function(datos) {
        $('#inicio').toggleClass('hide');
        $('#principal').toggleClass('hide');
        mi_socket_id = datos.id;
        var x;
        for (x = 0; x < datos.ids_conectados.length; x++) {
            $('video:not([id])').eq(0).attr('id', datos.ids_conectados[x]);
            pcs[datos.ids_conectados[x]] = new conexion(datos.ids_conectados[x], true);
        }
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
        $('video:not([id])').eq(0).attr('id', datos.nuevo_id);
        if (glob_es_iniciador && pc_iniciador != undefined) {
            glob_es_iniciador = false;
            pc_iniciador.socket_id_destino = datos.nuevo_id;
            pc_iniciador.cliente.addTrack(glob_local_stream.getVideoTracks()[0], glob_local_stream);
            pc_iniciador.cliente.onicecandidate = enviar_candidato.bind(null, pc_iniciador);
            pc_iniciador.cliente.ontrack = mostrar_video_remoto.bind(null, pc_iniciador);
            pcs[datos.nuevo_id] = pc_iniciador;
            pc_iniciador = undefined;
        } else {
            var nueva_conexion = new conexion(datos.nuevo_id, false);
            pcs[datos.nuevo_id] = nueva_conexion;
        }
    });

    function crear_respuesta(objeto, evt) {
        return objeto.cliente.createAnswer();
    }

    socket.on('descripcion', function(datos) {
        if (datos.descripcion.type == 'offer') {
            console.log('Oferta de: ' + datos.socket_origen);
            pcs[datos.socket_origen].cliente.setRemoteDescription(datos.descripcion)
                .then(crear_respuesta.bind(null, pcs[datos.socket_origen]))
                .then(establecer_descripcion_local.bind(null, pcs[datos.socket_origen]))
                .then(enviar_descripcion.bind(null, pcs[datos.socket_origen]))
                .catch(mostrar_error);
        } else {
            pcs[datos.socket_origen].cliente.setRemoteDescription(datos.descripcion).catch(mostrar_error);
            console.log('Respuesta de: ' + datos.socket_origen);
        }
    });

    socket.on('candidato', function(datos) {
        console.log('Candidato recibido de: ' + datos.socket_origen);
        pcs[datos.socket_origen].cliente.addIceCandidate(datos.candidato);
    });

    window.onbeforeunload = function() {
        socket.onclose = function() {};
        socket.close();
    };
})();