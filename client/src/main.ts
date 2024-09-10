import './style.css';

import { io } from 'socket.io-client';

// global variables
let isRecording = false;
let isFirstResponse = false;
let audioChunks: BlobPart[] = [];
let mediaRecorder: MediaRecorder;

console.log("Press 'space' to start recording audio, release to stop.");

// WebSocket connection with Socket.IO
const socket = io(window.location.host, {
	auth: { user: 'yourUsername', password: 'yourPassword' }
});

// connect to the server and get the video seed when ready
socket.on('connect', () => {
	console.log('Connected to server, obtaining video seed...');
	getSeedFromCamera();
});

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
async function startRecording() {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
}

// stop recording audio
function stopRecording() {
	if (mediaRecorder) {
		mediaRecorder.stop();
		console.log('Recording stopped.');
	}
}

// send the recorded audio to the server
function sendAudioToServer(audioBlob: Blob) {
	const reader = new FileReader();
	reader.readAsArrayBuffer(audioBlob);
	reader.onloadend = () => {
		const audioBuffer = reader.result;
		socket.emit('contact', audioBuffer);
	};
}

// handle audio response from server and play it back
function handleServerResponse(data: BinaryData) {
	const audioBlob = new Blob([data], { type: 'audio/mp3' });
	const audioUrl = URL.createObjectURL(audioBlob);
	const audio = new Audio(audioUrl);
	audio.play();
}

// video capture and seed calculation
async function getSeedFromCamera() {
	const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
		stream.getTracks().forEach((track) => track.stop());
	});
}
