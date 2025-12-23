import * as React from "react";

const Progress = ({ className, value = 0, ...props }) => {
  return (
    <div
      className={`relative h-4 w-full overflow-hidden rounded-full bg-secondary ${className || ""}`}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-primary transition-all duration-300 ease-in-out"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
  );
};

export { Progress };
