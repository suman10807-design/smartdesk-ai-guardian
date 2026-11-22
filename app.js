
const GuardianApp = {
  state: "ready",
  remainingMs: 0,
  endAt: null,
  studyInterval: null,
  lastTick: Date.now(),
  totalStudySeconds: 0,
  sessionStarted: false,
  recognition: null,

  elements: {},

  init() {
    this.elements = {
      timer: document.getElementById("timer"),
      timerLabel: document.getElementById("timerLabel"),
      timerMessage: document.getElementById("timerMessage"),
      status: document.getElementById("sessionStatus"),
      hours: document.getElementById("studyHours"),
      minutes: document.getElementById("studyMinutes"),
      reply: document.getElementById("assistantReply"),
      log: document.getElementById("activityLog"),
      report: document.getElementById("focusReport")
    };

    this.bindEvents();
    this.loadReport();
    this.renderTimer();
    this.log("SMARTDESK AI systems initialized.");
    this.reply("Hello! I am your AI study guardian. How can I help you?");
  },

  bindEvents() {
    document.getElementById("startBtn").addEventListener("click", () => {
      this.startStudy();
    });

    document.getElementById("pauseBtn").addEventListener("click", () => {
      this.togglePause();
    });

    document.getElementById("endBtn").addEventListener("click", () => {
      this.endStudy();
    });

    document.getElementById("cameraBtn").addEventListener("click", async () => {
      if (StudyGuardian.cameraReady) {
        StudyGuardian.disableCamera();
      } else {
        await StudyGuardian.enableCamera();
      }
    });

    document.getElementById("voiceBtn").addEventListener("click", () => {
      GuardianVoice.test();
    });

    document.getElementById("breakBtn").addEventListener("click", () => {
      const minutes = Number(
        document.getElementById("breakMinutes").value
      );

      StudyScheduler.startBreak(minutes, "REST");
    });

    document.getElementById("sendBtn").addEventListener("click", () => {
      this.sendCommand();
    });

    document.getElementById("commandInput").addEventListener("keydown", event => {
      if (event.key === "Enter") this.sendCommand();
    });

    document.getElementById("micBtn").addEventListener("click", () => {
      this.startVoiceRecognition();
    });

    window.addEventListener("beforeunload", () => {
      if (StudyGuardian.stream) {
        StudyGuardian.disableCamera();
      }
    });
  },

  startStudy() {
    if (this.state === "studying" || this.state === "distraction-paused") {
      this.reply("A study session is already active.");
      return;
    }

    if (this.state === "break") {
      this.reply("Your break is active. Finish it before starting another session.");
      return;
    }

    const hours = Number(this.elements.hours.value);
    const minutes = Number(this.elements.minutes.value);

    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 99 ||
      minutes < 0 ||
      minutes > 59 ||
      (hours === 0 && minutes === 0)
    ) {
      this.reply("Please enter a valid study duration.");
      return;
    }

    this.remainingMs = (hours * 3600 + minutes * 60) * 1000;
    this.totalStudySeconds = 0;
    this.sessionStarted = true;
    this.state = "studying";
    this.endAt = Date.now() + this.remainingMs;

    StudyGuardian.start();
    this.startStudyClock();

    SmartStorage.addSession();

    this.setStatus("STUDY SESSION ACTIVE");
    this.elements.timerLabel.textContent = "STUDY TIME";
    this.elements.timerMessage.textContent = "Stay focused. Guardian is active.";

    this.log("Study session started: " + hours + " hours, " + minutes + " minutes.");
    this.reply("Study session started. Guardian Mode is active. Let's focus.");
    this.renderTimer();
  },

  startStudyClock() {
    clearInterval(this.studyInterval);
    this.lastTick = Date.now();

    this.studyInterval = setInterval(() => {
      if (this.state !== "studying") return;

      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - this.lastTick) / 1000));
      this.lastTick = now;

      if (elapsed > 0) {
        this.totalStudySeconds += elapsed;
        SmartStorage.addStudyTime(elapsed);
      }

      this.remainingMs = Math.max(0, this.endAt - now);
      this.renderTimer();
      this.loadReport();

      if (this.remainingMs <= 0) {
        this.completeStudy();
      }
    }, 250);
  },

  pauseStudy() {
    if (this.state !== "studying") return;

    this.remainingMs = Math.max(0, this.endAt - Date.now());
    this.state = "manually-paused";
    this.endAt = null;

    this.setStatus("STUDY PAUSED");
    this.elements.timerMessage.textContent = "Session paused.";
    this.renderTimer();
    this.log("Study session manually paused.");
  },

  resumeStudy() {
    if (this.state !== "manually-paused") return;

    this.state = "studying";
    this.endAt = Date.now() + this.remainingMs;
    this.lastTick = Date.now();

    StudyGuardian.start();

    this.setStatus("STUDY SESSION ACTIVE");
    this.elements.timerMessage.textContent = "Welcome back. Continue studying.";
    this.log("Study session resumed.");
  },

  togglePause() {
    if (this.state === "studying") {
      this.pauseStudy();
    } else if (this.state === "manually-paused") {
      this.resumeStudy();
    } else {
      this.reply("There is no active study session to pause or resume.");
    }
  },

  pauseForDistraction() {
    if (this.state !== "studying") return;

    this.remainingMs = Math.max(0, this.endAt - Date.now());
    this.endAt = null;
    this.state = "distraction-paused";

    this.setStatus("POSSIBLE DISTRACTION");
    this.elements.timerMessage.textContent = "Timer automatically paused. Return to your desk.";
    this.renderTimer();
  },

  resumeAfterReturn() {
    if (this.state !== "distraction-paused") return;

    this.state = "studying";
    this.endAt = Date.now() + this.remainingMs;
    this.lastTick = Date.now();

    this.setStatus("STUDY SESSION ACTIVE");
    this.elements.timerMessage.textContent = "Presence detected. Timer resumed.";
    this.renderTimer();
  },

  pauseForBreak() {
    if (this.state === "studying") {
      this.remainingMs = Math.max(0, this.endAt - Date.now());
    }

    this.endAt = null;
    this.state = "break";
    this.setStatus("APPROVED BREAK");
    this.elements.timerLabel.textContent = "BREAK TIME";
    this.elements.timerMessage.textContent = "Enjoy your break.";
    this.renderTimer();
  },

  finishBreak() {
    this.elements.timerLabel.textContent = "STUDY TIME";

    if (this.state !== "break") return;

    this.state = "studying";
    this.endAt = Date.now() + this.remainingMs;
    this.lastTick = Date.now();

    this.setStatus("STUDY SESSION ACTIVE");
    this.elements.timerMessage.textContent = "Break finished. Back to studying.";
    this.renderTimer();
  },

  showBreakTime(seconds) {
    this.elements.timerLabel.textContent = "BREAK TIME";
    this.elements.timer.textContent = this.formatTime(seconds);
    this.elements.timerMessage.textContent = "Relax. Your study timer is paused.";
  },

  isStudyRunning() {
    return this.state === "studying";
  },

  isDistractionPaused() {
    return this.state === "distraction-paused";
  },

  setStatus(message) {
    this.elements.status.textContent = message;
  },

  setCameraStatus(message) {
    document.getElementById("cameraStatus").textContent = message;
    document.getElementById("cameraBtn").textContent =
      StudyGuardian.cameraReady ? "Disable camera" : "Enable camera";
  },

  renderTimer() {
    if (this.state === "break" && StudyScheduler.active) {
      this.showBreakTime(StudyScheduler.remainingSeconds);
      return;
    }

    this.elements.timer.textContent = this.formatTime(
      Math.ceil(this.remainingMs / 1000)
    );
  },

  formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
      .map(value => String(value).padStart(2, "0"))
      .join(":");
  },

  completeStudy() {
    clearInterval(this.studyInterval);
    this.studyInterval = null;
    this.remainingMs = 0;
    this.endAt = null;

    StudyGuardian.stop();
    StudyScheduler.cancel();

    this.state = "completed";
    this.setStatus("STUDY TARGET COMPLETED");
    this.elements.timerMessage.textContent = "Excellent work. Your target is complete.";
    this.renderTimer();

    GuardianVoice.speak("STUDY TARGET COMPLETED. EXCELLENT WORK.", true);
    this.log("Study target completed.");
    this.reply("Congratulations! You completed your study target.");
  },

  endStudy() {
    if (this.state === "ready") {
      this.reply("No study session is currently active.");
      return;
    }

    if (this.state === "studying") {
      this.remainingMs = Math.max(0, this.endAt - Date.now());
    }

    clearInterval(this.studyInterval);
    this.studyInterval = null;

    StudyScheduler.cancel();
    StudyGuardian.stop();

    this.endAt = null;
    this.state = "ready";
    this.elements.timerLabel.textContent = "STUDY TIME";
    this.elements.timerMessage.textContent = "Session ended. You can start again.";
    this.setStatus("READY TO FOCUS");

    this.log("Study session ended.");
    this.reply("Your study session has ended.");
    this.renderTimer();
  },

  loadReport() {
    const report = SmartStorage.getToday();
    const minutes = Math.floor(report.studySeconds / 60);

    this.elements.report.textContent = minutes + " minutes studied";
  },

  log(message) {
    if (!this.elements.log) return;

    const item = document.createElement("li");
    item.textContent = new Date().toLocaleTimeString() + " — " + message;

    this.elements.log.prepend(item);

    while (this.elements.log.children.length > 20) {
      this.elements.log.lastElementChild.remove();
    }
  },

  reply(message, speak = true) {
    this.elements.reply.textContent = message;

    if (speak) {
      GuardianVoice.speak(message);
    }
  },

  sendCommand() {
    const input = document.getElementById("commandInput");
    const command = input.value.trim().toLowerCase();

    if (!command) return;

    input.value = "";
    this.log("You: " + command);

    if (command.includes("start")) {
      this.startStudy();
    } else if (command.includes("dinner")) {
      const match = command.match(/(\d+)\s*minutes?/);
      StudyScheduler.startBreak(match ? Number(match[1]) : 30, "DINNER");
    } else if (command.includes("break") || command.includes("rest")) {
      const match = command.match(/(\d+)\s*minutes?/);
      StudyScheduler.startBreak(match ? Number(match[1]) : 15, "REST");
    } else if (command.includes("how much") || command.includes("time left")) {
      this.reply("You have " + this.formatTime(
        Math.ceil(this.remainingMs / 1000)
      ) + " remaining.");
    } else if (command.includes("pause")) {
      if (this.state === "studying") {
        this.pauseStudy();
        this.reply("Study session paused.");
      } else {
        this.reply("The study session cannot be paused right now.");
      }
    } else if (command.includes("resume") || command.includes("continue")) {
      if (this.state === "manually-paused") {
        this.resumeStudy();
        this.reply("Study session resumed.");
      } else {
        this.reply("There is no manually paused session to resume.");
      }
    } else if (command.includes("stop") || command.includes("end session")) {
      this.endStudy();
    } else if (command.includes("hello") || command.includes("hi")) {
      this.reply("Hello! I am online and ready to help you study.");
    } else if (command.includes("camera")) {
      this.reply("Use the Enable Camera button to activate webcam Guardian.");
    } else {
      this.reply("I did not understand that command. Try start studying, take a 15 minute break, or tell me how much time is left.");
    }
  },

  startVoiceRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.reply("Voice recognition is not supported in this browser. You can type your commands instead.");
      return;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {}
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = "en-IN";
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.reply("I am listening. Speak your command.", false);
    };

    this.recognition.onresult = event => {
      const command = event.results[0][0].transcript;
      document.getElementById("commandInput").value = command;
      this.sendCommand();
    };

    this.recognition.onerror = event => {
      this.reply("Voice recognition error: " + event.error + ". You can type your command instead.");
    };

    this.recognition.start();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  GuardianApp.init();
});
