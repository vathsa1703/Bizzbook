import React, { useEffect, useRef, useState } from 'react';
import UnicornScene from 'unicornstudio-react';

// WebGL background scenes for the marketing landing page.
//
// These are DECORATION ONLY. Nothing readable is ever drawn inside them —
// headline, CTAs and cards are separate DOM layered above with a higher
// z-index. If the scene never loads (no WebGL, blocked CDN, slow phone,
// reduced-motion), the page still looks finished because a static CSS
// gradient sits underneath and is never removed.
//
// Runtime facts worth knowing (verified against the installed package,
// unicornstudio-react@2.2.8):
//  - The Unicorn Studio SDK itself is BUNDLED in the npm package (~900 KB of
//    JS inlined as a string and injected as a <script>), so the runtime is
//    NOT a CDN dependency.
//  - The SCENE is. `projectId` makes the SDK fetch
//    https://assets.unicorn.studio/embeds/<projectId> at runtime. No network,
//    no scene. Hence the fallback below.
//  - `lazyLoad` is forwarded to the SDK's addScene(). It defers WebGL context
//    + plane initialisation (`deferCurtains`, `initializePlanes`) until the
//    element is in view, polled via rAF/bounding-box — NOT IntersectionObserver.
//    It does NOT defer the scene JSON fetch: addScene() is called on mount.
//    That's why we gate mounting ourselves for the second scene.

// Rendering scale (0.25–1.0). Lower = fewer pixels shaded = cheaper.
// Measured on a 4x-CPU-throttled run; see the landing-page perf notes.
const SCENE_SCALE = 0.5;
const SCENE_DPI = 1;

// How long we wait for a scene before giving up and staying on the gradient.
const LOAD_TIMEOUT_MS = 8000;

function hasWebGL() {
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

// A shopkeeper on a ₹8,000 Android phone should not be made to shade a
// full-screen fragment shader. Skip the scene outright on weak hardware,
// metered/slow connections, and when the user asked for less motion.
export function shouldRenderScene() {
  if (typeof window === 'undefined') return false;
  if (!hasWebGL()) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  const nav = window.navigator || {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (conn) {
    if (conn.saveData) return false;
    if (/(^|-)2g$/.test(conn.effectiveType || '')) return false;
  }
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return false;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return false;

  return true;
}

/**
 * Absolutely-positioned WebGL background.
 *
 * Renders nothing but the CSS fallback until the scene reports onLoad, then
 * cross-fades the canvas in. On error or timeout it unmounts the scene and
 * leaves the fallback in place — the section never goes blank.
 *
 * @param {string}  projectId  Unicorn Studio project id
 * @param {boolean} active     parent may force it off (e.g. section off-screen)
 * @param {number}  opacity    final opacity of the WebGL layer
 */
function SceneLayer({ projectId, className = '', opacity = 1, defer = false }) {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const hostRef = useRef(null);
  const timerRef = useRef(null);

  // Decide once on the client whether this device gets a scene at all.
  useEffect(() => {
    if (!shouldRenderScene()) return undefined;

    // `defer` = don't even fetch the scene JSON until the section is near the
    // viewport. lazyLoad alone would still fetch on mount (see note above).
    if (!defer) {
      setEnabled(true);
      return undefined;
    }
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') {
      setEnabled(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setEnabled(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(host);
    return () => io.disconnect();
  }, [defer]);

  // Give up quietly if the CDN is slow or blocked.
  useEffect(() => {
    if (!enabled || loaded || failed) return undefined;
    timerRef.current = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timerRef.current);
  }, [enabled, loaded, failed]);

  return (
    <div ref={hostRef} className={`us-layer ${className}`} aria-hidden="true">
      {enabled && !failed && (
        <div className="us-canvas" style={{ opacity: loaded ? opacity : 0 }}>
          <UnicornScene
            projectId={projectId}
            width="100%"
            height="100%"
            scale={SCENE_SCALE}
            dpi={SCENE_DPI}
            lazyLoad
            altText=""
            ariaLabel=""
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </div>
      )}
    </div>
  );
}

// Hero: "Scroll Orb". Mounts immediately — it is above the fold.
export function HeroScene() {
  return <SceneLayer projectId="FELkKlm6WXOBwEooSzZg" className="us-hero" opacity={0.9} />;
}

// AI section: "Droplets". Deferred until the section is ~400px away, so a
// visitor who never scrolls past the fold pays nothing for it.
export function AccentScene() {
  return <SceneLayer projectId="1aAAMXD3rwBaXSLJk1Pa" className="us-accent" opacity={0.55} defer />;
}

// Closing CTA: reuses the Hero's "Scroll Orb" scene (same projectId) rather
// than a third licensed asset, deliberately -- the same orb bookending the
// very top and very bottom of the page reads as a visual signature, not a
// re-run. Deferred (it's far below the fold) and dimmer than the hero so it
// doesn't compete with the closing headline.
export function CtaScene() {
  return <SceneLayer projectId="FELkKlm6WXOBwEooSzZg" className="us-cta" opacity={0.6} defer />;
}

export default SceneLayer;
