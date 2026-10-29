import NoticeDialog, { noticeHidden } from '../../components/NoticeDialog.jsx';

const HIDDEN_KEY = 'greentag.planNotice.hidden';

/** Whether this browser asked not to be shown the notice again. */
export const planNoticeHidden = () => noticeHidden(HIDDEN_KEY);

/**
 * What the management plan is, and is not, the first time an office opens it
 * (29 October): the outline it follows, that it speaks only for the trees,
 * what is left for the office, and that the page is a preview, completed in
 * Word.
 *
 *   label   "City Biodiversity Management Plan" or "Urban …"
 *   place   the LGU's label, e.g. "Santa Cruz"
 */
export default function PlanNotice({ open, label, place, onClose }) {
  return (
    <NoticeDialog open={open} storageKey={HIDDEN_KEY} title={`About the ${label}`} onClose={onClose}>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          It follows the outline of <strong>DENR-BMB Technical Bulletin No. 2021-04, Annex B</strong>, heading for heading, with its tables and
          the implementation plan template of Annex C.
        </li>
        <li>
          It is composed <strong>only of the trees tagged within {place}’s jurisdiction</strong>, with the land cover, tree planting sites and
          activities your office has recorded. It does not cover other plants or wildlife.
        </li>
        <li>Where the BMB’s TB 2018-02 has a template — the list of green spaces, the flora and fauna lists — the plan uses it.</li>
        <li>
          What the system does not hold is left for your office, in <strong>[square brackets]</strong> and highlighted: the foreword, the
          purpose, the planning process, the vision, mission and goals, the strategies, the financial plan, the monitoring, the fauna and more.
        </li>
        <li>
          <strong>This page is a read-only preview.</strong> Download the Word file and complete the plan there, adding the sections the system
          does not cover.
        </li>
        <li>
          Upon the recommendation of the DENR-LGU Urban Biodiversity Composite Team, the plan is approved by the DENR Regional Executive
          Director and adopted by the LGU through an ordinance or resolution.
        </li>
      </ul>
    </NoticeDialog>
  );
}
