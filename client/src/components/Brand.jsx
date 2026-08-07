/**
 * Wordmark. The mark is a sprout drawn as two leaves off one stem — one
 * leaf below the join, one above, for the two halves of the chain the
 * product models (what the farm grows, what the market pays for it).
 *
 * Colour is inherited, so the same lockup works on the dark nav bar and
 * on the sage sign-in field.
 */
export default function Brand() {
  return (
    <span className="brand">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 21V9" />
        <path d="M12 17c-4.4 0-7-3.1-7-7 4.1 0 7 2.6 7 7Z" />
        <path d="M12 14c4.4 0 7-3.1 7-7-4.1 0-7 2.6-7 7Z" />
      </svg>
      KrishiChain
    </span>
  );
}
