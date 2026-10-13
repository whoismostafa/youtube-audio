# youtube-audio

A tiny, dependency-free custom element that plays a YouTube video as **audio only**.
The player is hidden; you get a clean round play/pause button with a live progress ring.

```html
<script src="youtube-audio.js"></script>
<youtube-audio video="https://www.youtube.com/watch?v=VIDEO_ID" loop resume label="My audio"></youtube-audio>
```

## Features

- Single file, no dependencies
- Built-in SVG icons (no external images)
- Animated button: progress ring, pulse while playing, loading spinner
- Autoplay fallback: if the browser blocks sound, playback starts on the first click, tap, or key press
- `resume`: remembers the last position between visits
- Media keys and lock-screen controls (Media Session API)
- Accepts a video ID or any common YouTube URL (watch, youtu.be, embed, shorts)
- Safe loading: the YouTube API is loaded once and any existing `onYouTubeIframeAPIReady` is preserved
- Keyboard accessible, respects `prefers-reduced-motion`

## Attributes

| Attribute  | Description                                                        |
| ---------- | ------------------------------------------------------------------ |
| `video`    | YouTube video ID or URL (required)                                 |
| `autoplay` | Try to start immediately; falls back to the first user interaction |
| `loop`     | Restart when the video ends                                        |
| `resume`   | Remember the playback position (stored in `localStorage`)          |
| `volume`   | 0 to 100 (default `100`)                                           |
| `label`    | Accessible name and lock-screen title                              |

## Styling

```css
youtube-audio {
  --ya-size: 64px;
  --ya-bg: #0f766e;
  --ya-color: #fff;
  --ya-ring: #fff;
}
```

## JavaScript API

```js
const el = document.querySelector('youtube-audio');
el.play();
el.pause();
el.toggle();
el.playing; // boolean

el.addEventListener('yastatechange', (e) => {
  console.log(e.detail.state); // idle | loading | playing | paused | error
});
```

## Notes

- Browsers block audio before the user interacts with the page, so `autoplay` may wait for the first click or tap.
- The video must be embeddable; otherwise the button shows an error state.
- Please respect YouTube's Terms of Service and the rights of the content owner.

## License

Copyright (c) Mostafa. All rights reserved.
