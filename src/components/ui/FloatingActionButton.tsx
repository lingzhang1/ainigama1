import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FloatingActionButtonProps {
  onClick: () => void;
  icon?: React.ReactNode;
  label?: string;
  className?: string;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onClick,
  icon = <Plus className="w-6 h-6" />,
  label,
  className
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-40",
        "flex items-center justify-center gap-2",
        "bg-gradient-to-r from-blue-500 to-blue-600",
        "hover:from-blue-600 hover:to-blue-700",
        "active:scale-95",
        "text-white font-medium",
        "rounded-full shadow-lg hover:shadow-xl",
        "transition-all duration-200 ease-in-out",
        "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2",
        label ? "px-5 py-4 min-w-[56px]" : "w-14 h-14",
        "md:hidden", // Only show on mobile
        className
      )}
      aria-label={label || "Add"}
    >
      {icon}
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
};
