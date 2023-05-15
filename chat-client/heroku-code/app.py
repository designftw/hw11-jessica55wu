from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import librosa
from oai import oai_transcribe
import base64
import soundfile as sf


app = Flask(__name__)
CORS(app)


@app.route('/')
def hello():
  return 'Hello, World!'


@app.route('/ping')
def ching():
  return 'pong!'


@app.route('/transcribe')
def transcribe():
  return oai_transcribe(None)


@app.route('/recv', methods=['POST'])
def receive_audio():
  audio_blob = request.files['audio']
  print(audio_blob)

  # Create a temporary file and save the uploaded file data to it
  with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
    audio_blob.save(temp_file.name)

    # Load the audio file using librosa
    y, sr = librosa.load(temp_file.name)
    # librosa.output.write_wav("tmp.wav", y, sr)

  with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
    sf.write(temp_file, y, sr)
    transcript = oai_transcribe(temp_file.name)

  print(transcript)

  return transcript


if __name__ == '__main__':
  app.run("0.0.0.0", port="80")
