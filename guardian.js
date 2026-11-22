
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
  visionModule: null,

  async loadFaceDetector() {
    if (this.detector) return true;

    GuardianApp.setCameraStatus("Loading face detection...");

    try {
      const vision = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
      );

      this.visionModule = vision;

      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      this.detector = await vision.FaceDetector.createFromOptions(
        fileset,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5
        }
      );

      return true;
    } catch (error) {
      console.error("Face detector loading error:", error);
      GuardianApp.log("Could not load face detection. Check your internet connection.");
      GuardianApp.setCameraStatus("Face detection unavailable");
      return false;
    }
  },

  async enableCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      GuardianApp.log("Camera access is not supported by this browser.");
      GuardianApp.setCameraStatus("Camera unsupported");
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

      if (!video) {
        throw new Error("Camera preview element was not found.");
      }

      video.srcObject = this.stream;
      video.hidden = false;
      await video.play();

      const loaded = await this.loadFaceDetector();

      if (!loaded) {
        this.disableCamera();
        return false;
      }

      this.cameraReady = true;
      this.present = false;

      GuardianApp.setCameraStatus("Camera active");
      GuardianApp.log("Camera and face detection activated.");

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
    this.cameraReady = false;
    this.present = false;

    if (this.detector) {
      this.detector.close();
      this.detector = null;
    }

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
      GuardianApp.log("Browser activity monitoring started. Enable webcam for face detection.");
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

  async checkFace() {
    if (!this.active || !this.cameraReady || this.checking) return;

    const video = document.getElementById("cameraPreview");

    if (!video || video.readyState < 2) return;

    this.checking = true;

    try {
      const result = this.detector.detectForVideo(
        video,
        performance.now()
      );

      const faces = result.detections || [];
      this.setPresence(faces.length > 0);
    } catch (error) {
      console.error("Face detection error:", error);
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

    const isPresent =
      browserAvailable && (!this.cameraReady || this.present);

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
