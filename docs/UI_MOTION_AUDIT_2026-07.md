# UI / UX / Motion Audit — July 2026

Full-surface audit of all 21 app pages + shared shell, focused on motion quality,
UX gaps, and consistency with the antiquarian design language.

**Verdict**: motion infrastructure is strong (`lib/animations.ts` springs/stagger/variants,
ToastProvider + toastSlam, ParchmentModal + springs.gentle, reduced-motion honored in both
`globals.css` and `MotionConfig`), but application is uneven — roughly half the pages are
fully static.

Legend: [ ] open · [x] done

---

## Wave 1 — Infrastructure (lifts all pages)

- [x] W1-1 **Route-level page-entry transition** — `app/(app)/template.tsx` with `fadeUp`.
      Today every navigation is a hard DOM swap; sidebar animates but content pops. (HIGH)
- [x] W1-2 **Remove orphaned `stamp-press` keyframe** from `globals.css` (only truly unused
      keyframe — audit verified all others have consumers, incl. flow-mode burn/ember/braindump).
- [x] W1-3 **Destructive-action confirms** — NOTE: the "bare window.confirm everywhere" finding was
      FALSE (all 24 `confirm(` sites already use ConfirmProvider). Real gaps fixed: sprint abandon
      + publishing submission delete now confirm via ConfirmProvider (en/es strings added).

## Wave 2 — Motion for the static pages

- [x] W2-1 **Outline**: `layout` animation on grid↔list toggle + filter changes, card entry/exit
      via AnimatePresence (matches canon/conflicts pattern).
- [x] W2-2 **Versions**: skeleton cards while loading, snapshot entry/exit + `layout` animations.
- [x] W2-3 **Flow**: chapter-select backdrop fade, card springs.gentle, chapter buttons slide-in
      stagger (capped at 8). FlowEditor loading skeleton done (top bar + writing column).
- [x] W2-4 **Reader**: crossfade on chapter/mode switches (soft page turn), Loader2 spinner on
      Analyze button.
- [x] W2-5 **Character-chat**: NOTE — message bubbles + insight cards already had fadeUp (agent
      finding overstated). Added: toast on Save-as-Canon, contradiction flag animates in/out,
      thinking indicator entrance.
- [x] W2-6 **Settings**: toast feedback on app-language / project-language / spellcheck (analytics
      already toasted). Per-section fadeUp skipped — page already fades via template; low value.
- [x] W2-7 **Writing-map**: heatmap cells sweep in left→right via CSS `heatmap-fill` (+12ms/col,
      CSS not motion — ~370 rects). Streak flame smolders (`streak-flame-glow`) at ≥7 days.
- [x] W2-8 **Publishing**: tab crossfade (`AnimatePresence mode="wait"`), CopyResultButton with
      toast on all 5 generated results.
- [x] W2-9 **Sprints**: launcher/timer/results crossfade, stat cards stagger.cards.
- [x] W2-10 **Import**: state blocks keep their tw-animate entrances (sufficient — states only move
      forward); review queue already animates expand/collapse via motion. Success stamp → W4-4.

## Wave 3 — Cross-cutting UX gaps

- [x] W3-1 ~~Timeline mobile edit/delete hidden~~ — FALSE POSITIVE. Classes are `md:opacity-0
      md:group-hover:opacity-100`: hidden-until-hover on desktop only, always visible on mobile.
- [x] W3-2 **Edit-mode transitions**: timeline, conflicts, bible section cards, characters card all
      crossfade (`AnimatePresence mode="wait"`, 0.18s). Manuscript skipped deliberately — animating
      a remount around the Lexical editor risks editor-state side effects.
- [x] W3-3 **Tab switch motion**: story-brain tabpanel + characters editor tabs crossfade.
      Publishing done in wave 2b.
- [x] W3-4 **Loading skeletons**: character audit panel gets skeleton lines while analyzing.
      Bible extraction was a FALSE POSITIVE — WorldBibleExtractButton already has spinner +
      cycling category labels + success/error states. Publishing generation keeps button spinner
      (results appear inside the same card; skeleton adds little).
- [x] W3-5 **Action feedback**: settings toggles, save-as-canon, bible add-section, timeline
      save/delete all toast now.
- [x] W3-6 ~~Dashboard health-card exit~~ — LOW VALUE: counts are computed once on mount and never
      change during a visit (issues get resolved on other pages), so no live exit ever occurs.
