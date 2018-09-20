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
    //Compartir Archivos
    const BYTES_POR_PEDAZO = 1200;
    var usuarios_a_compartir,
        archivo_a_compartir;
    var archivo_seleccionado,
        pedazo_actual,
        lector_archivo = new FileReader(),
        ids_enviar;
    //Recibir archivos
    var archivo_entrante_informacion;
    var archivo_entrante_datos;
    var bytes_recibidos;
    var descarga_en_progreso = false;

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
                $('#lista-mensajes')
                    .append('<li><strong>' + glob_nombre_usuario + ':</strong> ' + _mensaje + '</li>')
                    .scrollTop(1000);
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
        $('#li-desconectar').click(function() { location.reload(); });
        $('#contenedor-usuarios-conectados').on('click', 'i', mostrar_selector_archivos);
        $('#selector-archivos').change(seleccionar_archivo);
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
                append('<li data-nombre="' + datos.usuarios_conectados[x] + '">' +
                    '<p>' + datos.usuarios_conectados[x] + '</p>' +
                    '<i class="fa fa-share-alt" aria-hidden="true" id="share-' + datos.ids_conectados[x] + '"></i>' +
                    '</li>');
                $('<video id="' + datos.ids_conectados[x] + '" autoplay src=""></video>').insertBefore('#contenedor-botones-video');
                pcs[datos.ids_conectados[x]] = new conexion(datos.ids_conectados[x], true);
            }
        });
        socket.on('sala_llena', function() { $('#msj-sala-llena').removeClass('hide'); });
        socket.on('usuario_existe', function() { $('#msj-usuario-existe').removeClass('hide'); });
        socket.on('mensaje', function(datos) {
            $('#lista-mensajes')
                .append('<li><strong>' + datos.nombre_usuario + ':</strong> ' + datos.mensaje + '</li>')
                .scrollTop(1000);
        });
        socket.on('usuario_agregado', function(datos) {
            $('#lista-usuarios-conectados')
                .append('<li data-nombre=' + datos.nuevo_usuario + '>' +
                    '<p>' + datos.nuevo_usuario + '</p>' +
                    '<i class="fa fa-share-alt" aria-hidden="true" id="share-' + datos.nuevo_id + '"></i>' +
                    '</li>');
            $('<video id="' + datos.nuevo_id + '" autoplay src=""></video>').insertBefore('#contenedor-botones-video');
            if (glob_es_iniciador && pc_iniciador != undefined) {
                glob_es_iniciador = false;
                pc_iniciador.socket_id_destino = datos.nuevo_id;
                pc_iniciador.cliente.addStream(glob_local_stream);
                pc_iniciador.cliente.onicecandidate = enviar_candidato.bind(null, pc_iniciador);
                pc_iniciador.cliente.ontrack = mostrar_video_remoto.bind(null, pc_iniciador);
                pc_iniciador.archivo.set_destino(datos.nuevo_id);
                pcs[datos.nuevo_id] = pc_iniciador;
                pc_iniciador = undefined;
            } else {
                var nueva_conexion = new conexion(datos.nuevo_id, false);
                pcs[datos.nuevo_id] = nueva_conexion;
            }
        });
        socket.on('descripcion', function(datos) {
            if (datos.descripcion.type == 'offer') {
                pcs[datos.socket_origen].cliente.setRemoteDescription(datos.descripcion)
                    .then(crear_respuesta.bind(null, pcs[datos.socket_origen]))
                    .then(establecer_descripcion_local.bind(null, pcs[datos.socket_origen]))
                    .then(enviar_descripcion.bind(null, pcs[datos.socket_origen]))
                    .catch(mostrar_error);
            } else { pcs[datos.socket_origen].cliente.setRemoteDescription(datos.descripcion).catch(mostrar_error); }
        });
        socket.on('candidato', function(datos) { pcs[datos.socket_origen].cliente.addIceCandidate(datos.candidato); });
        socket.on('desconectar', function(datos) {
            if (pcs[datos.id] != undefined) {
                delete pcs[datos.id];
                $('#' + datos.id).remove();
                $('#lista-usuarios-conectados li[data-nombre="' + datos.nombre + '"]').remove();
            }
        });
        socket.on('archivo', function(datos) {
            var x = confirm("El usuario " + datos.nombre_usuario + " está intentando enviarle un archivo, desea recibirlo?");
            socket.emit('archivo_respuesta', { id_usuario_destino: datos.id_usuario, id_usuario: mi_socket_id, nombre_usuario: glob_nombre_usuario, respuesta: x });
        });
        socket.on('archivo_respuesta', function(datos) {
            if (datos.respuesta) {
                pcs[datos.id_usuario].archivo.set_archivo(archivo_a_compartir);
                pcs[datos.id_usuario].archivo.iniciar();
            } else {
                alert('El usuario ' + datos.nombre_usuario + ' no acepto el archivo');
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

    function enfocar_caja_texto() { $(this).next().removeClass('error'); }

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
        this.canal_datos = this.cliente.createDataChannel(destino);
        this.archivo = new CompartirArchivo(mi_socket_id, this.canal_datos, destino);
        navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 } } })
            .then(mostrar_video_local.bind(null, this.socket_id_destino, ofertar))
            .catch(mostrar_error);
        this.canal_datos.onmessage = recibir_datos;
        this.canal_datos.onopen = function() {
            console.log("datachannel open");
        };

        this.canal_datos.onclose = function() {
            console.log("datachannel close");
        };
        this.canal_datos.onerror = function(event) {
            console.log(event.message);
        };
        this.cliente.ondatachannel = canal_nuevo.bind(null, this.canal_datos);
    }

    function canal_nuevo(objeto, evt) {
        objeto = evt.channel;
        objeto.onmessage = recibir_datos;
    }

    function mostrar_video_remoto(objeto, evt) {
        var video_remoto = document.getElementById(objeto.socket_id_destino);
        video_remoto.srcObject = evt.streams[0];
    }

    function enviar_candidato(objeto, evt) {
        if (evt.candidate) {
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

    function establecer_descripcion_local(objeto, oferta) { return objeto.cliente.setLocalDescription(oferta); }

    function enviar_descripcion(objeto, evt) {
        socket.emit('descripcion', {
            nombre_sala: glob_nombre_sala,
            socket_origen: mi_socket_id,
            socket_destino: objeto.socket_id_destino,
            descripcion: objeto.cliente.localDescription
        });
    }

    function mostrar_error(error) { console.log(error.name + ': ' + error.message); }

    function crear_respuesta(objeto, evt) { return objeto.cliente.createAnswer(); }

    function pedir_confirmacion_envio() {
        for (var i = 0; i < usuarios_a_compartir.length; i++) {
            socket.emit('archivo', { id_usuario_destino: usuarios_a_compartir[i], id_usuario: mi_socket_id, nombre_usuario: glob_nombre_usuario });
        }
    }

    function seleccionar_archivo(evt) {
        var lista_archivos_seleccionados = evt.target.files;
        if (lista_archivos_seleccionados.length > 1) {
            alert('Solo puede compartir un archivo a la vez. . .');
        } else if (lista_archivos_seleccionados.length == 0) {
            alert('Debe seleccionar un archiva a compartir. . .');
        } else {
            archivo_a_compartir = lista_archivos_seleccionados[0];
            pedir_confirmacion_envio();
        }
    }

    function mostrar_selector_archivos() {
        usuarios_a_compartir = [];
        var tipo = $(this).attr('id').replace('share-', '');
        if (tipo != 'todos') {
            usuarios_a_compartir.push(tipo);
        } else {
            var lista = $('#contenedor-usuarios-conectados li');
            for (var i = 0; i < lista.length; i++) {
                var destino = $(lista[i]).find('i').attr('id').replace('share-', '');
                usuarios_a_compartir.push(destino);
            }
        }
        $('#selector-archivos').click();
    }

    function recibir_datos(evt) {
        if (descarga_en_progreso === false) {
            iniciar_descarga(evt.data);
        } else {
            continuar_descarga(evt.data);
        }
    }

    function iniciar_descarga(data) {
        archivo_entrante_informacion = JSON.parse(data.toString());
        archivo_entrante_datos = [];
        bytes_recibidos = 0;
        descarga_en_progreso = true;
        $('#share-' + archivo_entrante_informacion.id_usuario).parent().append('<label>Recibiendo...</label><progress max="' + archivo_entrante_informacion.tamano_archivo + '" value="0"></progress>');
    }

    function continuar_descarga(data) {
        bytes_recibidos += data.byteLength;
        archivo_entrante_datos.push(data);
        $('#share-' + archivo_entrante_informacion.id_usuario).next().next().val(bytes_recibidos);
        if (bytes_recibidos === archivo_entrante_informacion.tamano_archivo) { terminar_descarga(); }
    }

    function terminar_descarga() {
        descarga_en_progreso = false;
        var blob = new window.Blob(archivo_entrante_datos);
        var anchor = document.createElement('a');

        $('#share-' + archivo_entrante_informacion.id_usuario).next().remove();
        $('#share-' + archivo_entrante_informacion.id_usuario).next().remove();

        anchor.href = URL.createObjectURL(blob);
        anchor.download = archivo_entrante_informacion.nombre_archivo;
        anchor.textContent = 'XXXXXXX';

        if (anchor.click) { anchor.click(); } else {
            var evt = document.createEvent('MouseEvents');
            evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
            anchor.dispatchEvent(evt);
        }
    }
})();