import openai

openai.api_key = "REPLACED"


def oai_transcribe(filename):
  audio_file = open(filename, "rb")
  transcript = openai.Audio.transcribe("whisper-1", audio_file)
  return transcript
