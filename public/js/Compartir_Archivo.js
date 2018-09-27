'use strict';
const BYTES_POR_PEDAZO = 1200;
let archivo_entrante_informacion,
    archivo_entrante_datos,
    bytes_recibidos,
    descarga_en_progreso = false;
class CompartirArchivo {
    constructor(mi_id, canal_datos, destino) {
        this.mi_id = mi_id;
        this.canal_datos = canal_datos;
        this.id_destino = destino;
        this.archivo = null;
        this.lector = new FileReader();
        this.pedazo = 0;
    }
    establecer_archivo(archivo) {
        this.archivo = archivo;
    }
    establecer_destino(dst) {
        this.id_destino = dst;
    }
    iniciar_subida() {
        $('#share-' + this.id_destino).parent().append('<label>Enviando...</label><progress max="' + this.archivo.size + '" value="0"></progress>');
        this.canal_datos.send(JSON.stringify({
            nombre_archivo: this.archivo.name,
            tamano_archivo: this.archivo.size,
            id_usuario: this.mi_id
        }));
        this.lector.onload = ep => this.enviar_pedazo();
        this.leer_nuevo_pedazo();
    }
    enviar_pedazo() {
        this.canal_datos.send(this.lector.result);
        $('#share-' + this.id_destino).next().next().val(BYTES_POR_PEDAZO * this.pedazo);
        this.pedazo++;
        if (BYTES_POR_PEDAZO * this.pedazo < this.archivo.size) {
            this.leer_nuevo_pedazo();
        } else {
            $('#share-' + this.id_destino).next().remove();
            $('#share-' + this.id_destino).next().remove();
        }
    }
    leer_nuevo_pedazo() {
        let inicio = BYTES_POR_PEDAZO * this.pedazo;
        let fin = Math.min(this.archivo.size, inicio + BYTES_POR_PEDAZO);
        this.lector.readAsArrayBuffer(this.archivo.slice(inicio, fin));
    }
    recibir_datos(evt) {
        if (descarga_en_progreso === false) {
            this.iniciar_descarga(evt.data);
        } else {
            this.continuar_descarga(evt.data);
        }
    }
    iniciar_descarga(data) {
        archivo_entrante_informacion = JSON.parse(data.toString());
        archivo_entrante_datos = [];
        bytes_recibidos = 0;
        descarga_en_progreso = true;
        $('#share-' + archivo_entrante_informacion.id_usuario).parent().append('<label>Recibiendo...</label><progress max="' + archivo_entrante_informacion.tamano_archivo + '" value="0"></progress>');
    }
    continuar_descarga(data) {
        bytes_recibidos += data.byteLength;
        archivo_entrante_datos.push(data);
        $('#share-' + archivo_entrante_informacion.id_usuario).next().next().val(bytes_recibidos);
        if (bytes_recibidos === archivo_entrante_informacion.tamano_archivo) {
            this.terminar_descarga();
        }
    }
    terminar_descarga() {
        descarga_en_progreso = false;
        let archivo_a_descargar = new window.Blob(archivo_entrante_datos);
        let enlace = document.createElement('a');

        $('#share-' + archivo_entrante_informacion.id_usuario).next().remove();
        $('#share-' + archivo_entrante_informacion.id_usuario).next().remove();

        enlace.href = URL.createObjectURL(archivo_a_descargar);
        enlace.download = archivo_entrante_informacion.nombre_archivo;
        enlace.textContent = 'XXXXXXX';
        enlace.click();
    }
}

export { CompartirArchivo };