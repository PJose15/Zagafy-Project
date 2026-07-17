/**
 * Zagafy — Animation Presets
 * Spring physics and choreography for the Antiquarian Library theme.
 * Designed for use with the Motion library (motion/react).
 */

/**
 * ─── The Motion Doctrine ───
 *
 * Every animation in Zagafy answers to one of three verbs. If a motion
 * doesn't map to a verb, it probably shouldn't exist.
 *
 *   COMMIT  = stamp.    Deliberate, springy press (springs.stamp). Saving,
 *             sealing canon, creating, confirming. Use stampSlam for
 *             entrances that ARE the commit, stampPress for the button
 *             gesture itself.
 *   REVEAL  = paper.    Content arrives like paper settling on a desk —
 *             gentle rise + fade (fadeUp / stagger.cards / physicalDrop
 *             for singular arrivals). Never showy; reveals happen on every
 *             visit and must stay quiet.
 *   DELETE  = ink fade. Removal dissolves like ink in water (inkFade).
 *             No scaling, no sliding — the thing simply ceases. Applies to
 *             deletes, dismissals, and destructive exits.
 *
 * Usage map:
 * - springs.gentle → parchment-modal entrance
 * - stagger.cards → staggered card entrances
 * - stagger.navItems → sidebar navigation items slide-in
 * - stagger.stampGrid → canon cards stamp-press entrance
 * - toastSlam → antiquarian toast entrance
 * - fadeUp → page sections (the default REVEAL)
 * - hoverLift → card hover elevation
 * - physicalDrop → singular new arrivals (a fresh chapter)
 * - stampSlam → canon/status COMMIT moments
 * - stampPress → whileTap for commit buttons rendered via motion.*
 * - inkFade → DELETE/dismiss exits inside AnimatePresence
 * - cardFlip → reserved for card flip interactions
 */

// ─── Spring Physics Presets ───

export const springs = {
  /** Gentle placement — like setting a book on a shelf */
  gentle: { type: 'spring' as const, stiffness: 120, damping: 20 },
  /** Rubber stamp — quick, decisive press */
  stamp: { type: 'spring' as const, stiffness: 400, damping: 25 },
  /** Wax seal — firm press with slight bounce */
  seal: { type: 'spring' as const, stiffness: 300, damping: 15 },
  /** Heavy tome — slow, weighty motion */
  tome: { type: 'spring' as const, stiffness: 80, damping: 18 },
  /** Card flip — snappy and crisp */
  flip: { type: 'spring' as const, stiffness: 500, damping: 30 },
};

// ─── Stagger Choreography ───

export const stagger = {
  /** Cards fade in + slide up with rotateX tilt */
  cards: (index: number) => ({
    initial: { opacity: 0, y: 20, rotateX: -8 },
    animate: { opacity: 1, y: 0, rotateX: 0 },
    transition: { ...springs.gentle, delay: index * 0.06 },
  }),

  /** Nav items slide in from left */
  navItems: (index: number) => ({
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    transition: { ...springs.gentle, delay: index * 0.04 },
  }),

  /** Stamp grid — scale down from 1.3 with slight rotate */
  stampGrid: (index: number) => ({
    initial: { opacity: 0, scale: 1.3, rotate: -3 },
    animate: { opacity: 1, scale: 1, rotate: 0 },
    transition: { ...springs.stamp, delay: index * 0.05 },
  }),
};

// ─── Physical Animations ───

/** Stamp slam — decisive press onto surface */
export const stampSlam = {
  initial: { scale: 1.5, rotate: -5, opacity: 0 },
  animate: { scale: 1, rotate: 0, opacity: 1 },
  transition: springs.stamp,
};

/** Physical drop — element falls into place */
export const physicalDrop = {
  initial: { y: -100, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { type: 'spring' as const, stiffness: 200, damping: 30 },
};

/** Hover lift — subtle elevation on hover */
export const hoverLift = {
  whileHover: { y: -4, transition: { type: 'spring' as const, stiffness: 300, damping: 20 } },
};

/** Stamp press — the commit gesture on motion buttons (COMMIT verb) */
export const stampPress = {
  whileTap: { scale: 0.96 },
  transition: springs.stamp,
};

/** Ink fade — removal dissolves like ink in water (DELETE verb) */
export const inkFade = {
  exit: { opacity: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/** Card flip — rotateY entrance */
export const cardFlip = {
  initial: { rotateY: -90, opacity: 0 },
  animate: { rotateY: 0, opacity: 1 },
  exit: { rotateY: 90, opacity: 0 },
  transition: springs.flip,
};

// ─── Utility Variants ───

/** Fade-up for general content entrance */
export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: springs.gentle,
};

/** Passed note — a chat message settles like paper slid across a table,
    with the faint rotation of a real sheet (REVEAL verb). User notes tilt
    one way, replies the other; the spring straightens both. */
export const passedNote = (tilt: 1 | -1) => ({
  initial: { opacity: 0, y: 6, rotate: 0.4 * tilt },
  animate: { opacity: 1, y: 0, rotate: 0 },
  transition: springs.gentle,
});

/** Toast slam — enters from above with stamp physics */
export const toastSlam = {
  initial: { opacity: 0, y: -40, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -20, scale: 0.95 },
  transition: springs.stamp,
};
