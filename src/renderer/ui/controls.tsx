import {
  Button as AriaButton,
  Tooltip,
  TooltipTrigger,
  type ButtonProps,
} from "react-aria-components";

export function Button({ className, ...props }: ButtonProps) {
  return <AriaButton {...props} className={`wb-button ${className ?? ""}`} />;
}

export function IconButton({ label, className, ...props }: ButtonProps & { label: string }) {
  return (
    <TooltipTrigger delay={500}>
      <AriaButton {...props} aria-label={label} className={`wb-icon-button ${className ?? ""}`} />
      <Tooltip className="wb-tooltip">{label}</Tooltip>
    </TooltipTrigger>
  );
}
