/**
 * Command-Grade Audio Service
 * Uses Web Audio API to generate high-quality synth chimes programmatically.
 * Avoids dependency on external audio files and ensures instant playback.
 */

class AudioService {
    private context: AudioContext | null = null;
    private isEnabled: boolean = false;

    /**
     * Unlocks the audio context. 
     * Must be called in response to a user interaction (click, touch).
     */
    public async unlock(): Promise<boolean> {
        if (!this.context) {
            this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        if (this.context.state === 'suspended') {
            await this.context.resume();
        }

        this.isEnabled = true;
        console.log('Audio System: ARMED');
        return true;
    }

    public get status() {
        return this.isEnabled;
    }

    /**
     * Plays a signature Command-Grade tone
     */
    public play(type: 'intel' | 'alert' | 'success') {
        if (!this.isEnabled || !this.context) return;

        switch (type) {
            case 'intel':
                this.playIntelChime();
                break;
            case 'alert':
                this.playUrgentAlert();
                break;
            case 'success':
                this.playSuccessChime();
                break;
        }
    }

    private createOscillator(freq: number, type: OscillatorType = 'sine', duration: number = 0.5) {
        if (!this.context) return;
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.context.currentTime);

        gain.gain.setValueAtTime(0, this.context.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, this.context.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.context.destination);

        osc.start();
        osc.stop(this.context.currentTime + duration);
    }

    /**
     * Soft High-Pitch Synth Chime (Routine Intel)
     */
    private playIntelChime() {
        // High G note
        this.createOscillator(783.99, 'sine', 0.6);
        // Harmonic G
        setTimeout(() => this.createOscillator(1567.98, 'sine', 0.4), 50);
    }

    /**
     * Dual-Tone Urgent Pulse (Critical Alert)
     */
    private playUrgentAlert() {
        const now = this.context!.currentTime;
        // Low Tense Note
        this.createOscillator(220, 'triangle', 0.8);
        
        // Rapid pulses
        [0, 150, 300].forEach(delay => {
            setTimeout(() => {
                this.createOscillator(880, 'square', 0.15); // High piercing pulse
            }, delay);
        });
    }

    /**
     * Rising Success Note
     */
    private playSuccessChime() {
        this.createOscillator(523.25, 'sine', 0.4); // C5
        setTimeout(() => this.createOscillator(659.25, 'sine', 0.4), 100); // E5
        setTimeout(() => this.createOscillator(783.99, 'sine', 0.6), 200); // G5
    }
}

export const audioService = new AudioService();
