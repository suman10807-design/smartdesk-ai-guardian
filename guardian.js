
const StudyGuardian = {
  stream: null,
  detector: null,
  active: false,
  present: false,
  checking: false,
  absenceStarted: null,
  absenceDelay: 5000,
  lastWarning: 0,
  warningInterval: 5000,
  checkTimer: null,
  browserVisible: !document.hidden,
  windowFocused: document.hasFocus(),
  cameraReady: false,

  baselineYaw: null,
  calibrationSamples: [],
  calibrationFrames: 30,
  yawThreshold: 0.18,

  async loadFaceDetector() {
    try {
      const vision = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
      );

      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      this.detector = await vision.FaceLandmarker.createFromOptions(
        fileset,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        }
      );

      return true;
    } catch (error) {
      console.error("Face Landmarker error:", error);
      GuardianApp.log("Could not load head detection. Check your internet connection.");
      GuardianApp.setCameraStatus("Detection unavailable");
      return false;
    }
  },

  async enableCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      GuardianApp.setCameraStatus("Camera unsupported");
      GuardianApp.log("Camera access is not supported.");
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
        throw new Error("Camera preview element not found.");
      }

      video.srcObject = this.stream;
      video.hidden = false;
      await video.play();

      GuardianApp.setCameraStatus("Loading detection...");

      const loaded = await this.loadFaceDetector();

      if (!loaded) {
        this.disableCamera();
        return false;
      }

      this.cameraReady = true;
      this.present = false;
      this.baselineYaw = null;
      this.calibrationSamples = [];

      GuardianApp.setCameraStatus("Camera active");
      GuardianApp.log("Camera active. Face the camera for initial calibration.");

      if (this.active) this.startChecking();

      return true;

    } catch (error) {
      console.error(error);
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

    if (this.detector) {
      this.detector.close();
    }

    this.detector = null;
    this.cameraReady = false;
    this.present = false;
    this.baselineYaw = null;
    this.calibrationSamples = [];

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
      GuardianApp.log("Browser activity monitoring started. Enable webcam for head monitoring.");
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
    }, 500);

    this.checkFace();
  },

  getHeadDirection(landmarks) {
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const nose = landmarks[1];

    if (!leftEye || !rightEye || !nose) return null;

    const eyeMiddle = (leftEye.x + rightEye.x) / 2;
    const eyeDistance = Math.abs(rightEye.x - leftEye.x);

    if (eyeDistance < 0.001) return null;

    return (nose.x - eyeMiddle) / eyeDistance;
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

      const faces = result.faceLandmarks || [];

      if (faces.length === 0) {
        this.setPresence(false);
        return;
      }

      const yaw = this.getHeadDirection(faces[0]);

      if (yaw === null) return;

      // Calibrate while the student faces the camera.
      if (this.baselineYaw === null) {
        this.calibrationSamples.push(yaw);

        if (this.calibrationSamples.length >= this.calibrationFrames) {
          const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
          this.baselineYaw = sorted[Math.floor(sorted.length / 2)];

          GuardianApp.log("Head direction calibrated. Focus monitoring active.");
        }

        this.setPresence(true);
        return;
      }

      const deviation = Math.abs(yaw - this.baselineYaw);
      const facingForward = deviation < this.yawThreshold;

      this.setPresence(facingForward);

    } catch (error) {
      console.error("Head detection error:", error);
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
        GuardianApp.log("Focus returned. Study timer resumed.");
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

