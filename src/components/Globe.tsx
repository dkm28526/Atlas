"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { interpolateGreatCircle, latLonToVec3 } from "@/lib/geo";

const GLOBE_RADIUS = 100;
const ARC_SEGMENTS = 128;
const ARC_TUBE_RADIUS = 0.55;
const ARC_RADIAL_SEGMENTS = 8;
/** Seconds each arc takes to draw itself. */
const ARC_DRAW_SECONDS = 1.1;
/** Seconds the camera rests on a city before moving on. */
const CITY_DWELL_SECONDS = 0.55;

export interface GlobeStop {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** 1-based position in the route. */
  order: number;
  nights: number;
}

export interface GlobeHop {
  fromId: string;
  toId: string;
  mode: "flight" | "train" | "bus";
}

interface GlobeProps {
  stops: GlobeStop[];
  hops: GlobeHop[];
  /** Bumping this replays the fly-through from the first city. */
  replayKey: number;
  /** Index into `stops` to focus, or null to let it idle-rotate. */
  focusIndex: number | null;
  onSelectStop?: (id: string) => void;
}

/** Where the camera should sit to frame a given lat/lon. */
function cameraPositionFor(lat: number, lon: number, distance: number) {
  const [x, y, z] = latLonToVec3(lat, lon, distance);
  return new THREE.Vector3(x, y, z);
}

/**
 * Build the lifted great-circle curve for one hop.
 *
 * The path follows the true great circle rather than a straight chord, and
 * rises in a sine profile whose peak scales with distance — so a Rome-Florence
 * train hugs the surface while a Tokyo-Bangkok flight bows well clear of it.
 */
function buildArcCurve(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): { curve: THREE.CatmullRomCurve3; longness: number } {
  const d = Math.acos(
    Math.min(
      1,
      Math.max(
        -1,
        Math.sin((from.lat * Math.PI) / 180) * Math.sin((to.lat * Math.PI) / 180) +
          Math.cos((from.lat * Math.PI) / 180) *
            Math.cos((to.lat * Math.PI) / 180) *
            Math.cos(((to.lon - from.lon) * Math.PI) / 180),
      ),
    ),
  );
  // d is the central angle in radians; 0..PI. Normalise to a 0..1 "longness".
  const longness = Math.min(1, d / Math.PI);
  const peak = GLOBE_RADIUS * (0.04 + 0.42 * longness);

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const { lat, lon } = interpolateGreatCircle(from, to, t);
    const lift = Math.sin(Math.PI * t) * peak;
    const [x, y, z] = latLonToVec3(lat, lon, GLOBE_RADIUS + lift);
    points.push(new THREE.Vector3(x, y, z));
  }
  return { curve: new THREE.CatmullRomCurve3(points), longness };
}

