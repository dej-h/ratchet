# Diagram result: <title>

- **Abstraction and archetype:** <choice>
- **Audience fit:** <why this level and naming fit>
- **Intentionally omitted:** <scope kept outside the visual>
- **Asset provenance:** <short summary with assets.yaml as the detail owner>
- **Reviewed input digest:** <sha256>
- **Reviewed render digest:** <sha256>

## Artifacts

| Artifact | SHA-256 |
|---|---|
| renders/final.png | |
| renders/final.webm | |
| renders/final.mp4 | |

## Website integration

```html
<figure class="diagram" data-diagram>
  <picture class="diagram-poster" data-diagram-poster>
    <img src="/diagram/final.png" alt="<concise complete-diagram description>">
  </picture>
  <video class="diagram-video" data-diagram-video poster="/diagram/final.png" muted playsinline preload="metadata" hidden>
    <source src="/diagram/final.webm" type="video/webm">
    <source src="/diagram/final.mp4" type="video/mp4">
  </video>
</figure>
<script type="module">
  const diagram = document.querySelector('[data-diagram]');
  const video = document.querySelector('[data-diagram-video]');
  const poster = document.querySelector('[data-diagram-poster]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (diagram && video && poster && !reducedMotion) {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.6) return;
      observer.disconnect();
      poster.hidden = true;
      video.hidden = false;
      void video.play().catch(() => {
        video.hidden = true;
        poster.hidden = false;
      });
    }, {threshold: [0.6]});
    video.addEventListener('ended', () => {
      video.hidden = true;
      poster.hidden = false;
    }, {once: true});
    observer.observe(diagram);
  } else if (video) {
    video.hidden = true;
  }
</script>
```

The video intentionally has no `loop` attribute. Its final frame remains the
complete approved overview. Reduced-motion users keep the poster image.
