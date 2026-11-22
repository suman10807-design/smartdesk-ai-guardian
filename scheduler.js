
const StudyScheduler = {
  breakTimer: null,
  breakEndTime: null,
  remainingSeconds: 0,
  active: false,

  startBreak(minutes, type = "REST") {
    const duration = Number(minutes);

    if (!Number.isFinite(duration) || duration < 1 || duration > 180) {
      GuardianApp.log("Please choose a break between 1 and 180 minutes.");
      return;
    }

    if (this.active) {
      this.endBreak(false);
    }

    GuardianApp.pauseForBreak();

    this.active = true;
    this.remainingSeconds = Math.round(duration * 60);
    this.breakEndTime = Date.now() + this.remainingSeconds * 1000;

    GuardianVoice.breakStarted(duration);

    GuardianApp.setStatus(type + " BREAK");
    GuardianApp.log(type + " break started for " + duration + " minutes.");

    this.update();
    this.breakTimer = setInterval(() => this.update(), 500);
  },

  update() {
    if (!this.active) return;

    this.remainingSeconds = Math.max(
      0,
      Math.ceil((this.breakEndTime - Date.now()) / 1000)
    );

    GuardianApp.showBreakTime(this.remainingSeconds);

    if (this.remainingSeconds <= 0) {
      this.endBreak(true);
    }
  },

  endBreak(announce = true) {
    if (!this.active) return;

    clearInterval(this.breakTimer);
    this.breakTimer = null;
    this.active = false;
    this.breakEndTime = null;
    this.remainingSeconds = 0;

    GuardianApp.finishBreak();

    if (announce) {
      GuardianVoice.breakFinished();
      GuardianApp.log("Break finished. Study session resumed.");
    }
  },

  cancel() {
    if (this.active) {
      this.endBreak(false);
    }
  }
};
