/**
 * Test double for https://www.youtube.com/iframe_api. YouTube refuses to play videos in
 * automated browsers ("This video is unavailable", error 150), so e2e tests replace the
 * API with this stub to exercise Meloops' own logic. Real playback is checked manually
 * (docs/youtube-feasibility.md).
 *
 * Like the real player it stops itself at endSeconds and reports PAUSED (2), and a seekTo
 * clears endSeconds. Time runs `window.__ytSpeed` times faster than real time.
 * Each iframe exposes data-video, data-state, data-time (seconds) and data-loads.
 */
(function () {
  const STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, CUED: 5 };
  class Player {
    constructor(host, options) {
      this.events = options.events || {};
      this.state = STATE.UNSTARTED;
      this.time = 0;
      this.loads = 0;
      this.videoId = null;
      this.iframe = document.createElement("iframe");
      this.iframe.title = "YouTube video player";
      this.iframe.setAttribute("data-stub", "youtube");
      this.iframe.setAttribute("width", "100%");
      this.iframe.setAttribute("height", "100%");
      this.iframe.src = "about:blank";
      host.replaceWith(this.iframe);
      window.__ytPlayers = (window.__ytPlayers || []).concat(this);
      this.sync();
      setTimeout(() => this.events.onReady && this.events.onReady({ target: this }), 10);
    }
    sync() {
      this.iframe.setAttribute("data-state", String(this.state));
      this.iframe.setAttribute("data-video", this.videoId || "");
      this.iframe.setAttribute("data-time", this.time.toFixed(1));
      this.iframe.setAttribute("data-loads", String(this.loads));
    }
    set(state) {
      this.state = state;
      this.sync();
      if (this.events.onStateChange) this.events.onStateChange({ data: state, target: this });
    }
    tick() {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (this.state !== STATE.PLAYING) return;
        this.time += 0.25 * (window.__ytSpeed || 1);
        if (this.end !== undefined && this.time >= this.end) {
          this.time = this.end;
          this.set(STATE.PAUSED);
          return;
        }
        this.sync();
      }, 250);
    }
    loadVideoById(options) {
      this.videoId = options.videoId;
      this.loads += 1;
      if (window.__ytBlocked && window.__ytBlocked.includes(options.videoId)) {
        this.sync();
        setTimeout(() => this.events.onError && this.events.onError({ data: 150, target: this }), 20);
        return;
      }
      this.time = options.startSeconds || 0;
      this.end = options.endSeconds;
      this.set(STATE.PLAYING);
      this.tick();
    }
    cueVideoById(options) {
      this.videoId = options.videoId;
      this.time = options.startSeconds || 0;
      this.end = undefined;
      this.set(STATE.CUED);
    }
    playVideo() {
      this.set(STATE.PLAYING);
      this.tick();
    }
    pauseVideo() {
      if (this.state === STATE.PLAYING) this.set(STATE.PAUSED);
    }
    seekTo(seconds) {
      this.time = seconds;
      this.end = undefined;
      this.sync();
    }
    getCurrentTime() {
      return this.time;
    }
    getDuration() {
      return this.videoId ? 300 : 0;
    }
    getPlayerState() {
      return this.state;
    }
    getVideoData() {
      return { video_id: this.videoId };
    }
    destroy() {
      clearInterval(this.timer);
      this.iframe.remove();
    }
  }
  window.YT = { Player, PlayerState: STATE };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
