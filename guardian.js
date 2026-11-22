
const StudyGuardian = {
  stream: null,
  detector: null,
  active: false,
  present: false,
  checking: false,
  absenceStarted: null,
  absenceDelay: 5000,
  lastWarning: 0,
  warningInterval: 12000,
  checkTimer: null,
  browserVisible: !document.hidden,
  windowFocused: document.hasFocus(),
  cameraReady: false,

  async enableCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      GuardianApp.log("Camera access is not supported by this browser.");
      return false;
    }

    if (!("FaceDetector" in window)) {
      GuardianApp.log(
        "Native face detection is unavailable in this browser. Webcam presence checking cannot start yet."
      );
      GuardianApp.setCameraStatus("Face detection unsupported");
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      const video = document.getElementById("cameraPreview");
      video.srcObject = this.stream;
      video.hidden = false;

      await video.play();

      this.detector = new FaceDetector({
        fastMode: true,
        maxDetectedFaces: 1
      });

      this.cameraReady = true;
      this.present = false;

      GuardianApp.setCameraStatus("Camera active");
      GuardianApp.log("Webcam activated. Face presence checking is ready.");

      if (this.active) this.startChecking();

      return true;
    } catch (error) {
      GuardianApp.log("Camera could not start: " + error.message);
      GuardianApp.setCameraStatus("Camera unavailable");
      this.disableCamera();
      return false;
    }
  },

  disableCamera() {
    this.stopChecking();

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    this.stream = null;
    this.detector = null;
    this.cameraReady = false;
    this.present = false;

    const video = document.getElementById("cameraPreview");
    if (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
    }

    GuardianApp.setCameraStatus("Not activated");
    GuardianApp.log("Webcam Guardian disabled.");
  },

  start() {
    this.active = true;
    this.browserVisible = !document.hidden;
    this.windowFocused = document.hasFocus();

    document.addEventListener("visibilitychange", this.handleVisibility);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("focus", this.handleFocus);

    if (this.cameraReady) {
      this.startChecking();
    } else {
      GuardianApp.log("Browser activity monitoring started. Enable webcam for desk-presence detection.");
    }

    this.evaluatePresence();
  },

  stop() {
    this.active = false;
    this.stopChecking();

    document.removeEventListener("visibilitychange", this.handleVisibility);
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("focus", this.handleFocus);

    this.absenceStarted = null;
    this.present = false;
  },

  startChecking() {
    if (!this.cameraReady || this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      this.checkFace();
    }, 1200);

    this.checkFace();
  },

  stopChecking() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  },

  async checkFace() {
    if (!this.active || !this.cameraReady || this.checking) return;

    const video = document.getElementById("cameraPreview");
    if (!video || video.readyState < 2) return;

    this.checking = true;

    try {
      const faces = await this.detector.detect(video);
      this.setPresence(faces.length > 0);
    } catch (error) {
      GuardianApp.log("Face detection temporarily unavailable.");
    } finally {
      this.checking = false;
    }
  },

  setPresence(found) {
    if (!this.active) return;

    this.present = found;
    this.evaluatePresence();
  },

  evaluatePresence() {
    if (!this.active) return;

    const browserAvailable =
      this.browserVisible && this.windowFocused;

    const isPresent = browserAvailable &&
      (!this.cameraReady || this.present);

    if (isPresent) {
      this.absenceStarted = null;

      if (GuardianApp.isDistractionPaused()) {
        GuardianApp.resumeAfterReturn();
        GuardianVoice.welcomeBack();
        GuardianApp.log("Presence detected. Study timer resumed.");
      }

      return;
    }

    if (this.absenceStarted === null) {
      this.absenceStarted = Date.now();
      return;
    }

    const absentFor = Date.now() - this.absenceStarted;

    if (absentFor >= this.absenceDelay) {
      this.triggerDistraction();
    }
  },

  triggerDistraction() {
    if (!this.active || !GuardianApp.isStudyRunning()) return;

    if (!GuardianApp.isDistractionPaused()) {
      GuardianApp.pauseForDistraction();
      GuardianApp.log("Possible distraction detected. Study timer paused.");
      SmartStorage.addDistraction();
      this.lastWarning = 0;
    }

    const now = Date.now();

    if (now - this.lastWarning >= this.warningInterval) {
      GuardianVoice.warning();
      this.lastWarning = now;
    }
  },

  handleVisibility: () => {
    StudyGuardian.browserVisible = !document.hidden;
    StudyGuardian.evaluatePresence();
  },

  handleBlur: () => {
    StudyGuardian.windowFocused = false;
    StudyGuardian.evaluatePresence();
  },

  handleFocus: () => {
    StudyGuardian.windowFocused = true;
    StudyGuardian.evaluatePresence();
  }
};
