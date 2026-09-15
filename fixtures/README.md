# Session fixtures

Recorded drill sessions, used to tune and test rep detection against real
movement rather than guessed thresholds.

## Why landmarks and not video

A recording here is a JSON time series of pose landmarks — roughly 1.5MB for 30
seconds at 60fps, and a few hundred KB once git compresses it. It carries **no
imagery of the athlete**, which matters when the athletes are junior divers: the
file can be committed, shared and reviewed without any of the handling a video
of a minor would need.

It is also the thing the detector actually consumes, so a fixture doubles as a
regression test.

## Capturing one

1. `make run`, then open the app with the view you are filming from:
   `http://localhost:1234/?view=side` or `?view=front`.
2. Frame the athlete so the whole body is visible, camera roughly level and
   perpendicular. Tape the floor position if you want sessions to be comparable
   across days.
3. Tap **Start recording**. The bar shows a live frame, mark and size count.
   (**R** does the same from a keyboard.)
4. Have a **second person tap "Mark rep" once per rep** while the athlete works.
   (**Space** from a keyboard.)
5. Tap **Stop & save**. The browser downloads
   `robocoach-<view>-<timestamp>.json`, and the bar reports what was captured
   so a bad take is obvious before you leave the gym.

For a tripod setup where nobody can reach the screen, add `&record=1` to the
URL: recording then begins at the first detected pose rather than on load, so
you do not bank seconds of an empty gym.
6. Commit it here, and note the rep count in the commit message.

Recording auto-stops after 120 seconds so a forgotten session cannot grow
without bound.

## The Space marks matter

Without them a recording says how the athlete moved but not where a human
considered one rep to end and the next to begin. The marks are the ground truth
the detector gets scored against — they are the difference between "the detector
found 11 things" and "the detector found 11 of the 12 reps, and merged two".

If nobody can tap along, record anyway and put the total rep count in the commit
message. A count validates how many reps were found, though not where their
boundaries fell.

## What to capture first

Two clean sets are more useful than one long one:

- **side view**, 20–30s of standing arm swings at normal tempo
- **front view**, the same

If it is cheap to add, a set with deliberate faults — one arm lagging, bent
elbows, a pause mid-set, a couple of partial reps — is worth more than another
clean set. Detection failures live in the messy cases, and a detector only ever
tested on tidy reps will not survive a real session.

## Format

`robocoach-session/1`. Landmarks are **raw, before smoothing** — filtering can be
reapplied offline with any parameters, but it cannot be removed after the fact.
The smoothing settings that were active during capture are recorded alongside so
the live view can be reproduced.

| Field | Meaning |
| --- | --- |
| `view`, `model`, `camera` | Capture setup |
| `meanFps` | Achieved frame rate; caps how well fast motion is resolved |
| `smoothingAtCapture` | Filter settings live at the time, not applied to the data |
| `landmarkNames` | The 33 names, in the order `world` rows use |
| `marks` | Human-tapped rep times, in ms, on the same clock as frames |
| `frames[].t` | Timestamp in ms |
| `frames[].world` | 33 rows of `[x, y, z, visibility]`, metres, hip-centred |