- [x] W3-7 **Genesis validation**: quiet per-step requirement hint fades in while Next is disabled
      (aria-live polite). Create loading state done in wave 3 (spinner).

## Wave 4 — Signature moments (antiquarian set-pieces)

- [x] W4-1 **Canon wax-seal press**: active status button slams down (scale 1.35→0.92→1, rotate
      -8→3→0) on change; whileTap on all seals; aria-pressed added.
- [x] W4-2 **Timeline draws itself**: line converted from ::before to real element, scaleY 0→1
      origin-top on mount; events cascade with capped +80ms/index delay.
- [x] W4-3 **Genesis "Create" stampSlam** + Loader2 spinner while creating.
- [x] W4-4 **Import success stamp** — checkmark circle lands with stampSlam.
- [x] W4-5 **Manuscript word-count ticker** — header stat pulses (scale+opacity, keyed remount)
      whenever the total changes.
- [x] W4-6 ~~Projects physicalDrop~~ — already covered: new grid items mount through
      stagger.cards, so they animate in today.

---

## Verified-false findings (do NOT act on)

- "7 orphaned keyframes in globals.css" — FALSE. Only `stamp-press` is unused. `scene-change-pulse`,
  `braindump-*`, `burn-consume`, `ember-rise`, `no-retreat-glow/pulse`, `preparation-breathe`,
  `ink-swirl`, `brushstroke-reveal` all have consumers.
- `hoverLift` "not used anywhere" — FALSE. Dashboard stat cards use it.

## Round 2 additions (2026-07-14, user-requested)

- [x] R2-1 **Sticky sidebar** — desktop sidebar now `md:sticky md:top-0 md:h-screen`; the menu
      follows you down long pages instead of scrolling away (user-reported). Nav list scrolls
      internally.
- [x] R2-2 **Dashboard stat count-ups** — new shared `AnimatedNumber` (antiquarian barrel):
      chapters/characters/events/conflicts roll up on mount, DOM-written (no per-frame renders),
      reduced-motion shows final value instantly.
- [x] R2-3 **Scroll-reveal** — new shared `Reveal` component (`whileInView`, once); dashboard's
      below-fold Recent Chapters + Open Loops section unfolds as you scroll to it.
- [x] R2-4 **Hover lift on list cards** — ParchmentCard `hover` prop wired on outline cards,
      versions snapshots, sprint history rows.
- [x] R2-5 **Nav micro-interactions** — sidebar links nudge right on hover + press on tap
      (own spring transitions; the stagger delay would otherwise lag the gesture feedback).

## Round 3 additions (2026-07-14, model-suggested)

- [x] R3-1 **Toast ink-drain timer** — thin per-type bar drains over the 5s lifetime so users see
      how long a toast stays (all toasts app-wide).
- [x] R3-2 **Sprint timer heartbeat** — final 10 seconds: ring pulses once per tick (scale
      1→1.06→1 keyed by countdown) and turns wax-red, countdown text follows.
- [x] R3-3 **Canon stamp-grid entrance** — wired the long-reserved `stagger.stampGrid` preset:
      canon cards press down like rubber stamps (scale 1.3→1, rotate -3→0, springs.stamp,
      capped stagger).
- [x] R3-4 **Reader progress line** — Kindle view: sticky brass line fills with scroll progress
      through the chapter body (`useScroll` targeted at the reading area).
- [x] R3-5 **Back-to-top button** — global (LibraryShell), springs in after 600px scroll
      (springs.seal), smooth-scrolls to top (instant under reduced motion), z-40 under toasts.
      Verified in-browser: appears on scroll, 1200→0 on click.

## Status: ALL ITEMS CLOSED (2026-07-14)

Every wave is complete. The only intentional skip is the manuscript view↔edit crossfade
(Lexical remount risk).

## Notes

- Publishing submission-tracker `statusColors` — DONE: swept to brass/forest/wax
  (was raw red/green/blue).
- `template.tsx` must animate opacity ONLY — a y/scale transform creates a containing block for
  `position: fixed` children mid-animation, shifting full-screen overlays (flow, modals).

- `lib/animations.ts` presets still unused and available: `cardFlip`, `stagger.stampGrid` (and
  `physicalDrop`/`stampSlam` only lightly used).
- Stagger delay caution: cap `stagger.cards(i)` index (e.g. `Math.min(i, 8)`) on long lists so the
  tail doesn't wait >0.5s.
