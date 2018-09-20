const BYTES_POR_PEDAZO = 1200;
class CompartirArchivo {
    constructor(mi_id, cd, dst) {
        this.mi_id = mi_id;
        this.canal_datos = cd;
        this.destino = dst;
        this.archivo = null;
        this.lector = new FileReader();
        this.pedazo = 0;
    }
    set_archivo(arc) {
        this.archivo = arc;
    }
    set_destino(dst) {
        this.destino = dst;
    }
    iniciar() {
        $('#share-' + this.destino).parent().append('<label>Enviando...</label><progress max="' + this.archivo.size + '" value="0"></progress>');
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
        $('#share-' + this.destino).next().next().val(BYTES_POR_PEDAZO * this.pedazo);
        this.pedazo++;
        if (BYTES_POR_PEDAZO * this.pedazo < this.archivo.size) {
            this.leer_nuevo_pedazo();
        } else {
            $('#share-' + this.destino).next().remove();
            $('#share-' + this.destino).next().remove();
        }
    }
    leer_nuevo_pedazo() {
        var inicio = BYTES_POR_PEDAZO * this.pedazo;
        var fin = Math.min(this.archivo.size, inicio + BYTES_POR_PEDAZO);
        this.lector.readAsArrayBuffer(this.archivo.slice(inicio, fin));
    }
}