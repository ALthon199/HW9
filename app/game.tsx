/* eslint-disable react/no-unknown-property */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Canvas, useFrame, useThree } from "@react-three/fiber/native";
import { useRouter } from "expo-router";
import { DeviceMotion } from "expo-sensors";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type SegmentObstacle = {
  offsetX: number;
  width: number;
  height: number;
  depth: number;
};

type TrackSegment = {
  id: number;
  pathDistance: number;
  x: number;
  z: number;
  width: number;
  tiltZ: number;
  isRamp: boolean;
  rampAngle: number;
  hasFork: boolean;
  forkX: number;
  forkWidth: number;
  obstacle: SegmentObstacle | null;
};

type MeshHandle = {
  position: { x: number; y?: number; z: number };
  scale: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  material?: {
    color?: { setHex: (hex: number) => void };
    emissive?: { setHex: (hex: number) => void };
    emissiveIntensity?: number;
  };
};

type CameraWithFov = {
  fov: number;
  updateProjectionMatrix: () => void;
};

const HIGH_SCORE_KEY = "slope.highScore";
const BALL_RADIUS = 0.34;

const SEGMENT_COUNT = 28;
const SEGMENT_LENGTH = 3.0;
const SEGMENT_SPACING = 0;
const SEGMENT_STRIDE = SEGMENT_LENGTH + SEGMENT_SPACING;
const SEGMENT_BASE_WIDTH = 5.0;
const SEGMENT_MIN_WIDTH = 3.0;
const PLATFORM_HEIGHT = 0.12;

const BASE_SPEED = 5.6;
const MAX_SPEED = 60;
const ACCELERATION = 1.2;
const TILT_FORCE = 7.8;
const CAMERA_BASE_FOV = 65;

const BASE_TRACK_Y = -0.5;
const TRACK_SLOPE_PER_Z = 0.18;
const GRAVITY = 13.5;
const TILT_SLIDE_FORCE = 12.0;
const RAMP_ANGLE_BASE = 0.2;
const SLOPE_ANGLE = Math.atan(TRACK_SLOPE_PER_Z);
const FORK_WIDTH = 2.0;
const FORK_SPREAD_BASE = 2.2;
const RECYCLE_Z = 8;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const getPathX = (distance: number) => {
  const ramp = Math.min(1, distance / 30);
  return (
    ramp *
    (Math.sin(distance * 0.02) * 3.0 +
      Math.sin(distance * 0.009 + 1.5) * 2.0 +
      Math.sin(distance * 0.04 + 3.0) * 0.8)
  );
};

const trackYAtZ = (z: number) => BASE_TRACK_Y + z * TRACK_SLOPE_PER_Z;

type GameWorldProps = {
  tiltRef: MutableRefObject<number>;
  manualSteerRef: MutableRefObject<number>;
  paused: boolean;
  onScore: (n: number) => void;
  onSpeed: (n: number) => void;
  onGameOver: () => void;
  seed: number;
};

