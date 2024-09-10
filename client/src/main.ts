import './style.css';

import { io } from 'socket.io-client';

// global variables
let isRecording = false;
let isFirstResponse = false;
let audioChunks: BlobPart[] = [];
let mediaRecorder: MediaRecorder;

// request permission for microphone and video
let stream: MediaStream;
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
	} catch (error) {
		console.error(`The following getUserMedia error occurred: '${error}'.`);
	}
else console.log('getUserMedia not supported on your browser!');

// websocket connection with socket.io
const socket = io(window.location.host, {
	// auth: { user: 'seance', password: 'juergenson' }
});

console.log("Press 'space' to start recording audio, release to stop.");

// connect to the server and get the video seed when ready
socket.on('connect', () => {
	console.log('Connected to server, obtaining video seed...');
	getSeedFromCamera();
});

socket.on('disconnect', () => {
	console.log('Lost connection to the server.');
});

// handle responses
socket.on('first_response', (data) => {
	handleServerResponse(data);
	isFirstResponse = false;
});

socket.on('response', (data) => {
	if (!isFirstResponse) handleServerResponse(data);
});

// event listeners for spacebar key press/release
window.addEventListener('keydown', (event) => {
	if (event.code === 'Space' && !isRecording) {
		isRecording = true;
		startRecording();
	}
});

window.addEventListener('keyup', (event) => {
	if (event.code === 'Space' && isRecording) {
		isRecording = false;
		stopRecording();
	}
});

// start recording audio
const startRecording = () => {
	if (stream) {
		mediaRecorder = new MediaRecorder(stream);
		audioChunks = [];

		mediaRecorder.ondataavailable = (event) => {
			audioChunks.push(event.data);
		};

		mediaRecorder.onstop = () => {
			const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
			audioChunks = [];
			sendAudioToServer(audioBlob);
			isFirstResponse = true;
		};

		mediaRecorder.start();
		console.log('Recording started...');
	} else throw Error('No MediaStream found for recording.');
};

// stop recording audio
const stopRecording = () => {
	if (mediaRecorder && mediaRecorder.state === 'recording') {
		mediaRecorder.stop();
		console.log('Recording stopped.');
	}
};

// send the recorded audio to the server
const sendAudioToServer = (audioBlob: Blob) => {
	// const mp3Blob = convertToMP3(audioBlob);
	const reader = new FileReader();
	reader.readAsArrayBuffer(audioBlob);
	reader.onloadend = () => {
		const audioBuffer = reader.result;
		socket.emit('contact', audioBuffer);
	};
};

// handle audio response from server and play it back
const handleServerResponse = (data: BinaryData) => {
	const audioBlob = new Blob([data], { type: 'audio/mp3' });
	const audioUrl = URL.createObjectURL(audioBlob);
	const audio = new Audio(audioUrl);
	audio.play();
};

// video capture and seed calculation
const getSeedFromCamera = async () => {
	if (stream) {
		const video = document.createElement('video');
		video.srcObject = stream;
		video.play();

		video.addEventListener('canplay', () => {
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			if (context) {
				context.drawImage(video, 0, 0, canvas.width, canvas.height);
				const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
				const pixels = imageData.data;

				let seed = 0;
				for (let i = 0; i < pixels.length; i += 4) {
					seed += pixels[i]; // sum the red channel for simplicity
				}

				console.log(`Generated seed: ${seed}.`);
				socket.emit('seed', { seed: seed });
			}
			// stop the video stream
			stream.getTracks().forEach((track) => {
				if (track.kind === 'video') {
					track.stop();
				}
			});
		});
	} else throw Error('No MediaStream found for capturing.');
};
