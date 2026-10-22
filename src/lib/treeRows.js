import { MUNICIPALITY_LIST } from './lagunaBoundaries.js';
import { lguOfTree } from '../hooks/useAttention.js';

/**
 * What the inventory table says of a tree (22 October): its health, who
 * tagged it, and where it stands — the office's barangay, or PGENRO's LGU.
 */

const LGU_LABEL = new Map(MUNICIPALITY_LIST.map((item) => [item.psgc, item.label]));
export const lguLabelOfTree = (tree) => LGU_LABEL.get(Number(lguOfTree(tree))) ?? null;

/** The four hazard flags the field app records, in words, for the health pop-up. */
const WARNINGS = [
  [['isLeaning', 'is_leaning'], 'Leaning'],
  [['hasPowerlineConflict', 'has_powerline_conflict'], 'In conflict with power lines'],
  [['isDecayed', 'is_decayed'], 'Decay or rot'],
  [['isRootProblem', 'is_root_problem'], 'Root problem'],
];

/** The tree's warnings: [] for a healthy tree. Stem quality Code 3 counts too. */
export function healthWarnings(tree) {
  const found = WARNINGS.filter(([keys]) => keys.some((key) => tree?.[key] === true)).map(([, label]) => label);
  if (/code\s*3/i.test(String(tree?.stem_quality ?? ''))) found.push('Stem Code 3 — several defects');
  return found;
}

/**
 * Who tagged it:
 *   a community tag verified into the inventory   "Community"
 *   a tree from the LGU's own inventory file      "LGU inventory file"
 *   a field officer's capture                     the officer's name for the office;
 *                                                 "Field officer · <LGU>" for PGENRO
 * `people` maps an account id to a name; a capture whose account is unknown
 * (saved before 22 October and not in the activity log) is "Field officer".
 */
export function taggedBy(tree, { province = false, people = new Map() } = {}) {
  const source = String(tree?.source ?? '').toLowerCase();
  if (source === 'crowdsource' || source === 'community') return { kind: 'community', label: 'Community' };
  if (source === 'import') return { kind: 'import', label: 'LGU inventory file' };
  if (province) {
    const lgu = lguLabelOfTree(tree);
    return { kind: 'officer', label: lgu ? `Field officer · ${lgu}` : 'Field officer' };
  }
  const name = tree?.captured_by ? people.get(tree.captured_by) : null;
  return { kind: 'officer', label: name ? name : 'Field officer', named: Boolean(name) };
}

/** Where it stands: the barangay for an office, the city or municipality for PGENRO. */
export function placeOfTree(tree, { province = false } = {}) {
  if (province) return lguLabelOfTree(tree) ?? '—';
  return String(tree?.barangay ?? '').trim() || '—';
}

/** "12 m", from the total height the field app recorded (a figure, or a class). */
export function totalHeightText(tree) {
  const raw = String(tree?.total_height ?? '').trim() || String(tree?.heightClass ?? '').trim();
  if (!raw) return '—';
  return /^\d+(\.\d+)?$/.test(raw) ? `${raw} m` : raw;
}

/** The reasons an office gives for archiving a tree, the note added to the one chosen. */
export const ARCHIVE_REASONS = Object.freeze([
  'Cut under a permit',
  'Died or fell',
  'A duplicate record',
  'Recorded in the wrong place',
  'Other',
]);

export function archiveReason(choice, note = '') {
  const extra = String(note ?? '').trim();
  if (!choice) return '';
  return extra ? `${choice} — ${extra}` : choice;
}
