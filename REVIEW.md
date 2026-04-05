# HW9 Spec Review

Date: 2026-04-05

## Findings (ordered by severity)

1. **Medium - Motion permission flow is missing, so tilt steering may fail on iOS devices**
   - Spec impact: The core gameplay requirement says the player should steer by rotating the phone.
   - Evidence: `DeviceMotion.addListener(...)` is used directly in [app/game.tsx](app/game.tsx#L1040) without a preceding `DeviceMotion.requestPermissionsAsync()` and availability/permission handling.
   - Risk: On devices where motion permission is denied or not granted yet, the tilt value can remain ineffective, causing the required control method to fail.

2. **Low - "Mimic exactly" visual requirement is only partially satisfied**
   - Spec impact: Design asks to mimic the real Slope look as closely as possible.
   - Evidence: The current implementation captures the neon/3D aesthetic and obstacle gameplay, but includes custom visual elements (forked tracks, rain/particle styling) that differ from the classic game presentation.
   - Risk: Depending on grading strictness, this may be considered close but not exact.

## Requirement Coverage

1. **Screen 1: Home/Menu**
   - **Title displayed**: ✅ Pass ([app/index.tsx](app/index.tsx#L37))
   - **Large Start button present**: ✅ Pass ([app/index.tsx](app/index.tsx#L47))
   - **Loads high score from AsyncStorage**: ✅ Pass ([app/index.tsx](app/index.tsx#L21))

2. **Screen 2: Actual Game**
   - **Sphere spawns at start and begins movement**: ✅ Pass ([app/game.tsx](app/game.tsx#L1006), [app/game.tsx](app/game.tsx#L330))
   - **Rotate to move left/right**: ⚠️ Partial (implemented, but permission handling missing) ([app/game.tsx](app/game.tsx#L1040))
   - **Avoid red obstacles**: ✅ Pass ([app/game.tsx](app/game.tsx#L454), [app/game.tsx](app/game.tsx#L772))
   - **World generated as player falls**: ✅ Pass (segment recycle/generation loop) ([app/game.tsx](app/game.tsx#L332), [app/game.tsx](app/game.tsx#L193))
   - **High score overwrite in storage when beaten**: ✅ Pass ([app/game.tsx](app/game.tsx#L1087))

3. **Performance / lag minimization**
   - **Status**: ⚠️ Not fully verifiable from static review.
   - Notes: The implementation uses some performance-conscious choices (e.g., `antialias: false`, bounded segment pool), but no profiling results are documented.

## Overall Assessment

The project is **mostly aligned** with the spec and includes both required screens, score persistence, procedural track generation, and obstacle-based gameplay. The main gap is that phone-rotation control is not robustly permission-gated, which can block the core control requirement on some devices.
