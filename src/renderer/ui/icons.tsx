type IconProps = { size?: number };

function Icon({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const PlusIcon = ({ size }: IconProps) => <Icon size={size}><path d="M12 5v14M5 12h14" /></Icon>;
export const CloseIcon = ({ size }: IconProps) => <Icon size={size}><path d="m7 7 10 10M17 7 7 17" /></Icon>;
export const AgentIcon = ({ size }: IconProps) => <Icon size={size}><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M9 12h.01M15 12h.01M9 15h6M12 7V4M9 4h6" /></Icon>;
export const TerminalIcon = ({ size }: IconProps) => <Icon size={size}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></Icon>;
export const FolderIcon = ({ size }: IconProps) => <Icon size={size}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z" /></Icon>;
export const SettingsIcon = ({ size }: IconProps) => <Icon size={size}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.36.37.68.66.94.3.25.68.4 1.06.4H21v4h-.09a1.7 1.7 0 0 0-1.5.66Z" /></Icon>;
export const SparkIcon = ({ size }: IconProps) => <Icon size={size}><path d="m12 3 1.2 4.1a5 5 0 0 0 3.7 3.7L21 12l-4.1 1.2a5 5 0 0 0-3.7 3.7L12 21l-1.2-4.1a5 5 0 0 0-3.7-3.7L3 12l4.1-1.2a5 5 0 0 0 3.7-3.7z" /></Icon>;
export const SlidersIcon = ({ size }: IconProps) => <Icon size={size}><path d="M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4" /></Icon>;
export const SendIcon = ({ size }: IconProps) => <Icon size={size}><path d="m21 3-7 18-4-7-7-4zM10 14 21 3" /></Icon>;
export const ChevronDownIcon = ({ size }: IconProps) => <Icon size={size}><path d="m7 10 5 5 5-5" /></Icon>;
export const MoreIcon = ({ size }: IconProps) => <Icon size={size}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>;
export const TrashIcon = ({ size }: IconProps) => <Icon size={size}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></Icon>;
export const EditIcon = ({ size }: IconProps) => <Icon size={size}><path d="m4 16-1 5 5-1L19 9l-4-4zM13.5 6.5l4 4" /></Icon>;
