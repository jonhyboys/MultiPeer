'use strict';
import { CompartirArchivo } from './Compartir_Archivo.js';
const configuracion_video = {
    audio: true,
    video: {
        width: {
            ideal: 640
        },
        height: {
            ideal: 480
        },
        facingMode: "user"
    }
};
const configuracion_conexion = {
    'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }],
    mandatory: { OfferToReceiveAudio: true }
};
var glob_local_stream;
class ConexionRTC {
    constructor(nombre_sala, id, destino, socket, ofertar, es_iniciador) {
        this.mi_id = id;
        this.id_destino = destino;
        this.es_iniciador = es_iniciador;
        this.ofertar = ofertar;
        this.nombre_sala = nombre_sala;
        this.local_stream = null;
        this.socket = socket;
        this.conexion = new RTCPeerConnection(configuracion_conexion);
        this.canal_datos = this.conexion.createDataChannel(destino);
        this.compartidor_archivos = new CompartirArchivo(id, this.canal_datos, destino);

        this.obtener_video_local();
        this.configurar_canal_datos();
    }
    configurar_canal_datos() {
        this.conexion.ondatachannel = evt => {
            this.canal_datos = evt.channel;
            this.canal_datos.onmessage = evt => this.compartidor_archivos.recibir_datos(evt);
        };
        this.canal_datos.onerror = this.mostrar_error;
    }
    establecer_destino(destino) {
        this.id_destino = destino;
        this.iniciar_conexion();
    }
    obtener_video_local() {
        navigator.mediaDevices.getUserMedia(configuracion_video)
            .then(stream => this.mostrar_video_local(stream))
            .catch(this.mostrar_error);
    }
    mostrar_video_local(stream) {
        let video_local = document.getElementById('video-local');
        stream.getAudioTracks()[0].enabled = false;
        video_local.srcObject = stream;
        this.local_stream = stream;
        glob_local_stream = stream;
        if (!this.es_iniciador) {
            this.iniciar_conexion();
        }
    }
    mostrar_video_remoto(evt) {
        let video_remoto = document.getElementById(this.id_destino);
        video_remoto.srcObject = evt.streams[0];
    }
    iniciar_conexion() {
        this.conexion.addStream(this.local_stream);
        this.conexion.onicecandidate = evt => this.enviar_candidato_local(evt);
        if (this.ofertar) {
            this.conexion.onnegotiationneeded = () => this.crear_oferta();
        }
        this.conexion.ontrack = evt => this.mostrar_video_remoto(evt);
    }
    enviar_candidato_local(evt) {
        if (evt.candidate) {
            this.socket.emit('candidato', {
                socket_destino: this.id_destino,
                socket_origen: this.mi_id,
                candidato: evt.candidate
            });
        }
    }
    agregar_candidato_remoto(candidato) {
        this.conexion.addIceCandidate(candidato);
    }
    crear_oferta() {
        this.conexion.createOffer()
            .then(oferta => this.establecer_descripcion_local(oferta))
            .then(() => this.enviar_descripcion())
            .catch(this.mostrar_error);
    }
    crear_respuesta() {
        return this.conexion.createAnswer();
    }
    establecer_descripcion_local(oferta) {
        return this.conexion.setLocalDescription(oferta);
    }
    establecer_descripcion_remota(descripcion) {
        if (descripcion.type == 'offer') {
            this.conexion.setRemoteDescription(descripcion)
                .then(() => this.crear_respuesta())
                .then(oferta => this.establecer_descripcion_local(oferta))
                .then(() => this.enviar_descripcion())
                .catch(this.mostrar_error);
        } else {
            this.conexion.setRemoteDescription(descripcion)
                .catch(this.mostrar_error);
        }
    }
    enviar_descripcion() {
        this.socket.emit('descripcion', {
            socket_origen: this.mi_id,
            socket_destino: this.id_destino,
            descripcion: this.conexion.localDescription
        });
    }
    mostrar_error(error) {
        console.log(error.name + ': ' + error.message);
    }
}
export { glob_local_stream, ConexionRTC };