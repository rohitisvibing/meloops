/**
 * Test double for https://open.spotify.com/embed/iframe-api/v1.
 * Default: behaves like the embed when Spotify serves a 30-second preview.
 * With `window.__spotifyFull = true`: a full-length track (233 s) whose position ticks
 * `window.__spotifySpeed` times faster than real time and responds to seek.
 * Each iframe exposes data-uri, data-paused, data-position (seconds) and data-loads.
 */
(function () {
  const api = {
    createController(host, options, callback) {
      const iframe = document.createElement("iframe");
      iframe.title = "Spotify Embed";
      iframe.setAttribute("data-stub", "spotify");
      iframe.src = "about:blank";
      iframe.height = String(options.height || 152);
      host.replaceWith(iframe);
      const listeners = {};
      const emit = (event, data) => (listeners[event] || []).forEach((cb) => cb({ data }));
      const full = () => Boolean(window.__spotifyFull);
      const state = { uri: options.uri, position: 0, paused: true, loads: 0, timer: null };
      const sync = () => {
        iframe.setAttribute("data-uri", state.uri);
        iframe.setAttribute("data-paused", String(state.paused));
        iframe.setAttribute("data-position", (state.position / 1000).toFixed(1));
        iframe.setAttribute("data-loads", String(state.loads));
      };
      const update = () => {
        sync();
        emit("playback_update", {
          playingURI: state.uri,
          isPaused: state.paused,
          isBuffering: false,
          duration: full() ? 233000 : 30000,
          position: state.position,
        });
      };
      const tick = () => {
        clearInterval(state.timer);
        state.timer = setInterval(() => {
          if (state.paused) return;
          state.position += 250 * (window.__spotifySpeed || 1);
          update();
        }, 250);
      };
      sync();
      const controller = {
        addListener(event, cb) {
          (listeners[event] = listeners[event] || []).push(cb);
        },
        loadUri(next, _preferVideo, startAt) {
          state.uri = next;
          state.loads += 1;
          state.position = full() ? (startAt || 0) * 1000 : 1000;
          sync();
        },
        play() {
          setTimeout(() => {
            state.paused = false;
            emit("playback_started", { playingURI: state.uri });
            update();
            if (full()) tick();
          }, 30);
        },
        pause() {
          state.paused = true;
          update();
        },
        resume() {
          state.paused = false;
          update();
          if (full()) tick();
        },
        seek(seconds) {
          if (full()) state.position = seconds * 1000;
          update();
        },
        destroy() {
          clearInterval(state.timer);
          iframe.remove();
        },
      };
      callback(controller);
    },
  };
  if (window.onSpotifyIframeApiReady) window.onSpotifyIframeApiReady(api);
})();
