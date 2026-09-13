import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "green" | "gold" | "outline" | "muted";
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className = "",
  variant = "green",
  size = "md",
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center font-medium rounded-full tracking-wide";

  const variantStyles = {
    green: "bg-[#eef5ef] text-[#205823] border border-[#205823]/20",
    gold: "bg-[#fef9e8] text-[#876a16] border border-[#F5D025]/40",
    outline: "bg-white text-[#172019] border border-[#DDE3DE]",
    muted: "bg-[#f0f2f0] text-[#5F6B61] border border-transparent",
  };

  const sizeStyles = {
    sm: "text-[11px] px-2 py-0.5 leading-tight",
    md: "text-xs px-2.5 py-1 leading-normal",
  };

  return (
    <span
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
