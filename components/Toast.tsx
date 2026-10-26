"use client";

import { CheckIcon } from "./Icons";

export default function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span className="toast-icon" aria-hidden="true">
        <CheckIcon size={12} />
      </span>
      {message}
    </div>
  );
}
