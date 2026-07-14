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
      stagger (capped at 8). FlowEditor loading skeleton still open (minor).
- [x] W2-4 **Reader**: crossfade on chapter/mode switches (soft page turn), Loader2 spinner on
      Analyze button.
- [x] W2-5 **Character-chat**: NOTE — message bubbles + insight cards already had fadeUp (agent
      finding overstated). Added: toast on Save-as-Canon, contradiction flag animates in/out,
      thinking indicator entrance.
- [x] W2-6 **Settings**: toast feedback on app-language / project-language / spellcheck (analytics
      already toasted). Per-section fadeUp skipped — page already fades via template; low value.
- [x] W2-7 **Writing-map**: heatmap cells sweep in left→right via CSS `heatmap-fill` (+12ms/col,
      CSS not motion — ~370 rects). Streak-badge glow still open (LOW).
- [x] W2-8 **Publishing**: tab crossfade (`AnimatePresence mode="wait"`), CopyResultButton with
      toast on all 5 generated results.
- [x] W2-9 **Sprints**: launcher/timer/results crossfade, stat cards stagger.cards.
- [ ] W2-10 **Import**: state blocks already use tw-animate `animate-in` entrances — lower value
      than assumed; remaining nicety = per-state AnimatePresence + review queue stagger.

## Wave 3 — Cross-cutting UX gaps

- [x] W3-1 ~~Timeline mobile edit/delete hidden~~ — FALSE POSITIVE. Classes are `md:opacity-0
      md:group-hover:opacity-100`: hidden-until-hover on desktop only, always visible on mobile.
- [ ] W3-2 **Edit-mode transitions**: animate view↔edit swap (manuscript, timeline, characters,
      conflicts, bible section cards) — `AnimatePresence mode="wait"` or `layout`.
- [ ] W3-3 **Tab switch motion**: characters editor tabs, story-brain tabs, publishing tabs.
- [ ] W3-4 **Loading skeletons** for async AI ops: character audit, bible extraction, assistant
      audit panel, publishing generation.
- [~] W3-5 **Action feedback**: settings toggles + save-as-canon DONE; bible add-section and
      timeline event ops still silent.
- [x] W3-6 ~~Dashboard health-card exit~~ — LOW VALUE: counts are computed once on mount and never
      change during a visit (issues get resolved on other pages), so no live exit ever occurs.
- [ ] W3-7 **Genesis validation**: inline error messages (currently silent disable) + loading state
      on Create.

## Wave 4 — Signature moments (antiquarian set-pieces)

- [x] W4-1 **Canon wax-seal press**: active status button slams down (scale 1.35→0.92→1, rotate
      -8→3→0) on change; whileTap on all seals; aria-pressed added.
- [x] W4-2 **Timeline draws itself**: line converted from ::before to real element, scaleY 0→1
      origin-top on mount; events cascade with capped +80ms/index delay.
- [x] W4-3 **Genesis "Create" stampSlam** + Loader2 spinner while creating.
- [ ] W4-4 **Import success stamp** — checkmark scale-bounce like a stamp pressing down.
- [ ] W4-5 **Manuscript word-count ticker** — animate count changes after edits. (Manuscript page
      currently has uncommitted foreign changes — do not touch until those land.)
- [x] W4-6 ~~Projects physicalDrop~~ — already covered: new grid items mount through
      stagger.cards, so they animate in today.

---

## Verified-false findings (do NOT act on)

- "7 orphaned keyframes in globals.css" — FALSE. Only `stamp-press` is unused. `scene-change-pulse`,
  `braindump-*`, `burn-consume`, `ember-rise`, `no-retreat-glow/pulse`, `preparation-breathe`,
  `ink-swirl`, `brushstroke-reveal` all have consumers.
- `hoverLift` "not used anywhere" — FALSE. Dashboard stat cards use it.

## Notes

- Publishing submission-tracker `statusColors` uses raw `text-red-400/green-400/blue-400` — off the
  antiquarian palette; sweep to wax/forest/brass tones when touching that table.
- `template.tsx` must animate opacity ONLY — a y/scale transform creates a containing block for
  `position: fixed` children mid-animation, shifting full-screen overlays (flow, modals).

- `lib/animations.ts` presets still unused and available: `cardFlip`, `stagger.stampGrid` (and
  `physicalDrop`/`stampSlam` only lightly used).
- Stagger delay caution: cap `stagger.cards(i)` index (e.g. `Math.min(i, 8)`) on long lists so the
  tail doesn't wait >0.5s.
