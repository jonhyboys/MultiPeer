'use strict';
import { glob_local_stream, ConexionRTC } from './ConexionRTC.js';
(function() {
    var glob_nombre_sala = '';
    var glob_nombre_usuario = '';
    var glob_error = 0;
    var pcs = new Array(),
        pc_iniciador,
        mi_socket_id = 0,
        glob_es_iniciador = false,
        socket;
    //Compartir Archivos
    var usuarios_a_compartir,
        archivo_a_compartir;

    $(document).ready(function() {
        socket = io();
        $('#mostrar-lista-movil').click(function() {
            $('#contenedor-usuarios-conectados').toggleClass('visible');
            $(this).toggleClass('fa-chevron-circle-left');
            $(this).toggleClass('fa-chevron-circle-right');
        });
        $('#txt-nombre-sala, #txt-nombre-usuario').focus(function() {
            $(this).next().removeClass('error');
        });
        $('#btn-conectar').click(function(evt) {
            evt.preventDefault();
            $('#msj-sala-llena').addClass('hide');
            $('#msj-usuario-existe').addClass('hide');
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
            mi_socket_id = datos.id;
            glob_es_iniciador = true;
            pc_iniciador = new ConexionRTC(glob_nombre_sala, mi_socket_id, 0, socket, false, true);
        });
        socket.on('agregado_a_sala', function(datos) {
            $('#inicio').toggleClass('hide');
            $('#principal').toggleClass('hide');
            $('#li-nombre-sala').html('<i class="fas fa-users"></i>' + glob_nombre_sala);
            $('#li-nombre-usuario').html('<i class="fas fa-user"></i>' + glob_nombre_usuario);
            mi_socket_id = datos.id;
            for (let x = 0; x < datos.ids_conectados.length; x++) {
                $('#lista-usuarios-conectados').
                append('<li data-nombre="' + datos.usuarios_conectados[x] + '">' +
                    '<p>' + datos.usuarios_conectados[x] + '</p>' +
                    '<i class="fa fa-share-alt" aria-hidden="true" id="share-' + datos.ids_conectados[x] + '"></i>' +
                    '</li>');
                $('<video id="' + datos.ids_conectados[x] + '" autoplay src=""></video>').insertBefore('#contenedor-botones-video');
                pcs[datos.ids_conectados[x]] = new ConexionRTC(glob_nombre_sala, mi_socket_id, datos.ids_conectados[x], socket, true, false);
            }
        });
        socket.on('sala_llena', function() { $('#msj-sala-llena').removeClass('hide'); });
        socket.on('usuario_existe', function() { $('#msj-usuario-existe').removeClass('hide'); });
        socket.on('usuario_agregado', function(datos) {
            $('#lista-usuarios-conectados')
                .append('<li data-nombre=' + datos.nuevo_usuario + '>' +
                    '<p>' + datos.nuevo_usuario + '</p>' +
                    '<i class="fa fa-share-alt" aria-hidden="true" id="share-' + datos.nuevo_id + '"></i>' +
                    '</li>');
            $('<video id="' + datos.nuevo_id + '" autoplay src=""></video>').insertBefore('#contenedor-botones-video');
            if (glob_es_iniciador && pc_iniciador != undefined) {
                pc_iniciador.establecer_destino(datos.nuevo_id);
                pc_iniciador.compartidor_archivos.establecer_destino(datos.nuevo_id);
                pcs[datos.nuevo_id] = pc_iniciador;
                pc_iniciador = undefined;
                glob_es_iniciador = false;
            } else {
                pcs[datos.nuevo_id] = new ConexionRTC(glob_nombre_sala, mi_socket_id, datos.nuevo_id, socket, false, false);
            }
        });
        socket.on('descripcion', function(datos) {
            pcs[datos.socket_origen].establecer_descripcion_remota(datos.descripcion);
        });
        socket.on('candidato', function(datos) {
            pcs[datos.socket_origen].agregar_candidato_remoto(datos.candidato);
        });
        socket.on('desconectar', function(datos) {
            if (pcs[datos.id] != undefined) {
                delete pcs[datos.id];
                $('#' + datos.id).remove();
                $('#lista-usuarios-conectados li[data-nombre="' + datos.nombre + '"]').remove();
            }
        });
        socket.on('mensaje', function(datos) {
            $('#lista-mensajes')
                .append('<li><strong>' + datos.nombre_usuario + ':</strong> ' + datos.mensaje + '</li>')
                .scrollTop(1000);
        });
        socket.on('archivo', function(datos) {
            console.log(datos);
            var x = confirm("El usuario " + datos.nombre_usuario + " está intentando enviarle un archivo, desea recibirlo?");
            socket.emit('archivo_respuesta', { id_usuario_destino: datos.id_usuario, id_usuario: mi_socket_id, nombre_usuario: glob_nombre_usuario, respuesta: x });
        });
        socket.on('archivo_respuesta', function(datos) {
            console.log(datos);
            if (datos.respuesta) {
                pcs[datos.id_usuario].compartidor_archivos.establecer_archivo(archivo_a_compartir);
                pcs[datos.id_usuario].compartidor_archivos.iniciar_subida();
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

    function pedir_confirmacion_envio() {
        console.log('confirmacion');
        console.log(usuarios_a_compartir);
        for (var i = 0; i < usuarios_a_compartir.length; i++) {
            socket.emit('archivo', { id_usuario_destino: usuarios_a_compartir[i], id_usuario: mi_socket_id, nombre_usuario: glob_nombre_usuario });
        }
    }

    function seleccionar_archivo(evt) {
        var lista_archivos_seleccionados = evt.target.files;
        if (lista_archivos_seleccionados.length > 1) {
            alert('Solo puede compartir un archivo a la vez. . .');
        } else if (lista_archivos_seleccionados.length == 0) {
            alert('Debe seleccionar un archivo a compartir. . .');
        } else {
            archivo_a_compartir = lista_archivos_seleccionados[0];
            console.log(archivo_a_compartir);
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
        console.log(usuarios_a_compartir);
        $('#selector-archivos').click();
    }
})();