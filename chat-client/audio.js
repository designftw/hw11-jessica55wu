let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let mediaRecorder;
let recordedChunks = [];

function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.addEventListener('dataavailable', event => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            });

            mediaRecorder.addEventListener('stop', () => {
                let audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
                let audioUrl = URL.createObjectURL(audioBlob);
                let audio = new Audio(audioUrl);
                audio.controls = true;

                document.querySelector('#recordedAudio').innerHTML = '';
                document.querySelector('#recordedAudio').appendChild(audio);
            });

            mediaRecorder.start();
        })
        .catch(err => {
            console.error('Error: ', err);
        });
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordedChunks = [];
    }
}
