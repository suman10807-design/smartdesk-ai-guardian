
const GuardianVoice = {
  enabled: true,
  speaking: false,

  speak(message, priority = false) {
    if (!this.enabled || !("speechSynthesis" in window)) {
      return;
    }

    if (priority) {
      window.speechSynthesis.cancel();
    } else if (window.speechSynthesis.speaking) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(message);

    utterance.rate = 0.88;
    utterance.pitch = 0.65;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice =>
      /en-US|en-GB/i.test(voice.lang)
    );

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      this.speaking = true;
    };

    utterance.onend = () => {
      this.speaking = false;
    };

    utterance.onerror = () => {
      this.speaking = false;
    };

    window.speechSynthesis.speak(utterance);
  },

  warning() {
    this.speak(
      "DISTRACTION. DISTRACTION. RETURN TO YOUR STUDY.",
      true
    );
  },

  welcomeBack() {
    this.speak("WELCOME BACK. RESUMING YOUR STUDY SESSION.");
  },

  breakStarted(minutes) {
    this.speak(
      "BREAK APPROVED. YOU HAVE " + minutes + " MINUTES. RELAX."
    );
  },

  breakFinished() {
    this.speak("BREAK OVER. PLEASE RETURN TO YOUR STUDY.", true);
  },

  test() {
    this.speak("SMARTDESK AI GUARDIAN SYSTEM ONLINE. FOCUS MODE ACTIVATED.", true);
  },

  setEnabled(value) {
    this.enabled = Boolean(value);

    if (!this.enabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  },

  stop() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    this.speaking = false;
  }
};
