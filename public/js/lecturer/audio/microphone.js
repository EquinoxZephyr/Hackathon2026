// Eén verbinding met de microfoon voor twee dingen: de geluidsmeter (zodat de lector ziet dat Frank
// iets hoort) en de laatste seconden geluid voor een meertalige les.
import { LIMITS } from '/shared/protocol.js';
import { RecentAudio } from './recentAudio.js';

const WORKLET_URL = '/js/lecturer/audio/recorderWorklet.js';
const LEVEL_GAIN = 6;

const MIC_ERRORS = {
  NotAllowedError: 'Microfoon: geen toegang. Klik op het slotje links in de adresbalk en sta de microfoon toe.',
  NotFoundError: 'Microfoon: geen microfoon gevonden. Sluit er een aan of kies er een in de instellingen van je computer.',
  NotReadableError: 'Microfoon: wordt al gebruikt door een ander programma (bv. Teams of Zoom).',
};

// Zonder recente klik houdt de browser geluid soms gepauzeerd; de eerstvolgende klik zet het aan.
function resumeOnNextGesture(context) {
  if (context.state !== 'suspended') return;
  const resume = () => context.resume().catch(() => {});
  resume();
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, resume, { once: true });
}

export async function startMicrophone(onLevel) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microfoon: niet beschikbaar. Open Frank via https of via localhost.');
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw new Error(MIC_ERRORS[error.name] ?? `Microfoon: fout (${error.name})`);
  }

  const context = new AudioContext();
  resumeOnNextGesture(context);
  const source = context.createMediaStreamSource(stream);

  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let frame = 0;
  const measure = () => {
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    onLevel(Math.min(1, rms * LEVEL_GAIN));
    frame = requestAnimationFrame(measure);
  };
  measure();

  const recent = new RecentAudio(LIMITS.AUDIO_SECONDS, LIMITS.AUDIO_SAMPLE_RATE, context.sampleRate);
  await context.audioWorklet.addModule(WORKLET_URL);
  const recorder = new AudioWorkletNode(context, 'frank-recorder');
  recorder.port.onmessage = (event) => recent.push(event.data);
  source.connect(recorder);

  return {
    recentWav: () => recent.toWav(),
    stop() {
      cancelAnimationFrame(frame);
      recorder.port.onmessage = null;
      stream.getTracks().forEach((track) => track.stop());
      context.close();
      onLevel(0);
    },
  };
}
