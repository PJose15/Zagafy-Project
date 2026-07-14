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

- [ ] W2-1 **Outline**: stagger card entries, `layout` animation on grid↔list toggle (currently a
      full un-animated reflow — worst jank in app), animate filter changes. (HIGH)
- [ ] W2-2 **Versions**: stagger snapshot list, skeleton while loading (bare "Loading..." text today).
- [ ] W2-3 **Flow**: animate chapter-select modal entrance (fixed overlay pops in), richer
      FlowEditor loading skeleton.
- [ ] W2-4 **Reader**: page-flip fade between print pages / chapters / modes; ink-swirl spinner on
      Analyze button (currently text-only, inconsistent with InkStampButton).
- [ ] W2-5 **Character-chat**: message entry animation (match assistant), pressure-meter segment
      stagger, `no-retreat-glow` pulse on contradiction flags, toast on "Save as Canon". (HIGH — no
      feedback today)
- [ ] W2-6 **Settings**: `fadeUp` per section, toast feedback on saves (all silent today).
- [ ] W2-7 **Writing-map**: heatmap cell fill-in stagger, streak badge glow ≥7 days, stat entrance.
- [ ] W2-8 **Publishing**: tab content transition (`AnimatePresence mode="wait"`), copy-to-clipboard
      buttons on generated text, loading placeholder during generation.
- [ ] W2-9 **Sprints**: stat card stagger (`stagger.cards`), launcher entrance to match
      SprintResults' stampSlam polish.
- [ ] W2-10 **Import**: animate state transitions (idle→uploading→analyzing→review→success),
      review queue item stagger.

## Wave 3 — Cross-cutting UX gaps

- [ ] W3-1 **Timeline mobile**: edit/delete only visible on `md:group-hover` — invisible on touch.
      Always show on <md. (HIGH)
- [ ] W3-2 **Edit-mode transitions**: animate view↔edit swap (manuscript, timeline, characters,
      conflicts, bible section cards) — `AnimatePresence mode="wait"` or `layout`.
- [ ] W3-3 **Tab switch motion**: characters editor tabs, story-brain tabs, publishing tabs.
- [ ] W3-4 **Loading skeletons** for async AI ops: character audit, bible extraction, assistant
      audit panel, publishing generation.
- [ ] W3-5 **Action feedback**: toasts on silent CRUD (bible add-section, canon status change,
      timeline event ops, settings toggles).
- [ ] W3-6 **Dashboard health-card exit** — wrap in `AnimatePresence` (vanishes abruptly when
      issues resolve).
- [ ] W3-7 **Genesis validation**: inline error messages (currently silent disable) + loading state
      on Create.

## Wave 4 — Signature moments (antiquarian set-pieces)

- [ ] W4-1 **Canon wax-seal press**: status icon does seal-press (scale 1→1.2→1 + slight rotate,
      `springs.seal`) on status change.
- [ ] W4-2 **Timeline draws itself**: vertical line `scaleY` reveal on mount + event cascade +
      marker pulse on new event.
- [ ] W4-3 **Genesis "Create" stampSlam** — notary-seal moment on project creation.
- [ ] W4-4 **Import success stamp** — checkmark scale-bounce like a stamp pressing down.
- [ ] W4-5 **Manuscript word-count ticker** — animate count changes after edits.
- [ ] W4-6 **Projects: new project `physicalDrop`** into the grid with brief glow.

---

## Verified-false findings (do NOT act on)

- "7 orphaned keyframes in globals.css" — FALSE. Only `stamp-press` is unused. `scene-change-pulse`,
  `braindump-*`, `burn-consume`, `ember-rise`, `no-retreat-glow/pulse`, `preparation-breathe`,
  `ink-swirl`, `brushstroke-reveal` all have consumers.
- `hoverLift` "not used anywhere" — FALSE. Dashboard stat cards use it.

## Notes

- `lib/animations.ts` presets still unused and available: `cardFlip`, `stagger.stampGrid` (and
  `physicalDrop`/`stampSlam` only lightly used).
- Stagger delay caution: cap `stagger.cards(i)` index (e.g. `Math.min(i, 8)`) on long lists so the
  tail doesn't wait >0.5s.
- `template.tsx` transform wrapper: motion removes the transform once animation settles, so
  `position: fixed` overlays inside pages are unaffected post-entry.
