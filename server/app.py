import os
import io
import eventlet
import socketio
import json
from threading import Thread, Lock
from queue import Queue
from dotenv import load_dotenv
import nltk

from stt import load_whisper, transcribe_audio
from tts import load_hubert, load_bark, clone_voice, speak, convert_audio_to_mp3
from text_generator import load_generator, set_generator_seed, generate

from prompts import question_prompt, continuation_prompt

load_dotenv()

sio = socketio.Server()
app = socketio.WSGIApp(sio)

voice = ""

responses = []

speech_thread: Thread | None = None

cuda_lock = Lock()

streaming = False


@sio.event
def connect(sid: str, auth: dict[str, str]) -> None:
    if auth["user"] == os.getenv("USERNM") and auth["pass"] == os.getenv("PASSWD"):
        print(f"Contact established with '{sid}'.")
    else:
        return False


@sio.event
def disconnect(sid: str) -> None:
    print(f"Contact lost with '{sid}'.")


@sio.event
def contact(data: bytes) -> None:
    global streaming

    # stop text generation
    streaming = False

    # write the mp3 data to disk as file
    os.makedirs("temp", exist_ok=True)
    sound_path = os.path.join("temp", "message.mp3")
    with open(sound_path, "wb") as f:
        f.write(data)

    # transcribe the audio
    with cuda_lock:
        message = transcribe_audio(sound_path)
    print(f"Received message: '{message}'.")

    # clone voice
    with cuda_lock:
        voice = clone_voice(sound_path)

    # wait for previous generation to finish
    if speech_thread and speech_thread.is_alive():
        speech_thread.join()

    # start generating responses
    streaming = True
    speech_thread = Thread(target=stream_responses, args=[voice, message])
    speech_thread.start()


def stream_responses(voice: str, message: str) -> None:
    text_queue = []
    # if this is first generation
    if message:
        text_queue = generate_next_response(message)
    while streaming:
        if not len(text_queue):
            # if nothing is in queue, regenerate
            text_queue = generate_next_response()
            # use this opportunity to quit, if not required to continue
            if not streaming:
                break

        # get next item for tts
        text = text_queue.pop(0)
        print(f"Voicing response: '{text}'.")
        # generate speech
        with cuda_lock:
            speech_data = speak(voice, text)
        # if successful, send to client
        if speech_data is not None:
            mp3 = convert_audio_to_mp3(speech_data)
            sio.emit("response", mp3.read())


def generate_next_response(message: str | None = None) -> str:
    global responses

    if message:
        responses = []

        prompt = question_prompt.format(message)
    else:
        prompt = continuation_prompt.format(" ".join(responses))

    response_lines = (
        generate(
            prompt,
            max_new_tokens=128,
            do_sample=True,
        )
        .replace(prompt, "")
        .split("\n")
    )
    response_lines = [line.strip() for line in response_lines if line]
    response = response_lines[0]
    responses.append(response)

    return nltk.sent_tokenize(response)


if __name__ == "__main__":
    load_whisper()
    load_hubert()
    load_bark()
    load_generator("facebook/opt-1.3b")
    set_generator_seed(42)

    nltk.download("punkt_tab")

    eventlet.wsgi.server(eventlet.listen(("", 5000)), app)