function GameWorld({
  tiltRef,
  manualSteerRef,
  paused,
  onScore,
  onSpeed,
  onGameOver,
  seed,
}: GameWorldProps) {
  const { camera } = useThree();

  const ballRef = useRef<MeshHandle | null>(null);
  const surfaceRefs = useRef<Record<number, MeshHandle | null>>({});
  const leftEdgeRefs = useRef<Record<number, MeshHandle | null>>({});
  const rightEdgeRefs = useRef<Record<number, MeshHandle | null>>({});
  const frontEdgeRefs = useRef<Record<number, MeshHandle | null>>({});
  const obstacleRefs = useRef<Record<number, MeshHandle | null>>({});
  const forkSurfRefs = useRef<Record<number, MeshHandle | null>>({});
  const forkLeftRefs = useRef<Record<number, MeshHandle | null>>({});
  const forkRightRefs = useRef<Record<number, MeshHandle | null>>({});
  const obsTopRefs = useRef<Record<number, MeshHandle | null>>({});
  const gridL1Refs = useRef<Record<number, MeshHandle | null>>({});
  const gridL2Refs = useRef<Record<number, MeshHandle | null>>({});
  const gridCrossRefs = useRef<Record<number, MeshHandle | null>>({});
  const forkGridRefs = useRef<Record<number, MeshHandle | null>>({});

  const segmentsRef = useRef<TrackSegment[]>([]);
  const speedRef = useRef(BASE_SPEED);
  const distanceRef = useRef(0);
  const ballXRef = useRef(0);
  const ballYRef = useRef(BASE_TRACK_Y + PLATFORM_HEIGHT + BALL_RADIUS);
  const ballVyRef = useRef(0);
  const airborneRef = useRef(false);
  const gameEndedRef = useRef(false);
  const lastScoreRef = useRef(0);
  const lastSpeedHudRef = useRef(Math.round(BASE_SPEED * 10));
  const nextPathDistRef = useRef(0);
  const spawnCounterRef = useRef(0);
  const wasOnRampRef = useRef(false);
  const forkActiveRef = useRef(false);
  const forkRemainingRef = useRef(0);
  const forkSpreadRef = useRef(FORK_SPREAD_BASE);
  const forkSideRef = useRef<-1 | 1>(1);

  const segIdx = useMemo(
    () => Array.from({ length: SEGMENT_COUNT }, (_, i) => i),
    [],
  );

  const particles = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => {
        const brightness = 0.15 + Math.random() * 0.85;
        const g = Math.floor(brightness * 200 + 55);
        const b = Math.floor(brightness * 20);
        return {
          id: i,
          x: (Math.random() * 2 - 1) * 28,
          y: -2 + Math.random() * 18,
          z: -5 - Math.random() * 65,
          size: 0.03 + Math.random() * 0.06,
          color: `#00${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
        };
      }),
    [],
  );

  const rainDrops = useMemo(
    () =>
      Array.from({ length: 55 }, (_, i) => {
        const brightness = 0.25 + Math.random() * 0.75;
        const g = Math.floor(brightness * 200 + 55);
        return {
          id: i,
          x: (Math.random() * 2 - 1) * 28,
          y0: Math.random() * 22 - 2,
          z: -3 - Math.random() * 60,
          height: 0.3 + Math.random() * 1.6,
          speed: 1.5 + Math.random() * 4.5,
          color: `#00${g.toString(16).padStart(2, "0")}08`,
        };
      }),
    [],
  );

  const rainRefs = useRef<Record<number, MeshHandle | null>>({});
  const rainYRef = useRef<number[]>([]);

  const recycleSegment = useCallback(
    (seg: TrackSegment, farthestZ: number, difficulty: number) => {
      seg.z = farthestZ - SEGMENT_STRIDE;
      seg.pathDistance = nextPathDistRef.current;
      nextPathDistRef.current += SEGMENT_STRIDE;
      const pathX = getPathX(seg.pathDistance);
      seg.x = pathX;
      seg.width = Math.max(
        SEGMENT_MIN_WIDTH,
        SEGMENT_BASE_WIDTH - difficulty * 2.0,
      );

      seg.tiltZ = 0;
      seg.isRamp = false;
      seg.rampAngle = 0;
      seg.hasFork = false;
      seg.forkX = 0;
      seg.forkWidth = 0;
      seg.obstacle = null;

      if (
        !forkActiveRef.current &&
        spawnCounterRef.current > 20 &&
        Math.random() < 0.1 + difficulty * 0.08
      ) {
        forkActiveRef.current = true;
        forkRemainingRef.current = 4 + Math.floor(Math.random() * 4);
        forkSpreadRef.current =
          FORK_SPREAD_BASE + Math.random() * 0.6;
        forkSideRef.current = Math.random() < 0.5 ? -1 : 1;
      }

      if (forkActiveRef.current) {
        const sp = forkSpreadRef.current;
        const sd = forkSideRef.current;
        seg.width = FORK_WIDTH;
        seg.x = pathX + sd * sp;
        seg.hasFork = true;
        seg.forkX = pathX - sd * sp;
        seg.forkWidth = FORK_WIDTH;
        forkRemainingRef.current -= 1;
        if (forkRemainingRef.current <= 0) {
          forkActiveRef.current = false;
        }
      }

      if (!seg.hasFork && spawnCounterRef.current > 15) {
        const roll = Math.random();
        if (roll < 0.08 + difficulty * 0.04) {
          seg.isRamp = true;
          seg.rampAngle = RAMP_ANGLE_BASE + difficulty * 0.08;
        } else if (roll < 0.22 + difficulty * 0.1) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          seg.tiltZ = dir * (0.12 + difficulty * 0.2);
        }
      }

      if (!seg.isRamp && spawnCounterRef.current > 12) {
        const obsChance = seg.hasFork
          ? 0.3 + difficulty * 0.1
          : 0.15 + difficulty * 0.1;
        if (Math.random() < obsChance) {
          const w = seg.width;
          const obsWidth = Math.min(w * 0.55, 0.7 + Math.random() * 0.7);
          const maxOff = Math.max(
            0,
            (w - obsWidth) / 2 - BALL_RADIUS * 1.2,
          );
          seg.obstacle = {
            offsetX: (Math.random() * 2 - 1) * maxOff,
            width: obsWidth,
            height: 0.7 + Math.random() * 0.4,
            depth: 0.8 + Math.random() * 0.5,
          };
        }
      }

      spawnCounterRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    const initial: TrackSegment[] = [];

    speedRef.current = BASE_SPEED;
    distanceRef.current = 0;
    ballXRef.current = 0;
    ballYRef.current = BASE_TRACK_Y + PLATFORM_HEIGHT + BALL_RADIUS;
    ballVyRef.current = 0;
    airborneRef.current = false;
    gameEndedRef.current = false;
    lastScoreRef.current = 0;
    lastSpeedHudRef.current = Math.round(BASE_SPEED * 10);
    spawnCounterRef.current = 0;
    nextPathDistRef.current = 0;
    wasOnRampRef.current = false;
    forkActiveRef.current = false;
    forkRemainingRef.current = 0;

    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      const pathDist = i * SEGMENT_STRIDE;
      const seg: TrackSegment = {
        id: i,
        pathDistance: pathDist,
        x: getPathX(pathDist),
        z: RECYCLE_Z - 2 - i * SEGMENT_STRIDE,
        width: SEGMENT_BASE_WIDTH,
        tiltZ: 0,
        isRamp: false,
        rampAngle: 0,
        hasFork: false,
        forkX: 0,
        forkWidth: 0,
        obstacle: null,
      };

      if (i > 10 && Math.random() < 0.18) {
        const w = Math.min(seg.width * 0.55, 0.7 + Math.random() * 0.7);
        const mo = Math.max(0, (seg.width - w) / 2 - BALL_RADIUS * 1.2);
        seg.obstacle = {
          offsetX: (Math.random() * 2 - 1) * mo,
          width: w,
          height: 0.7 + Math.random() * 0.4,
          depth: 0.8 + Math.random() * 0.5,
        };
      }

      initial.push(seg);
      nextPathDistRef.current = pathDist + SEGMENT_STRIDE;
    }

    segmentsRef.current = initial;
    onScore(0);
    onSpeed(BASE_SPEED);
  }, [onScore, onSpeed, seed]);

  const triggerGameOver = useCallback(() => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    onGameOver();
  }, [onGameOver]);

  useFrame((_, delta) => {
    if (paused || gameEndedRef.current) return;
    const dt = Math.min(delta, 0.05);

    speedRef.current = Math.min(MAX_SPEED, speedRef.current + ACCELERATION * dt);
    distanceRef.current += speedRef.current * dt;

    const speedHud = Math.round(speedRef.current * 10);
    if (speedHud !== lastSpeedHudRef.current) {
      lastSpeedHudRef.current = speedHud;
      onSpeed(speedRef.current);
    }

    const steer = clamp(
      tiltRef.current + manualSteerRef.current * 0.92,
      -1.35,
      1.35,
    );
    ballXRef.current += steer * TILT_FORCE * dt;

    const difficulty = Math.min(1, distanceRef.current / 900);

    for (const seg of segmentsRef.current) {
      seg.z += speedRef.current * dt;
    }

    for (let pass = 0; pass < 3; pass += 1) {
      let recycled = false;
      for (const seg of segmentsRef.current) {
        if (seg.z > RECYCLE_Z) {
          let fz = Infinity;
          for (const s of segmentsRef.current) {
            if (s !== seg && s.z < fz) fz = s.z;
          }
          recycleSegment(seg, fz, difficulty);
          recycled = true;
          break;
        }
      }
      if (!recycled) break;
    }

    let onPlatform = false;
    let platY = BASE_TRACK_Y;
    let currentTiltZ = 0;
    let currentIsRamp = false;
    for (const seg of segmentsRef.current) {
      if (onPlatform) break;
      const zH = SEGMENT_LENGTH / 2 + BALL_RADIUS * 0.8;
      const xH = seg.width / 2 + BALL_RADIUS * 0.3;
      if (Math.abs(seg.z) <= zH) {
        if (Math.abs(ballXRef.current - seg.x) <= xH) {
          let segPlatY = trackYAtZ(seg.z) + PLATFORM_HEIGHT;
          if (seg.isRamp) {
            const rt = clamp(
              (seg.z + SEGMENT_LENGTH / 2) / SEGMENT_LENGTH,
              0,
              1,
            );
            segPlatY += rt * SEGMENT_LENGTH * Math.sin(seg.rampAngle);
          }
          if (ballYRef.current <= segPlatY + BALL_RADIUS + 0.08) {
            onPlatform = true;
            platY = segPlatY;
            currentTiltZ = seg.tiltZ;
            currentIsRamp = seg.isRamp;
          }
          continue;
        }
        if (
          seg.hasFork &&
          Math.abs(ballXRef.current - seg.forkX) <=
            seg.forkWidth / 2 + BALL_RADIUS * 0.3
        ) {
          const forkPlatY = trackYAtZ(seg.z) + PLATFORM_HEIGHT;
          if (ballYRef.current <= forkPlatY + BALL_RADIUS + 0.08) {
            onPlatform = true;
            platY = forkPlatY;
          }
          continue;
        }
      }
    }

    if (onPlatform && currentTiltZ !== 0) {
      ballXRef.current += currentTiltZ * TILT_SLIDE_FORCE * dt;
    }

    const groundY = platY + BALL_RADIUS;

    if (onPlatform) {
      if (ballYRef.current <= groundY && ballVyRef.current <= 0) {
        const diff = groundY - ballYRef.current;
        ballYRef.current += diff < 0.02 ? diff : diff * 0.45;
        ballVyRef.current = 0;
        airborneRef.current = false;
      } else if (
        ballYRef.current > groundY &&
        ballYRef.current < groundY + 0.15 &&
        ballVyRef.current <= 0
      ) {
        ballYRef.current += (groundY - ballYRef.current) * 0.3;
        ballVyRef.current = 0;
        airborneRef.current = false;
      } else if (ballYRef.current > groundY + 0.3) {
        airborneRef.current = true;
      }
    } else if (!airborneRef.current) {
      airborneRef.current = true;
    }

    if (wasOnRampRef.current && !currentIsRamp) {
      const launchVy = Math.max(4.5, speedRef.current * 0.38);
      if (ballVyRef.current < launchVy) {
        ballVyRef.current = launchVy;
        airborneRef.current = true;
      }
    }
    wasOnRampRef.current = currentIsRamp && onPlatform;

    if (airborneRef.current) {
      ballVyRef.current -= GRAVITY * dt;
      ballYRef.current += ballVyRef.current * dt;
    }

    if (ballYRef.current < trackYAtZ(0) - 4) {
      triggerGameOver();
      return;
    }

    for (const seg of segmentsRef.current) {
      if (!seg.obstacle) continue;
      const ox = seg.x + seg.obstacle.offsetX;
      const xHit =
        Math.abs(ox - ballXRef.current) <=
        seg.obstacle.width / 2 + BALL_RADIUS;
      const zHit =
        Math.abs(seg.z) <= seg.obstacle.depth / 2 + BALL_RADIUS;
      if (xHit && zHit) {
        const obsTop =
          trackYAtZ(seg.z) + PLATFORM_HEIGHT + seg.obstacle.height;
        if (ballYRef.current - BALL_RADIUS <= obsTop - 0.08) {
          triggerGameOver();
          return;
        }
      }
    }

    if (ballRef.current) {
      ballRef.current.position.x = ballXRef.current;
      ballRef.current.position.y = ballYRef.current;
      if (ballRef.current.rotation) {
        ballRef.current.rotation.x -= speedRef.current * dt * 2.1;
        ballRef.current.rotation.z = -steer * 0.5;
      }
    }

    const sf =
      (speedRef.current - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    const cx = ballXRef.current * 0.88;
    const cy = ballYRef.current + 5.5 + sf * 0.3;
    const cz = 6.5 - sf * 0.5;
    camera.position.x += (cx - camera.position.x) * 0.12;
    camera.position.y += (cy - camera.position.y) * 0.1;
    camera.position.z += (cz - camera.position.z) * 0.08;

    const lookAheadX = getPathX(distanceRef.current + 14);
    camera.lookAt(
      ballXRef.current * 0.5 + lookAheadX * 0.3,
      ballYRef.current - 1.5,
      -14,
    );

    const pc = camera as CameraWithFov;
    const tf = CAMERA_BASE_FOV + sf * 8;
    if (typeof pc.fov === "number" && Math.abs(pc.fov - tf) > 0.1) {
      pc.fov += (tf - pc.fov) * 0.06;
      pc.updateProjectionMatrix();
    }

    const sc = Math.floor(distanceRef.current * 10);
    if (sc !== lastScoreRef.current) {
      lastScoreRef.current = sc;
      onScore(sc);
    }

    if (rainYRef.current.length === 0) {
      rainYRef.current = rainDrops.map((r) => r.y0);
    }
    for (let ri = 0; ri < rainDrops.length; ri += 1) {
      rainYRef.current[ri] -= rainDrops[ri].speed * dt;
      if (rainYRef.current[ri] < -5) {
        rainYRef.current[ri] = 16 + Math.random() * 6;
      }
      const rm = rainRefs.current[ri];
      if (rm) rm.position.y = rainYRef.current[ri];
    }

    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      const seg = segmentsRef.current[i];
      if (!seg) continue;
      const y = trackYAtZ(seg.z);
      const rx = seg.isRamp ? seg.rampAngle : -SLOPE_ANGLE;
      const tiltYOff = (seg.width / 2) * Math.sin(seg.tiltZ);
      const rampYShift = seg.isRamp
        ? (SEGMENT_LENGTH / 2) * Math.sin(seg.rampAngle)
        : 0;

      const surf = surfaceRefs.current[i];
      if (surf) {
        surf.position.x = seg.x;
        surf.position.y = y + rampYShift;
        surf.position.z = seg.z;
        surf.scale.x = seg.width / SEGMENT_BASE_WIDTH;
        if (surf.rotation) {
          surf.rotation.x = rx;
          surf.rotation.z = seg.tiltZ;
        }
        if (surf.material?.color) {
          if (seg.isRamp) {
            surf.material.color.setHex(0x1a1400);
            surf.material.emissive?.setHex(0x1a0f00);
          } else if (seg.tiltZ !== 0) {
            surf.material.color.setHex(0x0a0a16);
            surf.material.emissive?.setHex(0x000820);
          } else {
            surf.material.color.setHex(0x0a140a);
            surf.material.emissive?.setHex(0x001a05);
          }
        }
      }

      const le = leftEdgeRefs.current[i];
      if (le) {
        le.position.x = seg.x - seg.width / 2;
        le.position.y = y + PLATFORM_HEIGHT / 2 + 0.01 - tiltYOff + rampYShift;
        le.position.z = seg.z;
        if (le.rotation) {
          le.rotation.x = rx;
          le.rotation.z = seg.tiltZ;
        }
        if (le.material?.color) {
          if (seg.isRamp) {
            le.material.color.setHex(0xffaa00);
            le.material.emissive?.setHex(0xffaa00);
          } else {
            le.material.color.setHex(0x00ff41);
            le.material.emissive?.setHex(0x00ff41);
          }
        }
      }

      const re = rightEdgeRefs.current[i];
      if (re) {
        re.position.x = seg.x + seg.width / 2;
        re.position.y = y + PLATFORM_HEIGHT / 2 + 0.01 + tiltYOff + rampYShift;
        re.position.z = seg.z;
        if (re.rotation) {
          re.rotation.x = rx;
          re.rotation.z = seg.tiltZ;
        }
        if (re.material?.color) {
          if (seg.isRamp) {
            re.material.color.setHex(0xffaa00);
            re.material.emissive?.setHex(0xffaa00);
          } else {
            re.material.color.setHex(0x00ff41);
            re.material.emissive?.setHex(0x00ff41);
          }
        }
      }

      const fe = frontEdgeRefs.current[i];
      if (fe) {
        fe.position.x = seg.x;
        fe.position.y = y + PLATFORM_HEIGHT / 2 + 0.01;
        fe.position.z = seg.z + SEGMENT_LENGTH / 2;
        fe.scale.x = seg.width / SEGMENT_BASE_WIDTH;
        if (fe.rotation) {
          fe.rotation.x = rx;
          fe.rotation.z = seg.tiltZ;
        }
        if (fe.material?.color) {
          if (seg.isRamp) {
            fe.material.color.setHex(0xffaa00);
            fe.material.emissive?.setHex(0xffaa00);
          } else {
            fe.material.color.setHex(0x00ff41);
            fe.material.emissive?.setHex(0x00ff41);
          }
        }
      }

      const ob = obstacleRefs.current[i];
      const ot = obsTopRefs.current[i];
      if (ob) {
        if (seg.obstacle) {
          ob.position.x = seg.x + seg.obstacle.offsetX;
          ob.position.y =
            y + PLATFORM_HEIGHT + seg.obstacle.height / 2;
          ob.position.z = seg.z;
          ob.scale.x = seg.obstacle.width;
          ob.scale.y = seg.obstacle.height;
          ob.scale.z = seg.obstacle.depth;
          if (ob.rotation) ob.rotation.y += dt * 1.2;
          const pulse =
            0.4 + Math.sin(distanceRef.current * 3 + i * 2.1) * 0.2;
          if (ob.material) {
            if (ob.material.emissiveIntensity !== undefined)
              ob.material.emissiveIntensity = pulse;
          }
          if (ot) {
            ot.position.x = ob.position.x;
            ot.position.y = ob.position.y;
            ot.position.z = seg.z;
            ot.scale.x = seg.obstacle.width + 0.04;
            ot.scale.y = seg.obstacle.height + 0.04;
            ot.scale.z = seg.obstacle.depth + 0.04;
            if (ot.rotation) ot.rotation.y = ob.rotation?.y ?? 0;
          }
        } else {
          ob.position.y = -1000;
          if (ot) ot.position.y = -1000;
        }
      }

      const fs = forkSurfRefs.current[i];
      const fl = forkLeftRefs.current[i];
      const fr = forkRightRefs.current[i];
      if (seg.hasFork) {
        const fw = seg.forkWidth;
        if (fs) {
          fs.position.x = seg.forkX;
          fs.position.y = y;
          fs.position.z = seg.z;
          fs.scale.x = fw / SEGMENT_BASE_WIDTH;
          if (fs.rotation) {
            fs.rotation.x = -SLOPE_ANGLE;
            fs.rotation.z = 0;
          }
        }
        if (fl) {
          fl.position.x = seg.forkX - fw / 2;
          fl.position.y = y + PLATFORM_HEIGHT / 2 + 0.01;
          fl.position.z = seg.z;
          if (fl.rotation) fl.rotation.x = -SLOPE_ANGLE;
        }
        if (fr) {
          fr.position.x = seg.forkX + fw / 2;
          fr.position.y = y + PLATFORM_HEIGHT / 2 + 0.01;
          fr.position.z = seg.z;
          if (fr.rotation) fr.rotation.x = -SLOPE_ANGLE;
        }
      } else {
        if (fs) fs.position.y = -1000;
        if (fl) fl.position.y = -1000;
        if (fr) fr.position.y = -1000;
      }

      const gridY = y + PLATFORM_HEIGHT / 2 + 0.006 + rampYShift;
      const gridHex = seg.isRamp ? 0x664400 : 0x005518;
      const gridEmHex = seg.isRamp ? 0x4d3300 : 0x003a10;

      const g1 = gridL1Refs.current[i];
      if (g1) {
        g1.position.x = seg.x - seg.width * 0.25;
        g1.position.y = gridY;
        g1.position.z = seg.z;
        if (g1.rotation) {
          g1.rotation.x = rx;
          g1.rotation.z = seg.tiltZ;
        }
        g1.material?.color?.setHex(gridHex);
        g1.material?.emissive?.setHex(gridEmHex);
      }
      const g2 = gridL2Refs.current[i];
      if (g2) {
        g2.position.x = seg.x + seg.width * 0.25;
        g2.position.y = gridY;
        g2.position.z = seg.z;
        if (g2.rotation) {
          g2.rotation.x = rx;
          g2.rotation.z = seg.tiltZ;
        }
        g2.material?.color?.setHex(gridHex);
        g2.material?.emissive?.setHex(gridEmHex);
      }
      const gc = gridCrossRefs.current[i];
      if (gc) {
        gc.position.x = seg.x;
        gc.position.y = gridY;
        gc.position.z = seg.z;
        gc.scale.x = seg.width / SEGMENT_BASE_WIDTH;
        if (gc.rotation) {
          gc.rotation.x = rx;
          gc.rotation.z = seg.tiltZ;
        }
        gc.material?.color?.setHex(gridHex);
        gc.material?.emissive?.setHex(gridEmHex);
      }
      const fg = forkGridRefs.current[i];
      if (fg) {
        if (seg.hasFork) {
          fg.position.x = seg.forkX;
          fg.position.y = gridY;
          fg.position.z = seg.z;
          if (fg.rotation) fg.rotation.x = -SLOPE_ANGLE;
        } else {
          fg.position.y = -1000;
        }
      }
    }
  });

  return (
    <>
      <color attach="background" args={["#000a02"]} />
      <fog attach="fog" args={["#000a02", 20, 60]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 8, 5]} intensity={0.6} />
      <pointLight
        position={[0, 3, 2]}
        color="#00ff41"
        intensity={2.0}
        distance={18}
      />
      <pointLight
        position={[0, 1.5, -12]}
        color="#00cc33"
        intensity={1.5}
        distance={25}
      />
      <pointLight
        position={[0, 4, -30]}
        color="#00aa22"
        intensity={1.0}
        distance={45}
      />

      {particles.map((p) => (
        <mesh key={`part-${p.id}`} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.size, 5, 5]} />
          <meshBasicMaterial color={p.color} />
        </mesh>
      ))}

      {rainDrops.map((r) => (
        <mesh
          key={`rain-${r.id}`}
          position={[r.x, r.y0, r.z]}
          ref={(n: MeshHandle | null) => {
            rainRefs.current[r.id] = n;
          }}
        >
          <boxGeometry args={[0.03, r.height, 0.03]} />
          <meshBasicMaterial color={r.color} />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`surf-${i}`}
          ref={(n: MeshHandle | null) => {
            surfaceRefs.current[i] = n;
          }}
        >
          <boxGeometry
            args={[SEGMENT_BASE_WIDTH, PLATFORM_HEIGHT, SEGMENT_LENGTH]}
          />
          <meshStandardMaterial
            color="#0a140a"
            emissive="#001a05"
            emissiveIntensity={0.25}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`le-${i}`}
          ref={(n: MeshHandle | null) => {
            leftEdgeRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[0.1, 0.08, SEGMENT_LENGTH]} />
          <meshStandardMaterial
            color="#00ff41"
            emissive="#00ff41"
            emissiveIntensity={1.0}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`re-${i}`}
          ref={(n: MeshHandle | null) => {
            rightEdgeRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[0.1, 0.08, SEGMENT_LENGTH]} />
          <meshStandardMaterial
            color="#00ff41"
            emissive="#00ff41"
            emissiveIntensity={1.0}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`fe-${i}`}
          ref={(n: MeshHandle | null) => {
            frontEdgeRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[SEGMENT_BASE_WIDTH, 0.08, 0.06]} />
          <meshStandardMaterial
            color="#00ff41"
            emissive="#00ff41"
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`obs-${i}`}
          position={[0, -1000, 0]}
          ref={(n: MeshHandle | null) => {
            obstacleRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color="#1a0000"
            emissive="#660000"
            emissiveIntensity={0.3}
            roughness={0.4}
            metalness={0.5}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`obt-${i}`}
          position={[0, -1000, 0]}
          ref={(n: MeshHandle | null) => {
            obsTopRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color="#ff2222"
            wireframe
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`gl1-${i}`}
          ref={(n: MeshHandle | null) => {
            gridL1Refs.current[i] = n;
          }}
        >
          <boxGeometry args={[0.04, 0.02, SEGMENT_LENGTH]} />
          <meshStandardMaterial
            color="#005518"
            emissive="#003a10"
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`gl2-${i}`}
          ref={(n: MeshHandle | null) => {
            gridL2Refs.current[i] = n;
          }}
        >
          <boxGeometry args={[0.04, 0.02, SEGMENT_LENGTH]} />
          <meshStandardMaterial
            color="#005518"
            emissive="#003a10"
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`gc-${i}`}
          ref={(n: MeshHandle | null) => {
            gridCrossRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[SEGMENT_BASE_WIDTH, 0.02, 0.04]} />
          <meshStandardMaterial
            color="#005518"
            emissive="#003a10"
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`fg-${i}`}
          position={[0, -1000, 0]}
          ref={(n: MeshHandle | null) => {
            forkGridRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[0.04, 0.02, SEGMENT_LENGTH]} />
          <meshStandardMaterial
            color="#005518"
            emissive="#003a10"
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`fsurf-${i}`}
          position={[0, -1000, 0]}
          ref={(n: MeshHandle | null) => {
            forkSurfRefs.current[i] = n;
          }}
        >
          <boxGeometry
            args={[SEGMENT_BASE_WIDTH, PLATFORM_HEIGHT, SEGMENT_LENGTH]}
          />
          <meshStandardMaterial
            color="#0a140a"
            emissive="#001a05"
            emissiveIntensity={0.25}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`fl-${i}`}
          position={[0, -1000, 0]}
          ref={(n: MeshHandle | null) => {
            forkLeftRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[0.1, 0.08, SEGMENT_LENGTH]} />
          <meshStandardMaterial
            color="#00ff41"
            emissive="#00ff41"
            emissiveIntensity={1.0}
          />
        </mesh>
      ))}

      {segIdx.map((i) => (
        <mesh
          key={`fr-${i}`}
          position={[0, -1000, 0]}
          ref={(n: MeshHandle | null) => {
            forkRightRefs.current[i] = n;
          }}
        >
          <boxGeometry args={[0.1, 0.08, SEGMENT_LENGTH]} />
          <meshStandardMaterial
            color="#00ff41"
            emissive="#00ff41"
            emissiveIntensity={1.0}
          />
        </mesh>
      ))}

      <mesh
        position={[0, BASE_TRACK_Y + PLATFORM_HEIGHT + BALL_RADIUS, 0]}
        ref={ballRef}
      >
        <sphereGeometry args={[BALL_RADIUS, 10, 10]} />
        <meshBasicMaterial
          color="#00ff41"
          wireframe
        />
      </mesh>
    </>
  );
}