export default function Globe({
  stops,
  hops,
  replayKey,
  focusIndex,
  onSelectStop,
}: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);

  // Props the animation loop needs to read without being torn down and rebuilt.
  const focusRef = useRef<number | null>(focusIndex);
  const selectRef = useRef<GlobeProps["onSelectStop"]>(onSelectStop);
  focusRef.current = focusIndex;
  selectRef.current = onSelectStop;

  // --- Scene setup: runs once, independent of the itinerary ---
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    routeGroup: THREE.Group;
    /** Set by the route effect so the loop can animate the current route. */
    route: RouteState | null;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    // Captured now so the cleanup below does not read a ref that React may
    // already have detached.
    const labelLayer = labelLayerRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000);
    camera.position.set(0, 90, 320);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 150;
    controls.maxDistance = 600;
    controls.rotateSpeed = 0.42;
    controls.zoomSpeed = 0.7;

    const loader = new THREE.TextureLoader();
    const dayMap = loader.load("/textures/earth-blue-marble.jpg");
    dayMap.colorSpace = THREE.SRGBColorSpace;
    const bumpMap = loader.load("/textures/earth-topology.png");
    const specMap = loader.load("/textures/earth-water.png");
    const skyMap = loader.load("/textures/night-sky.png", (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      scene.background = t;
    });

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96),
      new THREE.MeshPhongMaterial({
        map: dayMap,
        bumpMap,
        bumpScale: 1.4,
        specularMap: specMap,
        specular: new THREE.Color(0x2a3a5a),
        shininess: 14,
      }),
    );
    scene.add(globe);

    // A faint halo so the planet reads against the starfield.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.022, 64, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(0x3fa9ff) } },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
            gl_FragColor = vec4(uColor, 1.0) * intensity;
          }
        `,
      }),
    );
    scene.add(atmosphere);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(-320, 180, 420);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5b8cff, 0.35);
    rim.position.set(300, -120, -260);
    scene.add(rim);

    const routeGroup = new THREE.Group();
    scene.add(routeGroup);

    sceneRef.current = { scene, camera, renderer, controls, routeGroup, route: null };

    // --- Resize ---
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // --- Marker picking ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerMoved = false;
    const onPointerDown = () => {
      pointerMoved = false;
    };
    const onPointerMove = () => {
      pointerMoved = true;
    };
    const onClick = (event: MouseEvent) => {
      // Ignore the click that ends a drag.
      if (pointerMoved) return;
      const state = sceneRef.current;
      if (!state?.route) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(state.route.markers, false);
      const id = hits[0]?.object.userData?.stopId;
      if (typeof id === "string") selectRef.current?.(id);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("click", onClick);

    // --- Animation loop ---
    const clock = new THREE.Clock();
    let raf = 0;
    const projected = new THREE.Vector3();
    const cameraUnit = new THREE.Vector3();
    const placed: { left: number; right: number; top: number; bottom: number }[] = [];

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const state = sceneRef.current;
      if (!state) return;

      const route = state.route;

      if (route) {
        advanceRoute(route, dt);

        // Camera: follow the fly-through, or a user-selected stop, or idle.
        const focus = focusRef.current;
        const target =
          focus != null && route.stops[focus]
            ? cameraPositionFor(route.stops[focus].lat, route.stops[focus].lon, 250)
            : route.cameraTarget;
        if (target && !route.userInteracting) {
          camera.position.lerp(target, 1 - Math.pow(0.0016, dt));
        }
      }

      if (!route) {
        // Idle drift while there is nothing plotted. Once a route exists the
        // planet holds still — the markers and arcs live in world space, so
        // spinning the globe underneath them would slide the pins off their
        // cities.
        globe.rotation.y += dt * 0.012;
        atmosphere.rotation.y = globe.rotation.y;
      }

      controls.update();
      renderer.render(scene, camera);

      // Labels: positioned by direct DOM writes, never React state, so this
      // stays off the render path.
      if (route) {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        cameraUnit.copy(camera.position).normalize();
        placed.length = 0;

        // Front-most first, so when two cities overlap the nearer one keeps
        // its label and the one behind the planet yields.
        const candidates = route.labels
          .map((label) => ({ label, facing: label.unit.dot(cameraUnit) }))
          .filter((c) => c.label.revealed && c.facing > 0.12)
          .sort((a, b) => b.facing - a.facing);

        for (const label of route.labels) label.el.style.opacity = "0";

        for (const { label, facing } of candidates) {
          projected.copy(label.worldPosition).project(camera);
          if (projected.z > 1) continue;

          const anchorX = (projected.x * 0.5 + 0.5) * w;
          const anchorY = (-projected.y * 0.5 + 0.5) * h;

          if (label.width === 0) {
            label.width = label.el.offsetWidth;
            label.height = label.el.offsetHeight;
          }

          // Cities close together on screen (Tokyo and Kyoto, say) would
          // otherwise cost one of them its label entirely. Try the other three
          // sides before giving up on it.
          const offsets = [
            [10, 0],
            [-label.width - 10, 0],
            [10, -label.height - 4],
            [10, label.height + 4],
          ];

          let chosen: { x: number; y: number } | null = null;
          for (const [dx, dy] of offsets) {
            const x = anchorX + dx;
            const y = anchorY + dy;
            const box = {
              left: x,
              right: x + label.width,
              top: y - label.height / 2,
              bottom: y + label.height / 2,
            };
            if (box.left < 0 || box.right > w || box.top < 0 || box.bottom > h) {
              continue;
            }
            const collides = placed.some(
              (other) =>
                box.left < other.right &&
                box.right > other.left &&
                box.top < other.bottom &&
                box.bottom > other.top,
            );
            if (collides) continue;
            placed.push(box);
            chosen = { x, y };
            break;
          }
          if (!chosen) continue;

          label.el.style.opacity = String(Math.min(1, (facing - 0.12) * 4));
          label.el.style.transform = `translate3d(${chosen.x.toFixed(
            1,
          )}px, ${chosen.y.toFixed(1)}px, 0) translate(0, -50%)`;
        }
      }
    };
    raf = requestAnimationFrame(tick);

    const onInteractStart = () => {
      const state = sceneRef.current;
      if (state?.route) state.route.userInteracting = true;
    };
    controls.addEventListener("start", onInteractStart);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener("start", onInteractStart);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      disposeGroup(routeGroup);
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      atmosphere.geometry.dispose();
      (atmosphere.material as THREE.Material).dispose();
      dayMap.dispose();
      bumpMap.dispose();
      specMap.dispose();
      skyMap.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      if (labelLayer) labelLayer.innerHTML = "";
      sceneRef.current = null;
    };
  }, []);

  // --- Route rebuild ---
  //
  // Keyed on the city sequence, not on the stop objects: nudging the nights in
  // one city must not restart the whole fly-through. Nights are patched into
  // the existing labels by the effect below instead.
  const routeKey = useMemo(() => stops.map((s) => s.id).join(">"), [stops]);
  const stopsRef = useRef(stops);
  const hopsRef = useRef(hops);
  stopsRef.current = stops;
  hopsRef.current = hops;

  useEffect(() => {
    const state = sceneRef.current;
    const labelLayer = labelLayerRef.current;
    if (!state || !labelLayer) return;

    disposeGroup(state.routeGroup);
    labelLayer.innerHTML = "";

    if (stopsRef.current.length === 0) {
      state.route = null;
      return;
    }

    state.route = buildRoute(
      stopsRef.current,
      hopsRef.current,
      state.routeGroup,
      labelLayer,
    );
  }, [routeKey, replayKey]);

  // --- Nights changed: patch the labels in place ---
  useEffect(() => {
    const route = sceneRef.current?.route;
    if (!route) return;
    stops.forEach((stop, i) => {
      const nightsEl = route.labels[i]?.nightsEl;
      if (nightsEl) nightsEl.textContent = `${stop.nights}n`;
    });
  }, [stops]);

  return (
    <div ref={mountRef} className="relative h-full w-full">
      <div
        ref={labelLayerRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route state and animation
// ---------------------------------------------------------------------------

interface ArcState {
  mesh: THREE.Mesh;
  arrow: THREE.Mesh;
  /** Total index count of the tube, for drawRange. */
  indexCount: number;
  curve: THREE.CatmullRomCurve3;
  progress: number;
}

interface LabelState {
  el: HTMLDivElement;
  /** The "4n" span, updated in place when nights change. */
  nightsEl: HTMLElement | null;
  worldPosition: THREE.Vector3;
  /** worldPosition normalised, cached so the frame loop allocates nothing. */
  unit: THREE.Vector3;
  revealed: boolean;
  /** Measured once the element has laid out; used for collision tests. */
  width: number;
  height: number;
}

interface RouteState {
  stops: GlobeStop[];
  markers: THREE.Mesh[];
  pulses: THREE.Mesh[];
  arcs: ArcState[];
  labels: LabelState[];
  /** Index of the arc currently drawing. */
  cursor: number;
  /** Seconds spent waiting on the current city before its arc draws. */
  dwell: number;
  cameraTarget: THREE.Vector3 | null;
  finished: boolean;
  userInteracting: boolean;
  elapsed: number;
}

const MODE_COLOR: Record<GlobeHop["mode"], number> = {
  flight: 0x5ad2ff,
  train: 0xf0abfc,
  bus: 0xfacc15,
};

function buildRoute(
  stops: GlobeStop[],
  hops: GlobeHop[],
  group: THREE.Group,
  labelLayer: HTMLDivElement,
): RouteState {
  const markers: THREE.Mesh[] = [];
  const pulses: THREE.Mesh[] = [];
  const labels: LabelState[] = [];

  const markerGeom = new THREE.SphereGeometry(1.5, 16, 16);
  const pulseGeom = new THREE.RingGeometry(2.2, 3.1, 32);

  stops.forEach((stop) => {
    const [x, y, z] = latLonToVec3(stop.lat, stop.lon, GLOBE_RADIUS + 0.6);
    const position = new THREE.Vector3(x, y, z);

    const marker = new THREE.Mesh(
      markerGeom,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    marker.position.copy(position);
    marker.userData.stopId = stop.id;
    group.add(marker);
    markers.push(marker);

    // A flat ring laid on the surface, pointing away from the planet centre.
    const pulse = new THREE.Mesh(
      pulseGeom,
      new THREE.MeshBasicMaterial({
        color: 0x5ad2ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    pulse.position.copy(position);
    pulse.lookAt(0, 0, 0);
    group.add(pulse);
    pulses.push(pulse);

    const el = document.createElement("div");
    el.className = "globe-label";
    el.style.opacity = "0";
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;background:rgba(5,7,13,0.74);border:1px solid rgba(90,210,255,0.35);border-radius:999px;padding:3px 9px 3px 7px;backdrop-filter:blur(4px)">
        <span style="font:600 10px/1 ui-monospace,monospace;color:#5ad2ff">${stop.order}</span>
        <span style="font:600 11px/1.3 ui-sans-serif,system-ui;color:#e8eeff">${escapeHtml(
          stop.name,
        )}</span>
        <span data-nights style="font:500 10px/1.3 ui-sans-serif,system-ui;color:#8ea0c9">${
          stop.nights
        }n</span>
      </div>`;
    labelLayer.appendChild(el);
    labels.push({
      el,
      nightsEl: el.querySelector<HTMLElement>("[data-nights]"),
      worldPosition: position.clone(),
      unit: position.clone().normalize(),
      revealed: false,
      width: 0,
      height: 0,
    });
  });

  // --- Arcs, in route order ---
  const byId = new Map(stops.map((s) => [s.id, s]));
  const arcs: ArcState[] = [];

  for (const hop of hops) {
    const from = byId.get(hop.fromId);
    const to = byId.get(hop.toId);
    if (!from || !to) continue;

    const { curve, longness } = buildArcCurve(from, to);
    const geometry = new THREE.TubeGeometry(
      curve,
      ARC_SEGMENTS,
      ARC_TUBE_RADIUS,
      ARC_RADIAL_SEGMENTS,
      false,
    );
    const color = MODE_COLOR[hop.mode];
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    const indexCount = geometry.index ? geometry.index.count : 0;
    geometry.setDrawRange(0, 0);
    group.add(mesh);

    // Arrowhead at the destination, aligned with the curve's final tangent.
    // Scaled to the hop: a full-size cone on a 300km train hop reads as a blob
    // bigger than the line it terminates.
    const arrowScale = 0.45 + 0.55 * Math.min(1, longness * 4);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(1.7 * arrowScale, 4.6 * arrowScale, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }),
    );
    const end = curve.getPointAt(1);
    const tangent = curve.getTangentAt(1).normalize();
    arrow.position.copy(end);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    group.add(arrow);

    arcs.push({ mesh, arrow, indexCount, curve, progress: 0 });
  }

  const first = stops[0];
  return {
    stops,
    markers,
    pulses,
    arcs,
    labels,
    cursor: 0,
    dwell: 0,
    cameraTarget: cameraPositionFor(first.lat, first.lon, 250),
    finished: arcs.length === 0,
    userInteracting: false,
    elapsed: 0,
  };
}

