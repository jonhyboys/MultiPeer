'use strict';
(function() {
    var glob_nombre_sala = '';
    var glob_nombre_usuario = '';
    var glob_error = 0;
    var pcConfig = {
        'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }],
        mandatory: { OfferToReceiveAudio: true }
    };
    var pcs = new Array(),
        pc_iniciador,
        mi_socket_id = 0,
        glob_local_stream,
        glob_es_iniciador = false,
        socket;
    $(document).ready(function() {
        socket = io();
        $('#txt-nombre-sala, #txt-nombre-usuario').focus(enfocar_caja_texto);
        $('#btn-conectar').click(function(evt) {
            evt.preventDefault();
            $('#msj-sala-llena').addClass('hide');
            glob_nombre_sala = $('#txt-nombre-sala').val();
            glob_nombre_usuario = $('#txt-nombre-usuario').val();
            if (glob_nombre_sala == '') {
                $('#p-nombre-sala-error').addClass('error');
                glob_error++;
            }
            if (glob_nombre_usuario == '') {
                $('#p-nombre-usuario-error').addClass('error');
                glob_error++;
            }
            if (glob_error > 0) {
                glob_error = 0;
                return;
            }
            socket.emit('crear_unir_sala', {
                nombre_sala: glob_nombre_sala,
                nombre_usuario: glob_nombre_usuario
            });
        });
        $('#btn-enviar').click(function() {
            var _mensaje = $('#txt-mensaje-enviar').val();
            if (_mensaje != '') {
                $('#lista-mensajes').append('<li><strong>' + glob_nombre_usuario + ':</strong> ' + _mensaje + '</li>');
                var obj_msg = {
                    nombre_sala: glob_nombre_sala,
                    nombre_usuario: glob_nombre_usuario,
                    mensaje: _mensaje
                };
                socket.emit('mensaje', obj_msg);
                $('#txt-mensaje-enviar').val('');
            }
        });
        $('#btn-video-control').click(function() {
            if ($('#btn-video-control i').hasClass('fa-video'))
                $('#btn-video-control i').attr('class', 'fa fa-video-slash')
            else
                $('#btn-video-control i').attr('class', 'fa fa-video')
            glob_local_stream.getVideoTracks()[0].enabled = !(glob_local_stream.getVideoTracks()[0].enabled);
        });
        $('#btn-audio-control').click(function() {
            if ($('#btn-audio-control i').hasClass('fa-microphone'))
                $('#btn-audio-control i').attr('class', 'fa fa-microphone-slash')
            else
                $('#btn-audio-control i').attr('class', 'fa fa-microphone')
            glob_local_stream.getAudioTracks()[0].enabled = !(glob_local_stream.getAudioTracks()[0].enabled);
        });
        $('#btn-colgar').click(function() { location.reload(); });
        $('#contenedor-usuarios-conectados i').click(abrir_archivo_uno);
        $('#contenedor-usuarios-conectados input').change(compartir_archivo_uno);
        socket.on('sala_creada', function(datos) {
            $('#inicio').toggleClass('hide');
            $('#principal').toggleClass('hide');
            $('#li-nombre-sala').html('<i class="fas fa-users"></i>' + glob_nombre_sala);
            $('#li-nombre-usuario').html('<i class="fas fa-user"></i>' + glob_nombre_usuario);
            glob_es_iniciador = true;
            mi_socket_id = datos.id;
            pc_iniciador = new conexion(0, false);
        });
        socket.on('agregado_a_sala', function(datos) {
            $('#inicio').toggleClass('hide');
            $('#principal').toggleClass('hide');
            $('#li-nombre-sala').html('<i class="fas fa-users"></i>' + glob_nombre_sala);
            $('#li-nombre-usuario').html('<i class="fas fa-user"></i>' + glob_nombre_usuario);
            mi_socket_id = datos.id;
            var x;
            for (x = 0; x < datos.ids_conectados.length; x++) {
                $('#lista-usuarios-conectados').
                append('<li data-nombre="' + datos.usuarios_conectados[x] + '">' + datos.usuarios_conectados[x] + '</li>');
                $('<video id="' + datos.ids_conectados[x] + '" autoplay src=""></video>').insertBefore('#contenedor-botones-video');
                pcs[datos.ids_conectados[x]] = new conexion(datos.ids_conectados[x], true);
            }
        });
        socket.on('sala_llena', function() {
            $('#msj-sala-llena').removeClass('hide');
        });
        socket.on('usuario_existe', function() {
            $('#msj-usuario-existe').removeClass('hide');
        });
        socket.on('mensaje', function(datos) {
            $('#lista-mensajes').
            append('<li><strong>' + datos.nombre_usuario + ':</strong> ' + datos.mensaje + '</li>');
        });
        socket.on('usuario_agregado', function(datos) {
            $('#lista-usuarios-conectados').append('<li data-nombre=' + datos.nuevo_usuario + '>' + datos.nuevo_usuario + '</li>');
            $('<video id="' + datos.nuevo_id + '" autoplay src=""></video>').insertBefore('#contenedor-botones-video');
            if (glob_es_iniciador && pc_iniciador != undefined) {
                glob_es_iniciador = false;
                pc_iniciador.socket_id_destino = datos.nuevo_id;
                pc_iniciador.cliente.addStream(glob_local_stream);
                pc_iniciador.cliente.onicecandidate = enviar_candidato.bind(null, pc_iniciador);
                pc_iniciador.cliente.ontrack = mostrar_video_remoto.bind(null, pc_iniciador);
                pcs[datos.nuevo_id] = pc_iniciador;
                pc_iniciador = undefined;
            } else {
                var nueva_conexion = new conexion(datos.nuevo_id, false);
                pcs[datos.nuevo_id] = nueva_conexion;
            }
        });
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
        socket.on('desconectar', function(datos) {
            if (pcs[datos.id] != undefined) {
                delete pcs[datos.id];
                $('#' + datos.id).remove();
                $('#lista-usuarios-conectados li[data-nombre="' + datos.nombre + '"]').remove();
            }
        });
        window.addEventListener('beforeunload', function() {
            socket.emit('desconectar', {
                nombre_sala: glob_nombre_sala,
                id: mi_socket_id,
                nombre: glob_nombre_usuario
            });
        }, false);
    });

    function enfocar_caja_texto() {
        $(this).next().removeClass('error');
    }

    function mostrar_video_local(objeto, ofertar, stream) {
        var video_local = document.getElementById('video-local');
        stream.getAudioTracks()[0].enabled = false;
        video_local.srcObject = stream;
        glob_local_stream = stream;
        if (!glob_es_iniciador) {
            pcs[objeto].cliente.addStream(stream);
            pcs[objeto].cliente.onicecandidate = enviar_candidato.bind(null, pcs[objeto]);
            if (ofertar) { pcs[objeto].cliente.onnegotiationneeded = crear_oferta.bind(null, pcs[objeto]); }
            pcs[objeto].cliente.ontrack = mostrar_video_remoto.bind(null, pcs[objeto]);
        }
    }

    function conexion(destino, ofertar) {
        this.socket_id_destino = destino;
        this.cliente = new RTCPeerConnection(pcConfig);
        navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 } } })
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

    function mostrar_error(error) {
        console.log(error.name + ': ' + error.message);
    }

    function crear_respuesta(objeto, evt) {
        return objeto.cliente.createAnswer();
    }

    function abrir_archivo_uno() {
        $(this).prev().click();
    }

    function compartir_archivo_uno(event) {
        var archivo = event.target.files;
        if (archivo.length > 1) {
            alert('Solo puede compartir un archivo a la vez. . .');
        } else if (archivo.length == 0) {
            alert('Debe seleccionar un archiva a compartir. . .');
        } else {
            alert('El archivo seleccionado es: ' + archivo[0].name);
        }
    }
})();