export default function GameScreen() {
  const router = useRouter();
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(BASE_SPEED);
  const [highScore, setHighScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  const [seed, setSeed] = useState(0);
  const tiltRef = useRef(0);
  const manualSteerRef = useRef(0);
  const leftKeyRef = useRef(false);
  const rightKeyRef = useRef(false);

  useEffect(() => {
    const loadScore = async () => {
      try {
        const raw = await AsyncStorage.getItem(HIGH_SCORE_KEY);
        const parsed = raw ? Number.parseInt(raw, 10) : 0;
        setHighScore(Number.isFinite(parsed) ? parsed : 0);
      } catch {
        setHighScore(0);
      }
    };
    void loadScore();
  }, []);

  useEffect(() => {
    DeviceMotion.setUpdateInterval(16);
    const sub = DeviceMotion.addListener((m) => {
      const gamma = m.rotation?.gamma ?? m.rotationRate?.gamma ?? 0;
      tiltRef.current = clamp(gamma * 1.8, -1.25, 1.25);
    });
    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const sync = () => {
      if (leftKeyRef.current && rightKeyRef.current) {
        manualSteerRef.current = 0;
      } else if (leftKeyRef.current) {
        manualSteerRef.current = -1;
      } else if (rightKeyRef.current) {
        manualSteerRef.current = 1;
      } else {
        manualSteerRef.current = 0;
      }
    };

    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") {
        leftKeyRef.current = true;
        sync();
      } else if (k === "arrowright" || k === "d") {
        rightKeyRef.current = true;
        sync();
      }
    };

    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") {
        leftKeyRef.current = false;
        sync();
      } else if (k === "arrowright" || k === "d") {
        rightKeyRef.current = false;
        sync();
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!isGameOver) return;
    const persist = async () => {
      if (score <= highScore) return;
      try {
        await AsyncStorage.setItem(HIGH_SCORE_KEY, String(score));
        setHighScore(score);
      } catch {
        /* keep gameplay responsive */
      }
    };
    void persist();
  }, [highScore, isGameOver, score]);

  const restart = () => {
    setScore(0);
    setSpeed(BASE_SPEED);
    setIsGameOver(false);
    setLeftPressed(false);
    setRightPressed(false);
    manualSteerRef.current = 0;
    setSeed((p) => p + 1);
  };

  const pressLeft = () => {
    setLeftPressed(true);
    setRightPressed(false);
    manualSteerRef.current = -1;
  };
  const releaseLeft = () => {
    setLeftPressed(false);
    manualSteerRef.current = rightPressed ? 1 : 0;
  };
  const pressRight = () => {
    setRightPressed(true);
    setLeftPressed(false);
    manualSteerRef.current = 1;
  };
  const releaseRight = () => {
    setRightPressed(false);
    manualSteerRef.current = leftPressed ? -1 : 0;
  };

  const backToMenu = () => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    requestAnimationFrame(() => {
      router.replace("/");
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Canvas
          style={styles.canvas}
          camera={{
            fov: 65,
            position: [0, 5.8, 6.5],
            rotation: [-0.41, 0, 0],
            near: 0.1,
            far: 100,
          }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
        >
          <GameWorld
            seed={seed}
            paused={isGameOver}
            tiltRef={tiltRef}
            manualSteerRef={manualSteerRef}
            onScore={setScore}
            onSpeed={setSpeed}
            onGameOver={() => setIsGameOver(true)}
          />
        </Canvas>

        <View style={styles.hud}>
          <Text style={styles.hudText}>Score: {score}</Text>
          <View style={styles.hudRight}>
            <Text style={styles.hudText}>
              Best: {Math.max(highScore, score)}
            </Text>
            <Text style={styles.hudSpeed}>Speed: {speed.toFixed(1)}</Text>
          </View>
        </View>

        {!isGameOver && (
          <View style={styles.controlsWrap}>
            <Pressable
              style={[
                styles.controlButton,
                leftPressed && styles.controlButtonActive,
              ]}
              onPressIn={pressLeft}
              onPressOut={releaseLeft}
            >
              <Text style={styles.controlLabel}>LEFT</Text>
            </Pressable>
            <Pressable
              style={[
                styles.controlButton,
                rightPressed && styles.controlButtonActive,
              ]}
              onPressIn={pressRight}
              onPressOut={releaseRight}
            >
              <Text style={styles.controlLabel}>RIGHT</Text>
            </Pressable>
          </View>
        )}

        {isGameOver && (
          <View style={styles.overlay}>
            <Text style={styles.gameOverTitle}>Game Over</Text>
            <Text style={styles.gameOverMeta}>Final Score: {score}</Text>
            <Text style={styles.gameOverMeta}>
              High Score: {Math.max(highScore, score)}
            </Text>
            <Pressable style={styles.restartButton} onPress={restart}>
              <Text style={styles.restartText}>Restart</Text>
            </Pressable>
            <Pressable style={styles.menuButton} onPress={backToMenu}>
              <Text style={styles.menuText}>Back to Menu</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000a02",
  },
  container: {
    flex: 1,
    backgroundColor: "#000a02",
    overflow: "hidden",
  },
  canvas: {
    flex: 1,
  },
  hud: {
    position: "absolute",
    top: 10,
    left: 14,
    right: 14,
    zIndex: 2,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  hudText: {
    color: "#33ff66",
    fontWeight: "700",
    fontSize: 16,
  },
  hudRight: {
    alignItems: "flex-end",
  },
  hudSpeed: {
    color: "#00ff41",
    fontWeight: "700",
    fontSize: 13,
    marginTop: 2,
  },
  controlsWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 14,
    flexDirection: "row",
    gap: 10,
  },
  controlButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#004d15",
    backgroundColor: "rgba(0, 15, 5, 0.72)",
    paddingVertical: 14,
    alignItems: "center",
  },
  controlButtonActive: {
    borderColor: "#00ff41",
    backgroundColor: "rgba(0, 50, 15, 0.78)",
  },
  controlLabel: {
    color: "#00ff41",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 8, 2, 0.82)",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  gameOverTitle: {
    color: "#00ff41",
    fontSize: 36,
    fontWeight: "800",
    marginBottom: 8,
  },
  gameOverMeta: {
    color: "#66ff88",
    fontSize: 18,
  },
  restartButton: {
    backgroundColor: "#00ff41",
    minWidth: 220,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  restartText: {
    color: "#000a02",
    fontWeight: "800",
    fontSize: 19,
  },
  menuButton: {
    borderWidth: 1,
    borderColor: "#004d15",
    minWidth: 220,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  menuText: {
    color: "#33ff66",
    fontWeight: "700",
    fontSize: 16,
  },
});
