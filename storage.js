
const SmartStorage = {
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem("smartdesk_" + key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.error("Storage read error:", error);
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem("smartdesk_" + key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Storage save error:", error);
      return false;
    }
  },

  addStudyTime(seconds) {
    const today = new Date().toLocaleDateString("en-CA");
    const report = this.get("daily_report", {});

    if (!report[today]) {
      report[today] = {
        studySeconds: 0,
        breakSeconds: 0,
        distractions: 0,
        sessions: 0
      };
    }

    report[today].studySeconds += seconds;
    this.set("daily_report", report);
  },

  addBreakTime(seconds) {
    const today = new Date().toLocaleDateString("en-CA");
    const report = this.get("daily_report", {});

    if (!report[today]) {
      report[today] = {
        studySeconds: 0,
        breakSeconds: 0,
        distractions: 0,
        sessions: 0
      };
    }

    report[today].breakSeconds += seconds;
    this.set("daily_report", report);
  },

  addDistraction() {
    const today = new Date().toLocaleDateString("en-CA");
    const report = this.get("daily_report", {});

    if (!report[today]) {
      report[today] = {
        studySeconds: 0,
        breakSeconds: 0,
        distractions: 0,
        sessions: 0
      };
    }

    report[today].distractions += 1;
    this.set("daily_report", report);
  },

  addSession() {
    const today = new Date().toLocaleDateString("en-CA");
    const report = this.get("daily_report", {});

    if (!report[today]) {
      report[today] = {
        studySeconds: 0,
        breakSeconds: 0,
        distractions: 0,
        sessions: 0
      };
    }

    report[today].sessions += 1;
    this.set("daily_report", report);
  },

  getToday() {
    const today = new Date().toLocaleDateString("en-CA");
    const report = this.get("daily_report", {});

    return report[today] || {
      studySeconds: 0,
      breakSeconds: 0,
      distractions: 0,
      sessions: 0
    };
  }
};
