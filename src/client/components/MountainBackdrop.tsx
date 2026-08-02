/** Fixed alpine silhouette behind Chat / Voting / Places. Decorative only. */
export function MountainBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
    >
      <svg
        className="absolute inset-x-0 bottom-0 h-[55%] w-full text-brand opacity-[0.07] dark:opacity-[0.12]"
        viewBox="0 0 800 360"
        preserveAspectRatio="xMidYMax slice"
        fill="currentColor"
      >
        {/* Far range */}
        <path d="M0 360 V220 L70 160 L140 210 L220 90 L310 200 L380 130 L460 205 L540 70 L620 190 L700 120 L800 200 V360 Z" />
        {/* Mid range */}
        <path
          className="opacity-80"
          d="M0 360 V260 L90 200 L160 245 L250 150 L340 240 L420 180 L510 250 L590 160 L680 230 L760 190 L800 230 V360 Z"
        />
        {/* Near foothills */}
        <path
          className="opacity-70"
          d="M0 360 V300 L120 250 L210 290 L300 230 L400 285 L500 240 L600 290 L700 255 L800 280 V360 Z"
        />
      </svg>

      {/* Soft snow highlight on the highest ridge */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[55%] w-full text-ink opacity-[0.03] dark:text-white dark:opacity-[0.04]"
        viewBox="0 0 800 360"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M220 90 L250 130 M540 70 L570 115 M700 120 L725 155" strokeLinecap="round" />
      </svg>
    </div>
  );
}
