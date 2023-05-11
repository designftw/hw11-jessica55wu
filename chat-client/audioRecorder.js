export class recordAudio {

    async initialize() {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.addEventListener("dataavailable", (event) => {
            this.audioChunks.push(event.data);
        });
    }

    start() {
        this.audioChunks.length = 0;
        this.mediaRecorder.start();
    }

    stop() {
        const promise = new Promise((resolve) => {
            this.mediaRecorder.addEventListener("stop", () => {
                const audioBlob = new Blob(this.audioChunks);
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                const play = () => audio.play();
                resolve({audioBlob, audioUrl, play});
            });
        });
        this.mediaRecorder.stop();
        return promise;
    }
}