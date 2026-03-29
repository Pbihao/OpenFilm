import { cn } from "@/lib/utils";

interface AixioLogoProps {
  className?: string;
}

export function AixioLogo({ className }: AixioLogoProps) {
  return (
    <svg 
      className={cn("h-8 w-auto text-foreground", className)}
      viewBox="0 0 210 70" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M40 45C40 36.7157 33.2843 30 25 30C16.7157 30 10 36.7157 10 45C10 53.2843 16.7157 60 25 60V70C11.1929 70 0 58.8071 0 45C0 31.1929 11.1929 20 25 20C38.8071 20 50 31.1929 50 45C50 58.8071 38.8071 70 25 70V60C33.2843 60 40 53.2843 40 45Z" fill="currentColor"/>
      <path d="M200 45C200 36.7157 193.284 30 185 30C176.716 30 170 36.7157 170 45C170 53.2843 176.716 60 185 60V70C171.193 70 160 58.8071 160 45C160 31.1929 171.193 20 185 20C198.807 20 210 31.1929 210 45C210 58.8071 198.807 70 185 70V60C193.284 60 200 53.2843 200 45Z" fill="currentColor"/>
      <path d="M42 20H50V70H42L40 60V30L42 20Z" fill="currentColor"/>
      <path d="M80 20H88L105 37L122 20H130V28L113 45L130 62V70H122L105 53L88 70H80V62L97 45L80 28V20Z" fill="currentColor"/>
      <path d="M60 20H70V70H60V20Z" fill="currentColor"/>
      <path d="M60 0H70V10H60V0Z" fill="currentColor"/>
      <path d="M140 0H150V10H140V0Z" fill="currentColor"/>
      <path d="M140 20H150V70H140V20Z" fill="currentColor"/>
    </svg>
  );
}

// Compact icon version - just the "a" symbol
export function AixioLogoIcon({ className }: AixioLogoProps) {
  return (
    <svg 
      className={cn("h-6 w-6 text-foreground", className)}
      viewBox="0 0 50 50" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M30 25C30 16.7157 23.2843 10 15 10C6.71573 10 0 16.7157 0 25C0 33.2843 6.71573 40 15 40V50C1.19288 50 -10 38.8071 -10 25C-10 11.1929 1.19288 0 15 0C28.8071 0 40 11.1929 40 25C40 38.8071 28.8071 50 15 50V40C23.2843 40 30 33.2843 30 25Z" fill="currentColor" transform="translate(5, 0)"/>
      <path d="M32 0H40V50H32L30 40V10L32 0Z" fill="currentColor" transform="translate(5, 0)"/>
    </svg>
  );
}
