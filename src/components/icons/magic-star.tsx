import React from "react";

export function MagicStarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <path d="M12 2.5l2.4 7.1 7.1 2.4-7.1 2.4-2.4 7.1-2.4-7.1-7.1-2.4 7.1-2.4 2.4-7.1z" />
    </svg>
  );
}
