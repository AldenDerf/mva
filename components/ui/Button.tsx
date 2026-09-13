import React, { forwardRef } from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "gold" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = "primary",
      size = "md",
      fullWidth = false,
      disabled = false,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-colors duration-150 rounded-lg select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] focus-visible:ring-offset-2 cursor-pointer";

    const variantStyles = {
      primary:
        "bg-[#205823] text-white hover:bg-[#17431a] active:bg-[#123615] shadow-xs",
      secondary:
        "border border-[#205823] text-[#205823] bg-transparent hover:bg-[#eef5ef] active:bg-[#d8e8da]",
      gold:
        "bg-[#F5D025] text-[#172019] font-semibold hover:bg-[#e4c01e] active:bg-[#d4b016] shadow-xs",
      ghost:
        "text-[#172019] bg-transparent hover:bg-[#eef5ef] hover:text-[#205823]",
      outline:
        "border border-[#DDE3DE] text-[#172019] bg-white hover:border-[#205823] hover:text-[#205823]",
    };

    const sizeStyles = {
      sm: "text-xs px-3 py-1.5 min-h-[36px] gap-1.5",
      md: "text-sm px-4 py-2 min-h-[42px] gap-2",
      lg: "text-base px-6 py-3 min-h-[48px] gap-2.5 font-semibold",
    };

    const widthStyle = fullWidth ? "w-full" : "";

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
