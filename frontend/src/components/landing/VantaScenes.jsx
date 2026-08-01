import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import p5 from 'p5';
import BIRDS from 'vanta/dist/vanta.birds.min';
import TOPOLOGY from 'vanta/dist/vanta.topology.min';
import { shouldRenderScene } from './UnicornScenes';

// Vanta.js background scenes for the Features and Stats sections. Same
// decoration-only contract as UnicornScenes.jsx: nothing readable is ever
// drawn inside them, they sit at z-index 0 under a static CSS gradient
// fallback, and shouldRenderScene() (WebGL support / reduced-motion /
// save-data / low-memory device gating) is shared with those scenes rather
// than re-implemented here.
//
// Mounting model is different from unicornstudio-react though: Vanta effects
// are imperative (VANTA.BIRDS({el, ...}) returns an instance with .destroy()),
// not a declarative React component, so each scene here is a thin
// useEffect-driven wrapper around a plain DOM host node instead.
//
// three@0.134.0 and p5@1.11.x are pinned (not the newer majors already used
// elsewhere / the current default) to match the versions Vanta's bundled,
// pre-minified effect builds actually expect -- newer three.js has removed
// APIs older Vanta builds still call, and p5 v2's internal renderer/canvas
// setup changed enough that vanta.topology.min.js crashed every animation
// frame (`Cannot read properties of null (reading 'canvas')`) against p5 v2,
// confirmed by running it in a real browser and watching the console, not
// just from a version-number hunch.
//
// Both libraries are also assigned onto `window` before the effect is
// constructed: passing THREE/p5 as a config property alone isn't enough --
// Vanta's minified BIRDS build still does its own `window.THREE` existence
// check internally (logs "[VANTA] No THREE defined on window" otherwise,
// confirmed harmless for BIRDS specifically since it falls back to the
// passed-in reference, but assigning it removes the warning and matches the
// documented Vanta + bundler integration pattern rather than relying on an
// undocumented fallback).
if (typeof window !== 'undefined') {
  if (!window.THREE) window.THREE = THREE;
  if (!window.p5) window.p5 = p5;
}

const LOAD_DEFER_MARGIN = '400px 0px';

function useVantaEffect(factory) {
  const hostRef = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const effectRef = useRef(null);

  // Defer mounting until the section is nearly in view, same as
  // UnicornScenes.jsx's `defer` option -- an off-screen section shouldn't
  // pay the WebGL init cost.
  useEffect(() => {
    if (!shouldRenderScene()) return undefined;
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') {
      setEnabled(true);
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setEnabled(true);
        io.disconnect();
      }
    }, { rootMargin: LOAD_DEFER_MARGIN });
    io.observe(host);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled || !hostRef.current) return undefined;
    try {
      effectRef.current = factory(hostRef.current);
    } catch {
      // Same "never blank" contract as SceneLayer -- if the effect throws
      // (unsupported GPU, context lost), the CSS fallback underneath is
      // still there, so failure here is silent by design, not swallowed.
      effectRef.current = null;
    }
    return () => {
      if (effectRef.current && typeof effectRef.current.destroy === 'function') {
        effectRef.current.destroy();
      }
      effectRef.current = null;
    };
  }, [enabled, factory]);

  return hostRef;
}

// Features section background.
export function BirdsScene({ className = '' }) {
  const hostRef = useVantaEffect((el) => BIRDS({
    el,
    THREE,
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.0,
    minWidth: 200.0,
    scale: 1.0,
    scaleMobile: 1.0,
    backgroundColor: 0x7192f,
    backgroundAlpha: 1,
    color1: 0xff0000,
    color2: 0xd1ff,
    colorMode: 'varianceGradient',
    quantity: 5,
    birdSize: 1,
    wingSpan: 30,
    speedLimit: 5,
    separation: 20,
    alignment: 20,
    cohesion: 20,
  }));
  return <div ref={hostRef} className={`vanta-layer ${className}`} aria-hidden="true" />;
}

// Stats section background.
export function TopologyScene({ className = '' }) {
  const hostRef = useVantaEffect((el) => TOPOLOGY({
    el,
    p5,
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.0,
    minWidth: 200.0,
    scale: 1.0,
    scaleMobile: 1.0,
    backgroundColor: 0x2222,
    color: 0x89964e,
  }));
  return <div ref={hostRef} className={`vanta-layer ${className}`} aria-hidden="true" />;
}