/**
 * Advance the fly-through by `dt` seconds.
 *
 * The sequence is: reveal the city you are at, hold a beat, draw the arc to
 * the next city while the camera eases toward the arc's midpoint, land, repeat.
 */
function advanceRoute(route: RouteState, dt: number) {
  route.elapsed += dt;

  // Pulse rings breathe under every revealed marker.
  route.pulses.forEach((pulse, i) => {
    const label = route.labels[i];
    if (!label?.revealed) {
      (pulse.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    const phase = (route.elapsed * 0.9 + i * 0.4) % 1;
    const scale = 1 + phase * 1.6;
    pulse.scale.setScalar(scale);
    (pulse.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - phase);
  });

  // Reveal the stop we are currently sitting on.
  if (route.labels[route.cursor]) route.labels[route.cursor].revealed = true;

  if (route.finished) return;

  if (route.dwell < CITY_DWELL_SECONDS) {
    route.dwell += dt;
    return;
  }

  const arc = route.arcs[route.cursor];
  if (!arc) {
    route.finished = true;
    return;
  }

  arc.progress = Math.min(1, arc.progress + dt / ARC_DRAW_SECONDS);
  const eased = arc.progress < 1 ? 1 - Math.pow(1 - arc.progress, 3) : 1;

  // drawRange on the tube's index buffer makes the line appear to be drawn.
  // Snapping to whole rings (6 indices per radial segment) avoids a ragged tip.
  const perRing = ARC_RADIAL_SEGMENTS * 6;
  const rings = Math.floor((eased * arc.indexCount) / perRing);
  arc.mesh.geometry.setDrawRange(0, rings * perRing);

  // Lead the camera along the arc as it draws.
  if (!route.userInteracting) {
    const point = arc.curve.getPointAt(Math.min(0.999, eased * 0.85 + 0.1));
    route.cameraTarget = point.clone().normalize().multiplyScalar(255);
  }

  if (arc.progress >= 1) {
    (arc.arrow.material as THREE.MeshBasicMaterial).opacity = 1;
    route.cursor += 1;
    route.dwell = 0;
    if (route.cursor >= route.arcs.length) {
      route.finished = true;
      // Reveal every label once the whole route is drawn, and pull back so the
      // finished trip is readable in one view instead of being left zoomed
      // onto the last leg.
      for (const label of route.labels) label.revealed = true;
      if (!route.userInteracting) {
        route.cameraTarget = overviewCamera(route.stops);
      }
    }
  }
}

/**
 * A camera position that frames every stop at once: look down the centroid of
 * the route and pull back in proportion to how far it spreads.
 */
function overviewCamera(stops: GlobeStop[]): THREE.Vector3 {
  const centroid = new THREE.Vector3();
  const units = stops.map((stop) => {
    const [x, y, z] = latLonToVec3(stop.lat, stop.lon, 1);
    return new THREE.Vector3(x, y, z);
  });
  for (const unit of units) centroid.add(unit);

  // Stops spread evenly around the planet cancel out; just pick a face.
  if (centroid.lengthSq() < 1e-6) centroid.set(0, 0.35, 1);
  centroid.normalize();

  let maxAngle = 0;
  for (const unit of units) maxAngle = Math.max(maxAngle, centroid.angleTo(unit));

  const distance = THREE.MathUtils.clamp(
    GLOBE_RADIUS * (1.6 + 1.8 * (maxAngle / (Math.PI / 2))),
    172,
    520,
  );
  return centroid.multiplyScalar(distance);
}

function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
