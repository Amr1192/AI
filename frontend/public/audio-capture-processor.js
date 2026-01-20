/**
 * Simplified Audio Capture Processor
 * More reliable - removes complex buffering
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = 24000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (input && input.length > 0 && input[0]) {
      const samples = input[0]; // Float32Array
      
      if (samples.length > 0) {
        // Convert Float32 to PCM16
        const pcm16 = new Int16Array(samples.length);
        
        for (let i = 0; i < samples.length; i++) {
          const s = Math.max(-1, Math.min(1, samples[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Send immediately
        this.port.postMessage({
          type: 'audio',
          data: pcm16.buffer
        }, [pcm16.buffer]);
      }
    }
    
    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
